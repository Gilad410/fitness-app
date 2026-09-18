import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupBarcode, isPlausibleBarcode, SOURCE_OPEN_FOOD_FACTS } from './barcodeLookup.js'

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

test('lookupBarcode: a found product missing even a name resolves to no_nutrition_data with productName null', async () => {
  const fetchImpl = fakeFetch({
    status: 1,
    product: { nutriments: { 'energy-kcal_100g': 100 } },
  })
  const result = await lookupBarcode('4006381333931', { fetchImpl })
  assert.equal(result.status, 'no_nutrition_data')
  assert.equal(result.productName, null)
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
