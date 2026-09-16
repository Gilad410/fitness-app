// Integration test: reads the ACTUAL supabase/sql/039 + 040 migration
// files (not a fixture) and validates the real, final-state,
// USDA-verified food_reference_catalog data with parseCatalogValues()/
// validateCatalogRows() (foodCatalogValidation.js). This is the permanent
// regression guard for the USDA-verified catalog: it fails the whole test
// suite (and so CI) the moment a future edit to either file introduces a
// duplicate name, a negative/non-numeric nutrition value, an invalid
// category/basis, a missing source_id/source_name, or a restaurant/
// branded/fast-food record slipping back in.
//
// The only I/O in this feature's test suite -- every other *.test.mjs
// here is pure-fixture, per this project's established DI-testing
// convention. That's fine for a test (as opposed to the app runtime
// modules under this same lib/ directory, which never import fs/Supabase):
// this file is never imported by any Vue component or Pinia store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseCatalogValues, validateCatalogRows } from './foodCatalogValidation.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../../../supabase/sql')

function read(file) {
  return readFileSync(path.join(sqlDir, file), 'utf8')
}

// 039 corrects/backfills the surviving pre-existing rows (calories,
// protein, category, basis, source_* all set directly in its UPDATE ...
// VALUES) after deleting the ones that couldn't be verified; 040 inserts
// the new USDA-verified rows. Together they ARE the final catalog -- no
// need to replay 004-008 first, unlike the earlier (memory-based, now
// superseded) draft of this milestone.
function loadFinalCatalog() {
  const corrected = parseCatalogValues(read('039_food_reference_catalog_metadata.sql'))
  const inserted = parseCatalogValues(read('040_food_reference_catalog_usda_verified_expansion.sql'))
  return { corrected, inserted, all: [...corrected, ...inserted] }
}

test('the real USDA-verified catalog (039 corrections + 040 inserts) has zero validation errors', () => {
  const { all } = loadFinalCatalog()
  const { errors } = validateCatalogRows(all)
  assert.deepEqual(errors, [], `Catalog validation errors:\n${errors.join('\n')}`)
})

test('the real USDA-verified catalog totals exactly 490 products', () => {
  const { all } = loadFinalCatalog()
  assert.equal(all.length, 490, `Expected exactly 490 verified products, found ${all.length}`)
})

test('039 corrects/backfills exactly 221 pre-existing rows, and deletes exactly 113', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const { corrected } = loadFinalCatalog()
  assert.equal(corrected.length, 221, `expected 221 corrected rows, found ${corrected.length}`)
  const deleteMatches = [...text.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)]
  assert.equal(deleteMatches.length, 113, `expected 113 deleted names in the DELETE list, found ${deleteMatches.length}`)
})

test('040 inserts exactly 269 new verified rows', () => {
  const { inserted } = loadFinalCatalog()
  assert.equal(inserted.length, 269, `expected 269 new rows, found ${inserted.length}`)
})

test('every row in the final catalog carries a real source_id (USDA fdcId) and source_name', () => {
  const { all } = loadFinalCatalog()
  assert.ok(all.length > 0, 'expected a non-empty catalog')
  for (const row of all) {
    assert.ok(row.sourceId && /^\d+$/.test(row.sourceId), `${row.name}: source_id must be a real numeric USDA fdcId, got "${row.sourceId}"`)
    assert.ok(row.sourceName && row.sourceName.includes('USDA FoodData Central'), `${row.name}: source_name must cite USDA FoodData Central, got "${row.sourceName}"`)
  }
})

test('every row in the final catalog carries category and basis', () => {
  const { all } = loadFinalCatalog()
  for (const row of all) {
    assert.ok(row.category, `${row.name}: missing category`)
    assert.ok(row.basis, `${row.name}: missing basis`)
  }
})

test('040 rows each carry a live source_url pointing at the matched USDA record', () => {
  const { inserted } = loadFinalCatalog()
  for (const row of inserted) {
    const url = row.fields.find((f) => typeof f === 'string' && f.startsWith('https://fdc.nal.usda.gov/'))
    assert.ok(url, `${row.name}: missing a source_url pointing at fdc.nal.usda.gov`)
    assert.ok(url.includes(row.sourceId), `${row.name}: source_url "${url}" does not reference its own source_id "${row.sourceId}"`)
  }
})

test('no row in the final catalog is a named-restaurant-chain, "restaurant"-qualified, or "Fast foods" record', () => {
  const { all } = loadFinalCatalog()
  const { errors } = validateCatalogRows(all)
  const restaurantErrors = errors.filter((e) => /restaurant|Fast foods/i.test(e))
  assert.deepEqual(restaurantErrors, [])
})

test('039\'s UPDATE ... SET clause never references a v.<column> missing from the "as v(...)" alias', () => {
  // Regression test for a real production failure: the SET clause once
  // referenced `v.source_url`, but the `from (values ...) as v(...)`
  // alias list didn't include source_url as one of its columns --
  // Postgres error 42703 ("column v.source_url does not exist"), caught
  // only when actually run against Supabase. This statically re-derives
  // both sides from the SQL text itself and fails loudly if they ever
  // drift apart again, without needing a live database to catch it.
  const text = read('039_food_reference_catalog_metadata.sql')
  const updateBlock = text.slice(text.indexOf('update public.food_reference_catalog'), text.indexOf('where lower(f.name)'))
  const setColumns = [...updateBlock.matchAll(/^\s*(\w+)\s*=\s*v\.(\w+)/gm)].map((m) => m[2])
  assert.ok(setColumns.length > 0, 'expected to find at least one v.<column> reference in the SET clause')

  const aliasMatch = text.match(/\)\s*as\s*v\(([^)]+)\)/)
  assert.ok(aliasMatch, 'expected to find the "as v(...)" alias column list')
  const aliasColumns = aliasMatch[1].split(',').map((c) => c.trim())

  const missing = setColumns.filter((c) => !aliasColumns.includes(c))
  assert.deepEqual(missing, [], `SET clause references v.<column> not present in the "as v(...)" alias: ${missing.join(', ')}`)
})

test('039 is wrapped in an explicit begin;/commit; transaction (atomic -- a mid-script failure leaves nothing partially applied)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/, '039 must open with an explicit begin;')
  assert.match(withoutComments.trimEnd(), /commit;\s*$/, '039 must close with an explicit commit;')
})

test('the 039 DELETE list and the 039/040 final catalog names never overlap (nothing "corrected" that was also deleted)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const deleteSection = text.slice(text.indexOf('delete from'), text.indexOf('alter table'))
  const deletedNames = new Set(
    [...deleteSection.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'").toLowerCase()),
  )
  const { all } = loadFinalCatalog()
  const overlap = all.filter((row) => deletedNames.has(row.name.toLowerCase()))
  assert.deepEqual(overlap.map((r) => r.name), [])
})
