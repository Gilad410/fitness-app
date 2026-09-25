// Builds the "source-provided / not independently verified" import batch,
// per the updated workflow: for remaining new candidates (PENDING or
// UNRESOLVED-purely-due-to-no-evidence-found, i.e. NOT a documented
// discrepancy), accept OpenFoodFacts data directly -- no photo, no
// second reader, no manufacturer search required. This is an IMPORT-
// INTEGRITY check (identity/basis/units/missing-data/malformed/dup),
// explicitly NOT a nutritional audit.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const categorization = rd('out/CATEGORIZATION_976.json')
const targets = [...categorization.pending, ...categorization.unresolved_no_evidence]

const bucket2 = rd('out/bucket2_remaining.json')
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const bucketByBarcode = new Map(bucketArr.map(x => [x.barcode, x]))

// --- Build a barcode -> OFF product lookup from all cached sources ---
const offByBarcode = new Map()
for (let i = 1; i <= 10; i++) {
  const p = rd(`raw/off_israel_page_${String(i).padStart(3, '0')}.json`)
  for (const prod of p.products) offByBarcode.set(prod.code, prod)
}
const indivDir = path.join(here, 'raw_individual')
for (const f of readdirSync(indivDir)) {
  if (!f.endsWith('.json')) continue
  const bc = f.replace('.json', '')
  if (offByBarcode.has(bc)) continue // prefer bulk-page data already loaded; individual is a fallback
  try {
    const d = JSON.parse(readFileSync(path.join(indivDir, f), 'utf8'))
    if (d.status === 1 && d.product) offByBarcode.set(bc, d.product)
  } catch { /* skip unreadable */ }
}

const results = {
  ready_100g: [],       // clean per-100g, ready to import
  ready_100ml: [],      // per-100ml, flagged distinctly -- not silently merged with 100g
  incompatible_basis: [], // serving-basis (no reliable deterministic gram conversion) or truly ambiguous
  missing_data: [],     // OFF has no usable calories/protein for this exact barcode
  malformed: [],        // present but implausible/invalid (out of the production schema's own bounds: 0-900 kcal, 0-100g protein)
  not_found: [],        // barcode not found on OFF at all
}

for (const bc of targets) {
  const item = bucketByBarcode.get(bc)
  const name = item ? item.name : '(unknown)'
  const off = offByBarcode.get(bc)

  if (!off) {
    results.not_found.push({ barcode: bc, name, reason: 'Barcode not found in any cached OFF source (bulk pages, individual cache, or live fetch).' })
    continue
  }
  if (off.code && off.code !== bc) {
    results.not_found.push({ barcode: bc, name, reason: `OFF record's own code field ("${off.code}") does not match the requested barcode -- identity check failed.` })
    continue
  }

  const per = off.nutrition_data_per
  const nutr = off.nutriments || {}
  const kcal = nutr['energy-kcal_100g']
  const protein = nutr['proteins_100g']
  const offName = off.product_name || off.generic_name || ''
  const brand = off.brands || ''

  if (kcal == null || protein == null || per == null) {
    results.missing_data.push({
      barcode: bc, name, offName, brand,
      reason: `Missing required field(s): nutrition_data_per=${per ?? 'MISSING'}, energy-kcal_100g=${kcal ?? 'MISSING'}, proteins_100g=${protein ?? 'MISSING'}. Treated as missing, not zero.`,
    })
    continue
  }
  if (typeof kcal !== 'number' || typeof protein !== 'number' || Number.isNaN(kcal) || Number.isNaN(protein)) {
    results.malformed.push({ barcode: bc, name, offName, reason: `Non-numeric value: kcal=${JSON.stringify(kcal)}, protein=${JSON.stringify(protein)}.` })
    continue
  }
  // Malformed/implausible check -- mirrors the production schema's own bounds
  // (calories_per_100g 0-900, protein_per_100g 0-100) so nothing that would
  // violate the DB constraint even reaches the "ready" list.
  if (kcal < 0 || kcal > 900 || protein < 0 || protein > 100) {
    results.malformed.push({ barcode: bc, name, offName, kcal, protein, reason: `Value out of the production schema's plausible bounds (calories 0-900, protein 0-100): kcal=${kcal}, protein=${protein}.` })
    continue
  }

  const entry = { barcode: bc, name, offName, brand, calories: kcal, protein, basis: per, sourceRef: `https://world.openfoodfacts.org/product/${bc}` }

  if (per === '100g') {
    results.ready_100g.push(entry)
  } else if (per === '100ml') {
    results.ready_100ml.push({ ...entry, note: 'Basis is per-100ml (liquid product). The production schema only has calories_per_100g/protein_per_100g columns (no separate per-100ml column) -- flagged distinctly rather than silently merged with solid per-100g items. Standard practice treats 100ml of a beverage as ~100g for these purposes, but this is called out explicitly for your decision, not applied silently.' })
  } else {
    results.incompatible_basis.push({ barcode: bc, name, offName, basis: per, calories: kcal, protein, reason: `Basis is "${per}" -- not per-100g/100ml, and no reliable deterministic gram-weight conversion is available without inventing a serving weight. Set aside, not imported.` })
  }
}

writeFileSync(path.join(here, 'out/SOURCE_IMPORT_CATEGORIZED.json'), JSON.stringify(results, null, 2))

console.log('=== Source-import categorization (976-cohort remaining candidates) ===')
console.log('Target pool (PENDING + UNRESOLVED-no-evidence):', targets.length)
for (const k in results) console.log(` ${k}: ${results[k].length}`)
const total = Object.values(results).reduce((a, b) => a + b.length, 0)
console.log('Total categorized:', total, '(should equal target pool)', total === targets.length ? 'OK' : 'MISMATCH')
