// Recalculates every EXISTING VERIFIED / CORRECTION_PROPOSED classification
// across all three saved-evidence sources (no-photo search_results.json,
// with-photo reconciled_with_photo.json, earlier-24 the24_reconciled.json)
// using the FIXED decideOutcome() logic (nutritionReconcile.mjs), from
// already-saved evidence only -- no new agent dispatches, no re-review of
// products whose evidence is unchanged. Records with missing/contradictory
// evidence are left as UNRESOLVED/PENDING (untouched, since there is
// nothing new to recalculate there).
//
// Prints an exact list of every barcode whose classification CHANGED as a
// direct result of the fix, separate from the ongoing audit's organic
// progress, so the two are never conflated in the final report.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { decideOutcome } from './nutritionReconcile.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const bucket2 = rd('out/bucket2_remaining.json')
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const storedByBarcode = new Map(bucketArr.map(x => [x.barcode, x]))

const changes = [] // {source, barcode, name, before, after, reason}

// --- 1. no-photo track: ledger/search_results.json ---
const srPath = path.join(here, 'ledger/search_results.json')
const sr = rd('ledger/search_results.json')
for (const bc in sr) {
  const rec = sr[bc]
  if (rec.outcome !== 'verified' && rec.outcome !== 'correction_proposed') continue
  if (rec.evidenceCalories == null || rec.evidenceProtein == null) continue
  const stored = storedByBarcode.get(bc)
  if (!stored) continue
  const identityMatch1 = rec._firstRead?.identityMatch || rec.reader1?.identityMatch || 'unclear'
  const identityMatch2 = rec.secondRead?.identityMatch || rec.reader2?.identityMatch || 'unclear'
  const decision = decideOutcome({
    resolvedCalories: rec.evidenceCalories, resolvedProtein: rec.evidenceProtein,
    resolvedBasis: rec.basis, resolvedPrepState: rec.prepState,
    identityMatch1, identityMatch2,
    storedCalories: stored.calories, storedProtein: stored.protein,
  })
  const before = rec.outcome.toUpperCase()
  const after = decision.outcome
  if (before !== after) {
    changes.push({ source: '976-cohort (no_photo)', barcode: bc, name: stored.name, before, after, reason: decision.reason })
    rec.outcome = after.toLowerCase()
    rec.notes = `[Recalculated with fixed logic] ${decision.reason} (Previous outcome was ${before}, set under the old tolerance-based reconciler.) Prior notes: ${rec.notes}`
  }
}
writeFileSync(srPath, JSON.stringify(sr, null, 2))

// --- 2. with-photo track: ledger/reconciled_with_photo.json ---
const wpPath = path.join(here, 'ledger/reconciled_with_photo.json')
const wpRaw = rd('ledger/reconciled_with_photo.json')
const wpArr = Array.isArray(wpRaw) ? wpRaw : Object.values(wpRaw)
for (const rec of wpArr) {
  if (rec.finalOutcome !== 'VERIFIED' && rec.finalOutcome !== 'CORRECTION_PROPOSED') continue
  const evCal = rec.reader2?.evidenceCalories ?? rec.reader1?.evidenceCalories
  const evProt = rec.reader2?.evidenceProtein ?? rec.reader1?.evidenceProtein
  if (evCal == null || evProt == null) continue
  const decision = decideOutcome({
    resolvedCalories: evCal, resolvedProtein: evProt,
    resolvedBasis: rec.reader2?.basis || rec.reader1?.basis, resolvedPrepState: rec.reader2?.prepState || rec.reader1?.prepState,
    identityMatch1: rec.reader1?.identityMatch || 'unclear', identityMatch2: rec.reader2?.identityMatch || 'unclear',
    storedCalories: rec.storedCalories, storedProtein: rec.storedProtein,
  })
  const before = rec.finalOutcome
  const after = decision.outcome
  if (before !== after) {
    changes.push({ source: '976-cohort (with_photo)', barcode: rec.barcode, name: rec.name, before, after, reason: decision.reason })
    rec.finalOutcome = after
    rec.justification = `[Recalculated with fixed logic] ${decision.reason} (Previous outcome was ${before}.) Prior justification: ${rec.justification}`
  }
}
writeFileSync(wpPath, JSON.stringify(Array.isArray(wpRaw) ? wpArr : Object.fromEntries(wpArr.map(r => [r.barcode, r])), null, 2))

// --- 3. earlier-24: ledger/the24_reconciled.json ---
const t24Path = path.join(here, 'ledger/the24_reconciled.json')
const t24Raw = rd('ledger/the24_reconciled.json')
for (const bc in t24Raw) {
  const rec = t24Raw[bc]
  if (rec.finalOutcome !== 'VERIFIED' && rec.finalOutcome !== 'CORRECTION_PROPOSED') continue
  const evCal = rec.reader1?.evidenceCalories
  const evProt = rec.reader1?.evidenceProtein
  if (evCal == null || evProt == null) continue
  const decision = decideOutcome({
    resolvedCalories: evCal, resolvedProtein: evProt,
    resolvedBasis: rec.reader1?.basis, resolvedPrepState: rec.reader1?.prepState,
    identityMatch1: rec.reader1?.identityMatch || 'unclear', identityMatch2: rec.reader2?.identityMatch || 'unclear',
    storedCalories: rec.storedCalories, storedProtein: rec.storedProtein,
  })
  const before = rec.finalOutcome
  const after = decision.outcome
  if (before !== after) {
    changes.push({ source: 'earlier-24', barcode: bc, name: rec.name, before, after, reason: decision.reason })
    rec.finalOutcome = after
    rec.justification = `[Recalculated with fixed logic] ${decision.reason} (Previous outcome was ${before}.) Prior justification: ${rec.justification}`
    if (after === 'CORRECTION_PROPOSED') { rec.proposedCalories = evCal; rec.proposedProtein = evProt }
    else { delete rec.proposedCalories; delete rec.proposedProtein }
  }
}
writeFileSync(t24Path, JSON.stringify(t24Raw, null, 2))

console.log(`\n=== Recalculation complete: ${changes.length} classification(s) changed by the fix ===`)
for (const c of changes) {
  console.log(`  [${c.source}] ${c.barcode} (${c.name}): ${c.before} -> ${c.after}`)
  console.log(`    ${c.reason}`)
}
writeFileSync(path.join(here, 'ledger/RECALCULATION_CHANGES.json'), JSON.stringify(changes, null, 2))
console.log('\nFull change list saved to: ledger/RECALCULATION_CHANGES.json')
