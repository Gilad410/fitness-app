import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupBarcode, isPlausibleBarcode, normalizeBarcode, SOURCE_OPEN_FOOD_FACTS } from './barcodeLookup.js'

function fakeFetch(response, { ok = true, status = 200, throwOnFetch = false, throwOnJson = false } = {}) {
  return async () => {
    if (throwOnFetch) throw new Error('network down')
    return {
      ok,
      status,
      json: async () => {
        if (throwOnJson) throw new Error('bad json')
        return response
      },
    }
  }
}

// ---------------------------------------------------------------------
// normalizeBarcode -- the single funnel point found missing during a
// real investigation (barcode 7622202268298: approved and saved, but
// not reused on the next scan). Every caller that stores, looks up, or
// sends a barcode anywhere now goes through this first.
// ---------------------------------------------------------------------

test('normalizeBarcode: trims surrounding whitespace', () => {
  assert.equal(normalizeBarcode('  7622202268298  '), '7622202268298')
})

test('normalizeBarcode: an already-clean barcode passes through unchanged', () => {
  assert.equal(normalizeBarcode('7622202268298'), '7622202268298')
})

test('normalizeBarcode: coerces null/undefined to an empty string, never throws', () => {
  assert.equal(normalizeBarcode(null), '')
  assert.equal(normalizeBarcode(undefined), '')
})

test('normalizeBarcode: coerces a non-string (e.g. a number, if a caller ever passed one) to its string form', () => {
  assert.equal(normalizeBarcode(7622202268298), '7622202268298')
})

test('isPlausibleBarcode and lookupBarcode agree on the normalized form of a barcode entered with incidental whitespace -- the exact class of mismatch the fix closes', async () => {
  assert.equal(isPlausibleBarcode('  7622202268298  '), true)
  const fetchImpl = fakeFetch({ status: 0 })
  const result = await lookupBarcode('  7622202268298  ', { fetchImpl })
  assert.equal(result.barcode, normalizeBarcode('  7622202268298  '))
  assert.equal(result.barcode, '7622202268298')
})

test('isPlausibleBarcode: accepts common EAN-8/UPC-A/EAN-13/GTIN-14 lengths', () => {
  assert.equal(isPlausibleBarcode('12345670'), true) // EAN-8
  assert.equal(isPlausibleBarcode('012345678905'), true) // UPC-A (12)
  assert.equal(isPlausibleBarcode('4006381333931'), true) // EAN-13
  assert.equal(isPlausibleBarcode('10012345678902'), true) // GTIN-14
})

test('isPlausibleBarcode: rejects obviously-wrong input without a network call', () => {
  assert.equal(isPlausibleBarcode(''), false)
  assert.equal(isPlausibleBarcode('abc'), false)
  assert.equal(isPlausibleBarcode('123'), false)
  assert.equal(isPlausibleBarcode(null), false)
  assert.equal(isPlausibleBarcode(undefined), false)
})

test('lookupBarcode: an implausible barcode short-circuits to invalid_barcode, never calling fetch', async () => {
  let called = false
  const fetchImpl = async () => { called = true }
  const result = await lookupBarcode('xx', { fetchImpl })
  assert.equal(result.status, 'invalid_barcode')
  assert.equal(called, false)
})

test('lookupBarcode: a found product with full nutrition data resolves to status "found"', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Test Cereal', nutriments: { 'energy-kcal_100g': 375, 'proteins_100g': 8.2 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.deepEqual(result.product, {
    name: 'Test Cereal',
    caloriesPer100g: 375,
    proteinPer100g: 8.2,
    preparedCaloriesPer100g: null,
    preparedProteinPer100g: null,
    source: SOURCE_OPEN_FOOD_FACTS,
    sourceUrl: 'https://world.openfoodfacts.org/product/4006381333931',
  })
})

test('lookupBarcode: a found product with unknown protein resolves proteinPer100g to null, not 0', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Mystery Snack', nutriments: { 'energy-kcal_100g': 500 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.proteinPer100g, null)
})

test('lookupBarcode: status 0 (product genuinely not in the database) resolves to not_found', async () => {
  const fetchImpl = fakeFetch({ status: 0 })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'not_found')
})

test('lookupBarcode: a found product missing calories data resolves to no_nutrition_data, distinct from not_found', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Incomplete Entry', nutriments: {} },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'no_nutrition_data')
  assert.equal(result.productName, 'Incomplete Entry')
})

test('lookupBarcode: a product with calories but no name in any of the 4 tried fields still resolves to "found", with a neutral placeholder name -- missing name is not the same problem as missing nutrition', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { nutriments: { 'energy-kcal_100g': 100 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.name, 'מוצר ללא שם')
  assert.equal(result.product.caloriesPer100g, 100)
})

// ---------------------------------------------------------------------
// The Milka case this module was built to fix: a product Open Food
// Facts DOES have a name for, but whose calories aren't under the one
// field the previous version read -- these must all still resolve to
// "found" via barcodeNutrientExtraction.js's fallback chain, not
// "no_nutrition_data", since the data genuinely is there.
// ---------------------------------------------------------------------

test('lookupBarcode: a product with only energy in kJ (no kcal field) still resolves to "found" via unit conversion', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Milka Alpenmilch', nutriments: { energy_100g: 1569, proteins_100g: 6.3 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.name, 'Milka Alpenmilch')
  assert.equal(result.product.caloriesPer100g, 375) // 1569 / 4.184
  assert.equal(result.product.proteinPer100g, 6.3)
})

test('lookupBarcode: a product with only per-serving values and a real serving_quantity still resolves to "found" via per-100g scaling', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: {
      product_name: 'Milka Small Bar',
      serving_quantity: 25,
      nutriments: { 'energy-kcal_serving': 100, proteins_serving: 2 },
    },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.caloriesPer100g, 400) // 100 kcal / 25g * 100
  assert.equal(result.product.proteinPer100g, 8) // 2g / 25g * 100
})

test('lookupBarcode: falls back to product_name_en when product_name is empty, alongside a kJ-only energy value', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: '', product_name_en: 'Milka Alpine Milk', nutriments: { energy_100g: 1569 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.name, 'Milka Alpine Milk')
})

test('lookupBarcode: a product genuinely missing calories under every fallback (no kcal, no kJ, no per-serving, no serving_quantity) still resolves to no_nutrition_data -- the fallback chain does not manufacture a value where none exists', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Milka Something', nutriments: { carbohydrates_100g: 40, 'energy-kcal_serving': 100 } }, // per-serving present but no serving_quantity to scale it with
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'no_nutrition_data')
  assert.equal(result.productName, 'Milka Something')
})

test('lookupBarcode: a non-OK HTTP response resolves to status "error" with the status code in the message', async () => {
  const fetchImpl = fakeFetch({}, { ok: false, status: 503 })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'error')
  assert.match(result.message, /503/)
})

test('lookupBarcode: a network failure (fetch throws) resolves to status "error", never rejects', async () => {
  const fetchImpl = fakeFetch({}, { throwOnFetch: true })
  await assert.doesNotReject(async () => {
    const result = await lookupBarcode('4006381333931', { fetchImpl })
    assert.equal(result.status, 'error')
  })
})

test('lookupBarcode: an unparsable JSON response resolves to status "error", never rejects', async () => {
  const fetchImpl = fakeFetch({}, { throwOnJson: true })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'error')
})

test('lookupBarcode: trims whitespace from manually-typed input before validating/searching', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Test', nutriments: { 'energy-kcal_100g': 100 } },
  })
  const result = await lookupBarcode('  4006381333931  ', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.barcode, '4006381333931')
})

// ---------------------------------------------------------------------
// Prepared (as-eaten/cooked) basis -- the pasta-nutrition-basis
// investigation. product.preparedCaloriesPer100g/preparedProteinPer100g
// are extracted alongside the as-sold figures on every 'found' result;
// barcodeNutritionBasis.js decides what to do with them. Real field
// shapes verified against live Open Food Facts data before writing
// these (see barcodeNutrientExtraction.js's own comment).
// ---------------------------------------------------------------------

test('lookupBarcode: dry pasta (as-sold data only, no `_prepared` fields) -- the real, common shape for plain dry pasta -- resolves preparedCaloriesPer100g/preparedProteinPer100g to null, never inventing them', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { product_name: 'Penne Rigate', nutriments: { 'energy-kcal_100g': 360, proteins_100g: 12 } },
  })
  const result = await lookupBarcode('8076800195057', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.caloriesPer100g, 360)
  assert.equal(result.product.preparedCaloriesPer100g, null)
  assert.equal(result.product.preparedProteinPer100g, null)
})

test('lookupBarcode: a product with ONLY prepared-basis data (the real barcode 8852018101024 shape, "Yum Yum Chicken Flavour" instant noodles -- no as-sold energy-kcal_100g/proteins_100g at all) resolves to "found", not "no_nutrition_data"', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: {
      product_name: 'Yum Yum Chicken Flavour',
      nutriments: { 'energy-kcal_prepared_100g': 76, proteins_prepared_100g: 1.3 },
    },
  })
  const result = await lookupBarcode('8852018101024', { fetchImpl })
  assert.equal(result.status, 'found', 'real prepared-basis data exists -- must not be reported as missing nutrition data')
  assert.equal(result.product.caloriesPer100g, null)
  assert.equal(result.product.preparedCaloriesPer100g, 76)
  assert.equal(result.product.preparedProteinPer100g, 1.3)
})

test('lookupBarcode: a product with BOTH as-sold and prepared-basis data resolves "found" with both sets of real figures populated', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: {
      product_name: 'Instant Rice',
      nutriments: {
        'energy-kcal_100g': 360,
        proteins_100g: 7,
        'energy-kcal_prepared_100g': 130,
        proteins_prepared_100g: 2.5,
      },
    },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'found')
  assert.equal(result.product.caloriesPer100g, 360)
  assert.equal(result.product.preparedCaloriesPer100g, 130)
  assert.equal(result.product.proteinPer100g, 7)
  assert.equal(result.product.preparedProteinPer100g, 2.5)
})
