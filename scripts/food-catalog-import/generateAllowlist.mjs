// Generates the authoritative import-ELIGIBLE list from a POSITIVE
// allowlist -- the inverse of generateBlockedList.mjs's approach.
// A product is eligible ONLY if it appears in MASTER_AUDIT_976.json
// with outcome === 'VERIFIED' AND twoReaderConfirmed === true. A
// barcode that is simply ABSENT from the ledger is never eligible --
// this guards against the failure mode where a missing blocklist
// entry silently makes an unreviewed product importable.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const master = JSON.parse(readFileSync(path.join(here, 'out/MASTER_AUDIT_976.json'), 'utf8'))
const bucket2 = JSON.parse(readFileSync(path.join(here, 'out/bucket2_remaining.json'), 'utf8'))
const bucketArr = Array.isArray(bucket2) ? bucket2 : (bucket2.items || Object.values(bucket2))
const cohortBarcodes = new Set(bucketArr.map(x => x.barcode))

const eligible = {}
const notEligibleReasons = {}

for (const barcode of cohortBarcodes) {
  const rec = master[barcode]
  if (!rec) {
    notEligibleReasons[barcode] = 'ABSENT_FROM_LEDGER -- no audit record exists for this barcode at all; never eligible regardless of blocklist state'
    continue
  }
  if (rec.outcome === 'VERIFIED' && rec.twoReaderConfirmed === true) {
    eligible[barcode] = { barcode, name: rec.name, caloriesPer100g: rec.storedCalories, proteinPer100g: rec.storedProtein, evidence: rec.evidence, track: rec.track }
  } else if (rec.outcome === 'VERIFIED' && rec.twoReaderConfirmed !== true) {
    notEligibleReasons[barcode] = `VERIFIED_BUT_SINGLE_READER_ONLY -- outcome is VERIFIED but twoReaderConfirmed is not true; does not meet the two-independent-readings requirement`
  } else {
    notEligibleReasons[barcode] = `${rec.outcome}${rec.evidence ? ' -- ' + String(rec.evidence).slice(0, 200) : ''}`
  }
}

writeFileSync(path.join(here, 'out/IMPORT_ALLOWLIST.json'), JSON.stringify(eligible, null, 2))
writeFileSync(path.join(here, 'out/IMPORT_NOT_ELIGIBLE.json'), JSON.stringify(notEligibleReasons, null, 2))

console.log(`Cohort size: ${cohortBarcodes.size}`)
console.log(`ELIGIBLE (positive allowlist, VERIFIED + two-reader confirmed): ${Object.keys(eligible).length}`)
console.log(`NOT eligible: ${Object.keys(notEligibleReasons).length}`)
console.log(`Check: ${Object.keys(eligible).length + Object.keys(notEligibleReasons).length} should equal cohort size ${cohortBarcodes.size}`)

// Cross-check against the earlier 20-item sample-pass exclusions and
// the (now partially recovered) earlier-24 pool for overlap -- these
// must stay explicitly separate and never silently merge into this
// cohort's allowlist.
const earlierExclusions = JSON.parse(readFileSync(path.join(here, 'manual_verification_exclusions.json'), 'utf8'))
const exclBarcodes = new Set(earlierExclusions.map(e => e.barcode))
const overlapWithExclusions = [...cohortBarcodes].filter(b => exclBarcodes.has(b))
console.log(`Overlap between 976-cohort and earlier-20-exclusions (should be 0): ${overlapWithExclusions.length}`)

try {
  const the24 = JSON.parse(readFileSync(path.join(here, 'out/RECOVERED_24_CANDIDATE.json'), 'utf8'))
  const the24Barcodes = new Set(the24.map(x => x.barcode))
  const overlapWith24 = [...cohortBarcodes].filter(b => the24Barcodes.has(b))
  console.log(`Overlap between 976-cohort and earlier-24 (should be 0): ${overlapWith24.length}`)
} catch { /* not yet recovered */ }
