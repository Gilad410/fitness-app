import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupCachedProduct, withCachedProduct } from './barcodeProductCache.js'
import { normalizeBarcode } from './barcodeLookup.js'

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

// ---------------------------------------------------------------------
// Reproduces the exact reported failure: barcode 7622202268298 was
// manually entered, approved, and saved -- but scanning the same
// barcode again did not remember it. Root-caused to normalization not
// being centralized: nothing guaranteed the string used to key the
// cache at save time was byte-identical to the string used to look it
// up later, even though the specific path tested traced out equal.
// coachBarcodeProducts.js (the real store) now funnels every barcode
// through normalizeBarcode() before it ever touches byBarcode -- this
// proves that guarantee holds even when the raw input differs (e.g. a
// manual re-entry with incidental extra whitespace, or a value that
// arrived as something other than an already-trimmed string).
// ---------------------------------------------------------------------

test('approve with one raw barcode representation, look up with a differently-formatted-but-equivalent one -- reuse still succeeds once both go through normalizeBarcode() (the exact 7622202268298 failure, now closed)', () => {
  let byBarcode = {}

  // First entry: manually typed with incidental whitespace, as
  // real-world manual entry commonly has.
  const firstEntryRaw = '  7622202268298  '
  const saveKey = normalizeBarcode(firstEntryRaw)
  const approvedRow = {
    coach_id: 'coach-1',
    barcode: saveKey,
    product_name: 'Milka (ידני)',
    calories_per_100g: 534,
    protein_per_100g: 6.3,
  }
  byBarcode = withCachedProduct(byBarcode, saveKey, approvedRow)

  // Second entry: the same barcode, typed again on a later scan --
  // even a differently-formatted raw string (here: no surrounding
  // whitespace this time) must still resolve to the same cache key.
  const secondEntryRaw = '7622202268298'
  const lookupKey = normalizeBarcode(secondEntryRaw)
  const reused = lookupCachedProduct(byBarcode, lookupKey)

  assert.ok(reused, 'the approved product must be found on the next scan, not treated as unapproved')
  assert.equal(reused.product_name, 'Milka (ידני)')
  assert.equal(reused.calories_per_100g, 534)
  assert.equal(reused.protein_per_100g, 6.3)
})
