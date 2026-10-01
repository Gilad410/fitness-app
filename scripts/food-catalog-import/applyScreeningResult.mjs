// Applies a single-pass evidence-screening result (routing only, NOT
// verification) to search_results.json. Items screened "usable" are
// written to a dual-reader worklist file for the next dispatch; items
// screened "unusable" (or unresolved-after-one-focused-check) are routed
// directly to PENDING with the exact missing-evidence reason recorded,
// WITHOUT wasting a full two-reader dispatch on evidence already known
// to be insufficient.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const [, , screeningResultPath, dualReadQueueOutPath] = process.argv
if (!screeningResultPath || !dualReadQueueOutPath) {
  console.error('Usage: node applyScreeningResult.mjs <screening_result.json> <dual_read_queue_out.json>')
  process.exit(1)
}

const screening = JSON.parse(readFileSync(screeningResultPath, 'utf8'))
const searchResultsPath = path.join(here, 'ledger/search_results.json')
const searchResults = JSON.parse(readFileSync(searchResultsPath, 'utf8'))

const usableForDualRead = []
let routedPending = 0, routedUsable = 0, guardedSkipped = 0

for (const s of screening) {
  const bc = s.barcode
  const existing = searchResults[bc] || {}
  // Merge guard: a completed, evidence-backed, two-reader-confirmed review
  // must never be silently overwritten by a screening pass (screening is a
  // routing step for UNFINISHED work, never a re-review). This is the fix
  // for the "stale screening overwrites a completed review" failure mode.
  if (existing.twoReaderConfirmed === true && (existing.outcome === 'verified' || existing.outcome === 'correction_proposed')) {
    guardedSkipped++
    console.warn(`  GUARDED: ${bc} is already ${existing.outcome} (twoReaderConfirmed) -- screening result IGNORED, not overwritten. If this is deliberate (e.g. a confirmed defect fix), use a dedicated recalculation script instead of screening.`)
    continue
  }
  if (s.screeningResult === 'usable') {
    usableForDualRead.push({ barcode: bc, name: s.name, sourceUrl: s.sourceUrl })
    routedUsable++
    // Leave outcome as pending for now -- the dual-read dispatch will set the final outcome.
    searchResults[bc] = {
      ...existing,
      notes: `[Screening] Usable evidence confirmed (${s.evidenceType}): ${s.notes}`,
    }
  } else {
    routedPending++
    searchResults[bc] = {
      ...existing,
      outcome: 'pending',
      notes: `[Screening -- single focused pass, routing only, not a verification attempt] Evidence type: ${s.evidenceType}. Missing: ${(s.missingInfo || []).join(', ') || 'n/a'}. ${s.notes}`,
      blocker: s.blocker || 'No usable nutrition-table evidence at the accessible source(s); needs WebSearch to locate an alternate image or manufacturer page.',
    }
    delete searchResults[bc].evidenceCalories
    delete searchResults[bc].evidenceProtein
  }
}

writeFileSync(searchResultsPath, JSON.stringify(searchResults, null, 2))
writeFileSync(path.join(here, dualReadQueueOutPath), JSON.stringify(usableForDualRead, null, 2))
console.log(`Screened ${screening.length}: usable->dual-read queue=${routedUsable}, routed straight to PENDING=${routedPending}, guarded-skipped(already confirmed)=${guardedSkipped}`)
console.log(`Dual-read queue written to: ${dualReadQueueOutPath}`)
