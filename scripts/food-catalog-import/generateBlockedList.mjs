// Generates the authoritative import-blocklist from the ACTUAL audit
// records -- never hand-maintained, to avoid the kind of transcription
// drift that caused real problems at smaller scale earlier this
// session. Any barcode whose recorded outcome is not exactly VERIFIED
// is blocked from import eligibility immediately, per instruction:
// this only prevents import, it does NOT apply any correction and
// does NOT modify the accepted candidate values.
//
// Source priority for the with-photo-140 track: reconciled_with_photo.json
// (the double-reader-reconciled ledger, which supersedes the older
// reader1-only audit_outcomes.json) is authoritative wherever a
// barcode appears in it. audit_outcomes.json is kept only as a
// fallback for any with-photo item that somehow isn't in the
// reconciled ledger yet.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

const reconciled = existsSync(path.join(here, 'ledger/reconciled_with_photo.json'))
  ? JSON.parse(readFileSync(path.join(here, 'ledger/reconciled_with_photo.json'), 'utf8'))
  : {}
const outcomes = existsSync(path.join(here, 'out/audit_outcomes.json'))
  ? JSON.parse(readFileSync(path.join(here, 'out/audit_outcomes.json'), 'utf8'))
  : {}
const phaseA = existsSync(path.join(here, 'out/audit_phase_a.json'))
  ? JSON.parse(readFileSync(path.join(here, 'out/audit_phase_a.json'), 'utf8'))
  : {}
const searchResults = existsSync(path.join(here, 'ledger/search_results.json'))
  ? JSON.parse(readFileSync(path.join(here, 'ledger/search_results.json'), 'utf8'))
  : {}
const earlierExclusions = JSON.parse(readFileSync(path.join(here, 'manual_verification_exclusions.json'), 'utf8'))

const blocked = {}
for (const item of earlierExclusions) {
  blocked[item.barcode] = { source: 'earlier_100_item_sample', outcome: item.status, reason: item.reason }
}
// Phase A's own mechanical determinations (no photo available / API
// error / fetch error) ARE a recorded, reasoned UNRESOLVED/PENDING
// outcome -- "evidence missing" is exactly what the instruction asks
// to record, not a gap to leave out of the reviewed/blocked totals
// just because no human judgment call was needed. Only applies to
// no-photo items that ALSO have no search_results.json entry yet
// (a completed manufacturer-evidence search supersedes this).
for (const [barcode, rec] of Object.entries(phaseA)) {
  if (rec.outcome === 'unresolved' && !rec.photoDownloaded && !searchResults[barcode]) {
    blocked[barcode] = { source: 'full_976_audit_no_evidence_pending_search', outcome: 'pending', reason: rec.outcomeReason }
  }
}
// No-photo track: manufacturer-evidence search results, once completed.
for (const [barcode, rec] of Object.entries(searchResults)) {
  const outcome = (rec.outcome || '').toUpperCase()
  if (outcome !== 'VERIFIED') {
    blocked[barcode] = { source: 'full_976_audit_no_photo_search', outcome: rec.outcome, reason: rec.notes }
  }
}
// With-photo track: reader1-only fallback (should be empty once reconciled_with_photo.json covers all 140).
for (const [barcode, rec] of Object.entries(outcomes)) {
  if (!reconciled[barcode] && rec.outcome !== 'verified') {
    blocked[barcode] = { source: 'full_976_audit_reviewed_reader1_only', outcome: rec.outcome, reason: rec.reason }
  }
}
// With-photo track: authoritative double-reader-reconciled ledger.
for (const [barcode, rec] of Object.entries(reconciled)) {
  if (rec.finalOutcome !== 'VERIFIED') {
    blocked[barcode] = { source: 'full_976_audit_with_photo_reconciled', outcome: rec.finalOutcome, reason: rec.justification }
  }
}

writeFileSync(path.join(here, 'out/blocked_from_import.json'), JSON.stringify(blocked, null, 2))

const withPhotoVerified = Object.values(reconciled).filter(r => r.finalOutcome === 'VERIFIED').length
const withPhotoTotal = Object.keys(reconciled).length
const searchCounts = {}
for (const r of Object.values(searchResults)) {
  const k = (r.outcome || 'unknown').toLowerCase()
  searchCounts[k] = (searchCounts[k] || 0) + 1
}
const searchTotal = Object.keys(searchResults).length
console.log(`Blocked from import: ${Object.keys(blocked).length} total`)
console.log(`  earlier 100-item sample pass exclusions: ${earlierExclusions.length}`)
console.log(`With-photo track (140 total): ${withPhotoVerified} VERIFIED / ${withPhotoTotal} reconciled`)
console.log(`No-photo search track (836 total): ${searchTotal} attempted this session -- ${JSON.stringify(searchCounts)}`)
console.log(`  (of which 'pending' = WebSearch was unavailable, item was NOT actually completed, needs re-attempt; 'unresolved' = search completed, no adequate evidence found)`)
console.log(`  no-photo items never yet attempted (still mechanically pending from Phase A): ${836 - searchTotal}`)
