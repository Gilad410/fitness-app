// Reconciles a blind second-reader batch (for the reopened no-photo-track
// items, or for "the 24") against the preserved first read, producing a
// genuine two-independent-readings determination.
//
// FIXED (confirmed approval defect, barcode 72917589): this script used to
// set outcome='verified' the instant the two readers agreed with each
// other, leaving the actual comparison against the STORED value to a
// "downstream master-rebuild step" that never actually performed it
// (regenerateMasterAudit.mjs just copies this outcome field verbatim).
// Net effect: reader-agreement alone could produce a VERIFIED record even
// when both readers' agreed value plainly did NOT match stored (6.6g vs
// stored 6.8g protein). Fixed: reader-agreement (readersAgree, a tight
// transcription-noise check) now ONLY gates whether we trust the reading
// at all; the actual VERIFIED/CORRECTION_PROPOSED decision is made HERE,
// immediately, via decideOutcome() -- strict rounded-exact comparison
// against stored (no percentage tolerance), plus identity/basis/prep-
// state gating. See nutritionReconcile.mjs and its regression tests.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readersAgree, decideOutcome } from './nutritionReconcile.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const bucket2 = JSON.parse(readFileSync(path.join(here, 'out/bucket2_remaining.json'), 'utf8'))
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const storedByBarcode = new Map(bucketArr.map(x => [x.barcode, x]))

const [, , batchPath, target] = process.argv
if (!batchPath || !target) {
  console.error('Usage: node reconcileSecondReads.mjs <second-read-batch.json> <reopened|the24>')
  process.exit(1)
}
const secondReads = JSON.parse(readFileSync(batchPath, 'utf8'))

if (target === 'reopened') {
  const srPath = path.join(here, 'ledger/search_results.json')
  const sr = JSON.parse(readFileSync(srPath, 'utf8'))
  let verified = 0, corrected = 0, unresolved = 0, skipped = 0, needsTiebreak = 0, guardedSkipped = 0
  for (const r2 of secondReads) {
    const bc = r2.barcode
    const rec = sr[bc]
    if (!rec || !rec._firstRead) { skipped++; continue }
    // Merge guard: this barcode was already reconciled by an earlier batch
    // (e.g. a duplicate/stale agent result for a chunk that was already
    // merged from a different dispatch -- a real, repeated failure mode
    // this session). Do not silently re-merge over an already-confirmed
    // result; a genuinely intentional re-reconciliation should go through
    // recalculateWithFixedLogic.mjs instead, not a second dispatch batch.
    if (rec.secondRead && rec.twoReaderConfirmed === true) {
      guardedSkipped++
      console.warn(`  GUARDED: ${bc} already has a merged secondRead (twoReaderConfirmed) -- this result was IGNORED, not re-merged.`)
      continue
    }
    const r1 = rec._firstRead
    const stored = storedByBarcode.get(bc)
    if (!r2.legible || r2.evidenceCalories == null || r2.evidenceProtein == null) {
      rec.outcome = 'unresolved'
      rec.notes = `Second read could not confirm both values (legible=${r2.legible}, cal=${r2.evidenceCalories}, prot=${r2.evidenceProtein}). First read: ${JSON.stringify(r1)}. Two independent legible readings required.`
      delete rec.blocker
      unresolved++
      continue
    }
    const calAgree = readersAgree(r1.evidenceCalories, r2.evidenceCalories, 'calories')
    const protAgree = readersAgree(r1.evidenceProtein, r2.evidenceProtein, 'protein')
    if (calAgree && protAgree) {
      rec.evidenceCalories = r2.evidenceCalories
      rec.evidenceProtein = r2.evidenceProtein
      rec.basis = r2.basis || rec.basis
      rec.prepState = r2.prepState || rec.prepState
      rec.secondRead = r2
      rec.twoReaderConfirmed = true
      if (!stored) {
        rec.outcome = 'unresolved'
        rec.notes = `Readers agree (${r2.evidenceCalories}kcal/${r2.evidenceProtein}g) but no stored value found for this barcode to compare against -- cannot classify verified vs correction.`
        unresolved++
      } else {
        const decision = decideOutcome({
          resolvedCalories: r2.evidenceCalories, resolvedProtein: r2.evidenceProtein,
          resolvedBasis: r2.basis, resolvedPrepState: r2.prepState,
          identityMatch1: r1.identityMatch || 'unclear', identityMatch2: r2.identityMatch || 'unclear',
          storedCalories: stored.calories, storedProtein: stored.protein,
        })
        rec.outcome = decision.outcome.toLowerCase()
        rec.notes = `Readers agree: ${r2.evidenceCalories}kcal/${r2.evidenceProtein}g per ${r2.basis}. ${decision.reason}`
        if (decision.outcome === 'VERIFIED') verified++
        else if (decision.outcome === 'CORRECTION_PROPOSED') corrected++
        else unresolved++
      }
      delete rec.blocker
    } else {
      rec.outcome = 'unresolved'
      rec.secondRead = r2
      rec.notes = `Reader disagreement: first read cal=${r1.evidenceCalories}/prot=${r1.evidenceProtein}, second read cal=${r2.evidenceCalories}/prot=${r2.evidenceProtein}. calAgree=${calAgree}, protAgree=${protAgree}. Not resolved by majority vote -- needs a manual tie-breaking third read.`
      delete rec.blocker
      unresolved++
      needsTiebreak++
    }
  }
  writeFileSync(srPath, JSON.stringify(sr, null, 2))
  console.log(`Processed ${secondReads.length}: verified=${verified}, correction_proposed=${corrected}, unresolved=${unresolved} (of which needing tiebreak=${needsTiebreak}), skipped(no first read found)=${skipped}, guarded-skipped(already confirmed)=${guardedSkipped}`)
} else if (target === 'the24') {
  // Handled by a dedicated script since it needs both reader1 and reader2 inputs plus stored values.
  console.error('For "the24", use reconcileThe24.mjs instead (needs both reader1 and reader2 batches).')
  process.exit(1)
}
