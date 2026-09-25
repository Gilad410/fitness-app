// Fetches individual OFF products (the /api/v2/product/{barcode}.json
// endpoint, confirmed NOT subject to the block that hits /api/v2/search
// -- see the dry-run report for the investigation) for a list of
// barcodes discovered via Search-a-licious. Respects OFF's documented
// per-IP product-read ceiling (15/min) with a safety margin (~4.5s
// spacing, ~13.3/min). Resumable: skips any barcode whose output file
// already exists, so re-running after an interruption continues rather
// than restarting.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(here, 'raw_individual')
mkdirSync(outDir, { recursive: true })

const toFetch = JSON.parse(readFileSync(path.join(here, '../../scripts/food-catalog-import/out_barcodes_to_fetch.json'), 'utf8'))
const LIMIT = Number(process.argv[2] ?? 900) // how many NEW barcodes to fetch this run

const FIELDS = [
  'code', 'product_name', 'product_name_he', 'generic_name', 'brands', 'lang',
  'countries_tags', 'nutrition_data_per', 'nutrition_data_prepared_per',
  'no_nutrition_data', 'nutriments', 'quantity', 'serving_size', 'categories_tags',
].join(',')
const UA = 'FitnessAppFoodCatalogImport/1.0 (dry-run; contact: giladma2006@gmail.com)'
const SPACING_MS = 4500

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

let fetched = 0
let skippedAlreadyDone = 0
let failed = 0

for (const code of toFetch) {
  if (fetched >= LIMIT) break
  const outFile = path.join(outDir, `${code}.json`)
  if (existsSync(outFile)) {
    skippedAlreadyDone++
    continue
  }
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    )
    if (res.status === 200) {
      const body = await res.json()
      writeFileSync(outFile, JSON.stringify(body))
      fetched++
      if (fetched % 25 === 0) console.log(`fetched ${fetched}/${LIMIT} (skipped-already-done: ${skippedAlreadyDone}, failed: ${failed})`)
    } else {
      failed++
      console.log(`${code} -> HTTP ${res.status}`)
    }
  } catch (e) {
    failed++
    console.log(`${code} -> ERROR ${e.message}`)
  }
  await sleep(SPACING_MS)
}

console.log(`DONE this run. fetched=${fetched} skippedAlreadyDone=${skippedAlreadyDone} failed=${failed}`)
