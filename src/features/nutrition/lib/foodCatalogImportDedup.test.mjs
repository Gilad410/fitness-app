import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeByBarcode, dedupeByPackageSize, dedupeByName, findLiveCatalogCollisions, dedupeImportBatch } from './foodCatalogImportDedup.js'

function candidate(overrides) {
  return { name: 'Item', brand: null, caloriesPer100g: 100, proteinPer100g: 5, barcode: '000', ...overrides }
}

test('dedupeByBarcode: keeps the first of two candidates sharing a barcode, reports the second', () => {
  const a = candidate({ barcode: '111', name: 'A' })
  const b = candidate({ barcode: '111', name: 'B' })
  const { kept, removed } = dedupeByBarcode([a, b])
  assert.deepEqual(kept, [a])
  assert.equal(removed.length, 1)
  assert.equal(removed[0].barcode, '111')
})

test('dedupeByPackageSize: collapses same name+brand+nutrition (different barcode) to one -- a real package-size variant', () => {
  const small = candidate({ barcode: '1L', name: 'Milk 3%', brand: 'Tnuva', caloriesPer100g: 60, proteinPer100g: 3.3 })
  const large = candidate({ barcode: '2L', name: 'Milk 3%', brand: 'Tnuva', caloriesPer100g: 60, proteinPer100g: 3.3 })
  const { kept, removed } = dedupeByPackageSize([small, large])
  assert.equal(kept.length, 1)
  assert.equal(removed.length, 1)
  assert.equal(removed[0].barcode, '2L')
})

test('dedupeByPackageSize: does NOT collapse the same name+brand with DIFFERENT nutrition values -- a real reformulation/different variant, not a size copy', () => {
  const regular = candidate({ barcode: 'A', name: 'Peanut Butter', brand: 'Green', caloriesPer100g: 684, proteinPer100g: 27 })
  const reducedFat = candidate({ barcode: 'B', name: 'Peanut Butter', brand: 'Green', caloriesPer100g: 520, proteinPer100g: 25 })
  const { kept } = dedupeByPackageSize([regular, reducedFat])
  assert.equal(kept.length, 2)
})

test('REGRESSION: dedupeByName removes a real name collision between two genuinely different products -- found via a real Postgres (PGlite) test against the actual pre-existing unique-name index, which a SQL-parser-only check could never catch', () => {
  // Real data: two different Honey products, different barcodes,
  // sharing the exact bare name "Honey" -- would violate
  // food_reference_catalog's unique index on lower(name) (live since
  // migration 004) if both were inserted.
  const honeyA = candidate({ barcode: '7290110554095', name: 'Honey', brand: 'BrandA' })
  const honeyB = candidate({ barcode: '7290011435226', name: 'Honey', brand: 'BrandB' })
  const { kept, removed } = dedupeByName([honeyA, honeyB])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].barcode, '7290110554095')
  assert.equal(removed.length, 1)
  assert.equal(removed[0].barcode, '7290011435226')
  assert.equal(removed[0].collidesWithBarcode, '7290110554095')
})

test('dedupeByName: is case-insensitive and trims whitespace, matching the real lower(name) index semantics', () => {
  const a = candidate({ barcode: 'A', name: ' Milk ' })
  const b = candidate({ barcode: 'B', name: 'milk' })
  const { kept } = dedupeByName([a, b])
  assert.equal(kept.length, 1)
})

test('findLiveCatalogCollisions: skips a candidate whose name already exists live, keeps the rest', () => {
  const live = new Set(['בננה', 'חזה עוף צלוי'])
  const newFood = candidate({ name: 'Quinoa Salad', barcode: 'X' })
  const collider = candidate({ name: 'בננה', barcode: 'Y' })
  const { kept, collisions } = findLiveCatalogCollisions([newFood, collider], live)
  assert.deepEqual(kept, [newFood])
  assert.equal(collisions.length, 1)
  assert.equal(collisions[0].barcode, 'Y')
})

test('dedupeImportBatch: runs all three passes in order and reports each removal under the right bucket', () => {
  const original = candidate({ barcode: 'A', name: 'Honey', brand: 'X', caloriesPer100g: 300, proteinPer100g: 0.3 })
  const barcodeDupe = candidate({ barcode: 'A', name: 'Honey (dupe barcode)', brand: 'X', caloriesPer100g: 300, proteinPer100g: 0.3 })
  const packageDupe = candidate({ barcode: 'B', name: 'Honey', brand: 'X', caloriesPer100g: 300, proteinPer100g: 0.3 })
  const nameCollision = candidate({ barcode: 'C', name: 'Honey', brand: 'DifferentBrand', caloriesPer100g: 305, proteinPer100g: 0.2 })
  const genuinelyNew = candidate({ barcode: 'D', name: 'Maple Syrup', brand: 'Y', caloriesPer100g: 260, proteinPer100g: 0 })

  const result = dedupeImportBatch([original, barcodeDupe, packageDupe, nameCollision, genuinelyNew])
  assert.equal(result.kept.length, 2) // original ("Honey") + genuinelyNew ("Maple Syrup")
  assert.equal(result.barcodeDuplicates.length, 1)
  assert.equal(result.packageSizeDuplicates.length, 1)
  assert.equal(result.nameCollisions.length, 1)
  assert.equal(result.nameCollisions[0].barcode, 'C')
})
