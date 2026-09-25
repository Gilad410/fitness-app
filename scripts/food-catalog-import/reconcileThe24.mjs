// Reconciles reader1 + reader2 blind batches for "the 24" against the
// stored values recovered via set-difference (out/RECOVERED_24_CANDIDATE.json).
// Same deterministic, non-majority-vote philosophy as reconcileLedger.mjs.
//
// FIXED (confirmed approval defect, see nutritionReconcile.mjs): reader
// agreement and stored-value agreement are now two separate, narrower
// checks -- readersAgree() (tight transcription-noise tolerance) gates
// whether we trust the reading; decideOutcome() (strict rounded-exact
// comparison, no percentage tolerance, plus identity/basis gating) makes
// the actual VERIFIED/CORRECTION_PROPOSED decision.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readersAgree, decideOutcome } from './nutritionReconcile.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const [, , r1Path, r2Path] = process.argv
if (!r1Path || !r2Path) {
  console.error('Usage: node reconcileThe24.mjs <reader1.json> <reader2.json>')
  process.exit(1)
}
const reader1 = JSON.parse(readFileSync(r1Path, 'utf8'))
const reader2 = JSON.parse(readFileSync(r2Path, 'utf8'))
const worklist = JSON.parse(readFileSync(path.join(here, 'ledger/the24_worklist.json'), 'utf8'))
const byBarcode = {}
for (const w of worklist) byBarcode[w.barcode] = w

const r2ByBarcode = {}
for (const r of reader2) r2ByBarcode[r.barcode] = r

const results = {}
for (const r1 of reader1) {
  const bc = r1.barcode
  const r2 = r2ByBarcode[bc]
  const w = byBarcode[bc]
  const entry = {
    barcode: bc, name: w ? w.name : null, storedCalories: w ? w.storedCalories : null, storedProtein: w ? w.storedProtein : null,
    reader1: r1, reader2: r2 || null, finalOutcome: 'PENDING', justification: '',
  }
  if (!r2) { entry.justification = 'reader2 result missing'; results[bc] = entry; continue }
  if (!r1.legible || r1.evidenceCalories == null || r1.evidenceProtein == null || !r2.legible || r2.evidenceCalories == null || r2.evidenceProtein == null) {
    entry.finalOutcome = 'UNRESOLVED'
    entry.justification = `One or both readers could not read both values legibly. r1: legible=${r1.legible}, cal=${r1.evidenceCalories}, prot=${r1.evidenceProtein}. r2: legible=${r2.legible}, cal=${r2.evidenceCalories}, prot=${r2.evidenceProtein}.`
    results[bc] = entry; continue
  }
  const calAgree = readersAgree(r1.evidenceCalories, r2.evidenceCalories, 'calories')
  const protAgree = readersAgree(r1.evidenceProtein, r2.evidenceProtein, 'protein')
  if (!calAgree || !protAgree) {
    entry.finalOutcome = 'UNRESOLVED'
    entry.justification = `Readers disagree: r1 cal=${r1.evidenceCalories}/prot=${r1.evidenceProtein}, r2 cal=${r2.evidenceCalories}/prot=${r2.evidenceProtein}. calAgree=${calAgree}, protAgree=${protAgree}. Needs a tie-breaking third read, not resolved by majority vote.`
    results[bc] = entry; continue
  }
  if (!w) {
    entry.finalOutcome = 'UNRESOLVED'
    entry.justification = 'Readers agree but no stored value found for this barcode to compare against.'
    results[bc] = entry; continue
  }
  const decision = decideOutcome({
    resolvedCalories: r1.evidenceCalories, resolvedProtein: r1.evidenceProtein,
    resolvedBasis: r1.basis, resolvedPrepState: r1.prepState,
    identityMatch1: r1.identityMatch || 'unclear', identityMatch2: r2.identityMatch || 'unclear',
    storedCalories: w.storedCalories, storedProtein: w.storedProtein,
  })
  entry.finalOutcome = decision.outcome
  entry.justification = `Both readers independently agree: ${r1.evidenceCalories}kcal/${r1.evidenceProtein}g per ${r1.basis}. ${decision.reason}`
  if (decision.outcome === 'CORRECTION_PROPOSED') {
    entry.proposedCalories = r1.evidenceCalories
    entry.proposedProtein = r1.evidenceProtein
  }
  results[bc] = entry
}
writeFileSync(path.join(here, 'ledger/the24_reconciled.json'), JSON.stringify(results, null, 2))
const counts = {}
for (const e of Object.values(results)) counts[e.finalOutcome] = (counts[e.finalOutcome] || 0) + 1
console.log('the24 reconciliation counts:', JSON.stringify(counts))
const flagged = Object.values(results).filter(e => e.justification.includes('calAgree'))
console.log('Real disagreements needing tie-break:', flagged.length, flagged.map(e => e.barcode))
