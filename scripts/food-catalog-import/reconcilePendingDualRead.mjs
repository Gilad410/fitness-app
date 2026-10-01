// Reconciles a dual-blind-read batch for previously-PENDING no-photo-track
// items that turned out to have an unexplored nutrition-photo URL. Both
// readers work blind (no stored values, no first-read bias) in parallel,
// so this single reconciliation IS both "first" and "second" reading at
// once. Writes results directly into ledger/search_results.json (the
// authoritative no-photo ledger), same shape/outcome vocabulary as the
// rest of the pipeline, so regenerateMasterAudit.mjs picks it up as-is.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readersAgree, decideOutcome } from './nutritionReconcile.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const [, , r1Path, r2Path] = process.argv
if (!r1Path || !r2Path) {
  console.error('Usage: node reconcilePendingDualRead.mjs <reader1.json> <reader2.json>')
  process.exit(1)
}
const reader1 = JSON.parse(readFileSync(r1Path, 'utf8'))
const reader2 = JSON.parse(readFileSync(r2Path, 'utf8'))
const bucket2 = JSON.parse(readFileSync(path.join(here, 'out/bucket2_remaining.json'), 'utf8'))
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const storedByBarcode = new Map(bucketArr.map(x => [x.barcode, x]))

const searchResultsPath = path.join(here, 'ledger/search_results.json')
const searchResults = JSON.parse(readFileSync(searchResultsPath, 'utf8'))

const r2ByBarcode = new Map(reader2.map(r => [r.barcode, r]))

let verified = 0, corrected = 0, unresolved = 0, missing = 0, guardedSkipped = 0
const tieBreakNeeded = []

for (const r1 of reader1) {
  const bc = r1.barcode
  const r2 = r2ByBarcode.get(bc)
  const stored = storedByBarcode.get(bc)
  const existing = searchResults[bc] || {}

  // Merge guard: never let a fresh dual-read dispatch overwrite an already
  // completed, two-reader-confirmed review -- this worklist should only
  // ever have contained genuinely-PENDING barcodes, but a stale/duplicated
  // dispatch (e.g. a redundant retry of an already-merged chunk) must not
  // be able to clobber real, newer, accepted results.
  if (existing.twoReaderConfirmed === true && (existing.outcome === 'verified' || existing.outcome === 'correction_proposed')) {
    guardedSkipped++
    console.warn(`  GUARDED: ${bc} is already ${existing.outcome} (twoReaderConfirmed) -- this dual-read result was IGNORED, not merged.`)
    continue
  }

  if (!r2) { missing++; continue }

  const bothLegible = r1.legible && r1.evidenceCalories != null && r1.evidenceProtein != null &&
                       r2.legible && r2.evidenceCalories != null && r2.evidenceProtein != null

  if (!bothLegible) {
    searchResults[bc] = {
      ...existing,
      outcome: 'unresolved',
      evidenceCalories: r1.evidenceCalories ?? r2.evidenceCalories ?? null,
      evidenceProtein: r1.evidenceProtein ?? r2.evidenceProtein ?? null,
      basis: r1.basis || r2.basis || 'unclear',
      prepState: r1.prepState || r2.prepState || 'unclear',
      notes: `Dual-blind-read: one or both readers could not read both values legibly. r1: legible=${r1.legible}, cal=${r1.evidenceCalories}, prot=${r1.evidenceProtein}, notes="${r1.notes}". r2: legible=${r2.legible}, cal=${r2.evidenceCalories}, prot=${r2.evidenceProtein}, notes="${r2.notes}".`,
      reader1: r1, reader2: r2,
    }
    delete searchResults[bc].blocker
    unresolved++
    continue
  }

  const calAgree = readersAgree(r1.evidenceCalories, r2.evidenceCalories, 'calories')
  const protAgree = readersAgree(r1.evidenceProtein, r2.evidenceProtein, 'protein')
  const identityConflict = r1.identityMatch === 'no' || r2.identityMatch === 'no'

  if (!calAgree || !protAgree || identityConflict) {
    searchResults[bc] = {
      ...existing,
      outcome: 'unresolved',
      evidenceCalories: r1.evidenceCalories,
      evidenceProtein: r1.evidenceProtein,
      basis: r1.basis,
      prepState: r1.prepState,
      notes: identityConflict
        ? `Dual-blind-read IDENTITY CONFLICT: r1 identityMatch=${r1.identityMatch}, r2 identityMatch=${r2.identityMatch}. r1 notes="${r1.notes}" r2 notes="${r2.notes}"`
        : `Dual-blind-read disagreement: r1 cal=${r1.evidenceCalories}/prot=${r1.evidenceProtein}, r2 cal=${r2.evidenceCalories}/prot=${r2.evidenceProtein}. calAgree=${calAgree}, protAgree=${protAgree}. Needs manual tie-break, not resolved by majority vote.`,
      reader1: r1, reader2: r2,
    }
    delete searchResults[bc].blocker
    unresolved++
    if (!identityConflict) tieBreakNeeded.push(bc)
    continue
  }

  if (!stored) {
    searchResults[bc] = {
      ...existing, outcome: 'unresolved', evidenceCalories: r1.evidenceCalories, evidenceProtein: r1.evidenceProtein,
      basis: r1.basis, prepState: r1.prepState,
      notes: 'Readers agree but no stored value found for this barcode to compare against.',
      reader1: r1, reader2: r2,
    }
    delete searchResults[bc].blocker
    unresolved++
    continue
  }
  const decision = decideOutcome({
    resolvedCalories: r1.evidenceCalories, resolvedProtein: r1.evidenceProtein,
    resolvedBasis: r1.basis, resolvedPrepState: r1.prepState,
    identityMatch1: r1.identityMatch, identityMatch2: r2.identityMatch,
    storedCalories: stored.calories, storedProtein: stored.protein,
  })
  searchResults[bc] = {
    ...existing,
    outcome: decision.outcome.toLowerCase(),
    evidenceCalories: r1.evidenceCalories,
    evidenceProtein: r1.evidenceProtein,
    basis: r1.basis,
    prepState: r1.prepState,
    notes: `Dual-blind-read (both readers as first+second independent readings): both agree ${r1.evidenceCalories}kcal/${r1.evidenceProtein}g per ${r1.basis}. ${decision.reason}`,
    reader1: r1, reader2: r2,
    twoReaderConfirmed: true,
  }
  delete searchResults[bc].blocker
  if (decision.outcome === 'VERIFIED') verified++
  else if (decision.outcome === 'CORRECTION_PROPOSED') corrected++
  else unresolved++
}

writeFileSync(searchResultsPath, JSON.stringify(searchResults, null, 2))
console.log(`Processed ${reader1.length}: verified=${verified}, correction_proposed=${corrected}, unresolved=${unresolved} (of which needing manual tie-break=${tieBreakNeeded.length}), missing-reader2=${missing}, guarded-skipped(already confirmed)=${guardedSkipped}`)
if (tieBreakNeeded.length) console.log('Tie-break needed for:', tieBreakNeeded)
