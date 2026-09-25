// Merges one search_batch_chunkN.json into the authoritative
// ledger/search_results.json, applying two standing correction rules
// (per explicit user instruction) to every batch from here on:
//
// 1. "compositional/definitional grounds" (e.g. pure salt, pure
//    honey) never verifies a product on its own -- if that's the only
//    reasoning behind a 'verified' outcome, downgrade to 'unresolved'.
//    Real evidence (a readable photo, or a manufacturer page) covering
//    BOTH calories and protein is required.
// 2. WebSearch being unavailable (shared session budget exhausted) is
//    an EXECUTION LIMITATION, not proof no evidence exists. An item
//    whose notes say the search step itself could not run gets marked
//    'pending' (work not completed) rather than 'unresolved' (work
//    completed, evidence genuinely absent) -- with a blocker note.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const batchPath = process.argv[2]
if (!batchPath) {
  console.error('Usage: node mergeSearchBatch.mjs <path-to-search_batch_chunkN.json>')
  process.exit(1)
}

const resultsPath = path.join(here, 'ledger/search_results.json')
const existing = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {}
const incoming = JSON.parse(readFileSync(batchPath, 'utf8'))

let added = 0, skipped = 0, reclassifiedComposition = 0, reclassifiedPending = 0

for (const item of incoming) {
  if (existing[item.barcode]) { skipped++; continue }
  const { barcode, ...rest } = item

  const notesLower = (rest.notes || '').toLowerCase()
  if (rest.outcome === 'verified' && (notesLower.includes('compositional') || notesLower.includes('definitional'))) {
    rest.outcome = 'unresolved'
    rest.notes = `[Reclassified per updated rule: compositional/definitional reasoning alone does not verify a product -- exact-product photo/manufacturer evidence for BOTH calories and protein is required.] ${rest.notes}`
    reclassifiedComposition++
  }

  const websearchBlocked = ['websearch unavailable', 'websearch was unavailable', 'web search unavailable', 'web search tool was unavailable', 'websearch tool unavailable', 'websearch budget']
    .some(phrase => notesLower.includes(phrase))
  if (websearchBlocked && rest.outcome === 'unresolved') {
    rest.outcome = 'pending'
    rest.blocker = 'WebSearch tool unavailable this session (shared budget exhausted) -- the manufacturer-search step was not actually performed for this item, only OpenFoodFacts API/photo check and/or direct URL guesses via WebFetch. Needs a real search retry, not a completed non-result.'
    reclassifiedPending++
  }

  existing[barcode] = rest
  added++
}

writeFileSync(resultsPath, JSON.stringify(existing, null, 2))
console.log(`Merged ${batchPath}: added ${added}, skipped (dup) ${skipped}`)
console.log(`  reclassified compositional-verified -> unresolved: ${reclassifiedComposition}`)
console.log(`  reclassified websearch-unavailable -> pending: ${reclassifiedPending}`)
console.log(`Total in search_results.json: ${Object.keys(existing).length}`)
const counts = {}
for (const e of Object.values(existing)) counts[e.outcome] = (counts[e.outcome] || 0) + 1
console.log('Outcome counts:', JSON.stringify(counts))
