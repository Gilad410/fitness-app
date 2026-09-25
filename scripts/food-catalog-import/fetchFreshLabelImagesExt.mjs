// Fetches CURRENT nutrition-label image URLs for the 50-item verification
// sample directly from the live individual-product API
// (world.openfoodfacts.org/api/v2/product/{barcode}.json,
// image_nutrition_url field) -- NOT from the stale Search-a-licious
// index (confirmed stale, last_indexed_datetime 2024-10-26, used in the
// previous pass and found to mostly 404). Paced at the same documented-
// compliant ~4.5s spacing as the main retrieval.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const sample = JSON.parse(readFileSync(path.join(here, 'out/sample_50_extension.json'), 'utf8'))
const UA = 'FitnessAppFoodCatalogImport/1.0 (dry-run; contact: giladma2006@gmail.com)'
const FIELDS = 'code,product_name,product_name_he,brands,countries_tags,nutrition_data_per,image_nutrition_url,image_nutrition_small_url,image_front_url'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const results = []
for (const item of sample) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${item.barcode}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 200) {
      const body = await res.json()
      const p = body.product || {}
      results.push({
        barcode: item.barcode,
        name: item.name,
        storedCalories: item.calories,
        storedProtein: item.protein,
        liveProductName: p.product_name || p.product_name_he || null,
        liveBrands: p.brands || null,
        liveCountriesTags: p.countries_tags || null,
        liveNutritionDataPer: p.nutrition_data_per || null,
        imageNutritionUrl: p.image_nutrition_url || null,
        status: body.status,
      })
    } else {
      results.push({ barcode: item.barcode, name: item.name, error: `HTTP ${res.status}` })
    }
  } catch (e) {
    results.push({ barcode: item.barcode, name: item.name, error: e.message })
  }
  await sleep(4500)
}

writeFileSync(path.join(here, 'out/sample_50_extension_fresh_images.json'), JSON.stringify(results, null, 2))
console.log(`Done. ${results.filter((r) => r.imageNutritionUrl).length}/${results.length} have a current nutrition-label image URL.`)
console.log(JSON.stringify(results, null, 2))
