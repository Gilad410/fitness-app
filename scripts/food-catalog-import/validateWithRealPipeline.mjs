// Re-validates the entire source-provided batch (715 within-scope +
// 58 bonus) through the ACTUAL, already-tested application pipeline
// (src/features/nutrition/lib/openFoodFactsCandidateMapping.js +
// foodCatalogImportValidation.js) instead of trusting the ad-hoc
// sourceImport.mjs reimplementation. This is the programmatic,
// row-by-row comparison against the real source records: for every
// target barcode, the RAW OFF product object (as actually cached) is
// mapped and validated by the real code path, and the result is
// compared against sourceImport.mjs's independent categorization --
// any mismatch is a bug in one of the two and is reported, not
// silently reconciled.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mapOffProductToCandidate } from '../../src/features/nutrition/lib/openFoodFactsCandidateMapping.js'
import { validateImportCandidate } from '../../src/features/nutrition/lib/foodCatalogImportValidation.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

// --- Build the same raw-OFF lookup sourceImport.mjs used ---
const offByBarcode = new Map()
for (let i = 1; i <= 10; i++) {
  const p = rd(`raw/off_israel_page_${String(i).padStart(3, '0')}.json`)
  for (const prod of p.products) offByBarcode.set(prod.code, prod)
}
const indivDir = path.join(here, 'raw_individual')
for (const f of readdirSync(indivDir)) {
  if (!f.endsWith('.json')) continue
  const bc = f.replace('.json', '')
  if (offByBarcode.has(bc)) continue
  try {
    const d = JSON.parse(readFileSync(path.join(indivDir, f), 'utf8'))
    if (d.status === 1 && d.product) offByBarcode.set(bc, d.product)
  } catch { /* skip */ }
}

const priorReady = new Set([
  ...rd('out/SOURCE_IMPORT_CATEGORIZED.json').ready_100g.map(r => r.barcode),
  ...rd('out/SOURCE_IMPORT_CATEGORIZED.json').ready_100ml.map(r => r.barcode),
])
const bonusBarcodes = new Set(rd('out/ADDITIONAL_BEYOND_1000_POOL.json').map(r => r.barcode))
const allTargets = new Set([...priorReady, ...bonusBarcodes])

const validCandidates = []
const rejectedByRealPipeline = []
const mismatches = []
const retrievedAt = new Date().toISOString().slice(0, 10)

for (const bc of allTargets) {
  const off = offByBarcode.get(bc)
  const priorSaidReady = priorReady.has(bc)
  if (!off) {
    rejectedByRealPipeline.push({ barcode: bc, reason: 'not found in cache (should not happen)' })
    if (priorSaidReady) mismatches.push({ barcode: bc, issue: 'prior pipeline said ready, but no raw record found now' })
    continue
  }
  const mapped = mapOffProductToCandidate(off, { retrievedAt })
  if (mapped.rejected) {
    rejectedByRealPipeline.push({ barcode: bc, reason: mapped.reason })
    if (priorSaidReady) mismatches.push({ barcode: bc, issue: `prior pipeline (sourceImport.mjs) said READY, but the REAL mapper rejects it: ${mapped.reason}` })
    continue
  }
  const validation = validateImportCandidate(mapped.candidate)
  if (!validation.valid) {
    rejectedByRealPipeline.push({ barcode: bc, reason: validation.errors.join('; ') })
    if (priorSaidReady) mismatches.push({ barcode: bc, issue: `prior pipeline said READY, but real validateImportCandidate rejects it: ${validation.errors.join('; ')}` })
    continue
  }
  if (!priorSaidReady) mismatches.push({ barcode: bc, issue: 'real pipeline accepts this candidate, but it was NOT in the prior ready list (bonus find or prior pipeline under-included it)' })

  validCandidates.push({
    barcode: bc,
    name: mapped.candidate.name,
    nameHe: mapped.candidate.nameHe,
    nameEn: mapped.candidate.nameEn,
    brand: mapped.candidate.brand,
    category: mapped.candidate.category,
    calories: mapped.candidate.caloriesPer100g,
    caloriesUnit: mapped.candidate.caloriesUnit,
    caloriesConvertedFromKj: mapped.candidate.caloriesConvertedFromKj,
    protein: mapped.candidate.proteinPer100g,
    measurementBasis: mapped.candidate.measurementBasis,
    sourceUrl: mapped.candidate.sourceUrl,
    verificationStatus: mapped.candidate.verificationStatus,
    needsReview: validation.needsReview,
    macroCheck: validation.macroCheck,
    dedupeKey: validation.dedupeKey,
    outOfOriginalScope: bonusBarcodes.has(bc),
  })
}

writeFileSync(path.join(here, 'out/REAL_PIPELINE_VALID_CANDIDATES.json'), JSON.stringify(validCandidates, null, 2))
writeFileSync(path.join(here, 'out/REAL_PIPELINE_REJECTED.json'), JSON.stringify(rejectedByRealPipeline, null, 2))
writeFileSync(path.join(here, 'out/REAL_PIPELINE_MISMATCHES.json'), JSON.stringify(mismatches, null, 2))

console.log('=== Real-pipeline row-by-row re-validation ===')
console.log('Total targets checked:', allTargets.size)
console.log('Valid per REAL pipeline:', validCandidates.length)
console.log('Rejected by REAL pipeline:', rejectedByRealPipeline.length)
console.log('Mismatches vs. prior sourceImport.mjs categorization:', mismatches.length)
if (mismatches.length) {
  console.log('\nMismatch details:')
  for (const m of mismatches) console.log(' -', m.barcode, ':', m.issue)
}
const needsReview = validCandidates.filter(c => c.needsReview)
console.log('\nCandidates flagged needsReview (macro-consistency check, Atwater factor):', needsReview.length)
for (const c of needsReview.slice(0, 20)) console.log(' -', c.barcode, c.name, JSON.stringify(c.macroCheck))
const convertedFromKj = validCandidates.filter(c => c.caloriesConvertedFromKj)
console.log('\nCandidates whose calories were derived from kJ (documented conversion, not invented):', convertedFromKj.length)
