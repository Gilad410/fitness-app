import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupCachedProduct, withCachedProduct } from './barcodeProductCache.js'

test('lookupCachedProduct: returns null for a barcode never approved', () => {
  assert.equal(lookupCachedProduct({}, '7622202268298'), null)
})

test('withCachedProduct: does not mutate the input object (returns a new one)', () => {
  const before = {}
  const after = withCachedProduct(before, '7622202268298', { product_name: 'x' })
  assert.deepEqual(before, {})
  assert.notEqual(before, after)
})

// ---------------------------------------------------------------------
// The exact round trip requested: approve -> save -> scan again ->
// automatic reuse of the approved name/calories/protein. This mirrors
// what coachBarcodeProducts.js's save()/lookup() do internally (see
// that store's own use of these exact two functions), without needing
// to mock Supabase -- the network round-trip itself follows this
// codebase's established convention of not being unit tested (same as
// foods.js/nutritionLogs.js), but the cache mechanics that decide
// "was this barcode approved, will the next scan reuse it" are fully
// exercised here.
// ---------------------------------------------------------------------

test('approve -> save -> scan again -> automatic reuse (full round trip using only the pure cache operations)', () => {
  const barcode = '7622202268298'
  let byBarcode = {}

  // 1. First scan: nothing approved yet for this barcode.
  assert.equal(lookupCachedProduct(byBarcode, barcode), null)

  // 2. Coach enters and approves nutrition values manually. This shape
  // matches exactly what coach_barcode_products (046) would return
  // from a real upsert().select().single() call -- coachBarcodeProducts.js's
  // save() calls withCachedProduct with this same row shape.
  const approvedRow = {
    coach_id: 'coach-1',
    barcode,
    product_name: 'Milka Something',
    calories_per_100g: 512,
    protein_per_100g: 6.4,
  }
  byBarcode = withCachedProduct(byBarcode, barcode, approvedRow)

  // 3. Scanning the SAME barcode again automatically reuses the
  // approved name, calories, and protein -- no re-entry needed.
  const reused = lookupCachedProduct(byBarcode, barcode)
  assert.deepEqual(reused, approvedRow)
  assert.equal(reused.product_name, 'Milka Something')
  assert.equal(reused.calories_per_100g, 512)
  assert.equal(reused.protein_per_100g, 6.4)
})

test('approving one barcode does not affect lookup for a different barcode', () => {
  let byBarcode = {}
  byBarcode = withCachedProduct(byBarcode, '7622202268298', { product_name: 'Milka A' })
  assert.equal(lookupCachedProduct(byBarcode, '4006381333931'), null)
  assert.equal(lookupCachedProduct(byBarcode, '7622202268298').product_name, 'Milka A')
})

test('re-approving the same barcode overwrites the previous value, not a growing list -- matches the real upsert(coach_id, barcode) semantics', () => {
  const barcode = '7622202268298'
  let byBarcode = {}
  byBarcode = withCachedProduct(byBarcode, barcode, { product_name: 'First guess', calories_per_100g: 400 })
  byBarcode = withCachedProduct(byBarcode, barcode, { product_name: 'Corrected name', calories_per_100g: 512 })

  const reused = lookupCachedProduct(byBarcode, barcode)
  assert.equal(reused.product_name, 'Corrected name')
  assert.equal(reused.calories_per_100g, 512)
  assert.equal(Object.keys(byBarcode).length, 1, 'must not accumulate duplicate entries for the same barcode')
})

test('an unknown protein value in the approved row stays null on reuse, never coerced to 0', () => {
  const barcode = '7622202268298'
  let byBarcode = {}
  byBarcode = withCachedProduct(byBarcode, barcode, { product_name: 'x', calories_per_100g: 300, protein_per_100g: null })
  assert.equal(lookupCachedProduct(byBarcode, barcode).protein_per_100g, null)
})
