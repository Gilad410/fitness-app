import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCatalogValues, validateCatalogRows, CATEGORIES, BASIS_VALUES } from './foodCatalogValidation.js'

test('parseCatalogValues: extracts a plain 2-column (name, calories) tuple', () => {
  const rows = parseCatalogValues("insert into t (name, calories_per_100g) values\n  ('תפוח', 52),\n  ('בננה', 89);")
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    name: 'תפוח', calories: 52, protein: null, category: null, basis: null,
    sourceName: undefined, sourceId: undefined, fields: [52],
  })
  assert.equal(rows[1].name, 'בננה')
  assert.equal(rows[1].calories, 89)
})

test('parseCatalogValues: extracts a 3-column (name, calories, protein) tuple', () => {
  const rows = parseCatalogValues("values\n  ('אבוקדו', 160, 2.0),\n  ('חזה עוף', 165, 31.0);")
  assert.equal(rows.length, 2)
  assert.equal(rows[0].calories, 160)
  assert.equal(rows[0].protein, 2.0)
  assert.equal(rows[0].category, null)
})

test('parseCatalogValues: extracts a full 6-column (name, calories, protein, category, basis, source) tuple', () => {
  const rows = parseCatalogValues(
    "values\n  ('פפאיה', 43, 0.5, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy / Foundation Foods)'),  -- Papaya",
  )
  assert.equal(rows.length, 1)
  assert.deepEqual(
    { name: rows[0].name, calories: rows[0].calories, protein: rows[0].protein, category: rows[0].category, basis: rows[0].basis },
    { name: 'פפאיה', calories: 43, protein: 0.5, category: 'fruit', basis: 'raw' },
  )
})

test('parseCatalogValues: extracts a (name, category, basis, source) metadata-only backfill tuple', () => {
  const rows = parseCatalogValues("values\n  ('תפוח', 'fruit', 'raw', 'USDA FoodData Central'),\n  ('בננה', 'fruit', 'raw', 'USDA FoodData Central')")
  assert.equal(rows.length, 2)
  assert.equal(rows[0].calories, null)
  assert.equal(rows[0].category, 'fruit')
  assert.equal(rows[0].basis, 'raw')
})

test('parseCatalogValues: un-escapes doubled single quotes inside Hebrew names', () => {
  const rows = parseCatalogValues("values\n  ('קוטג'' 5%', 106, 11.1);")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, "קוטג' 5%")
})

test('parseCatalogValues: does not match a bare lower(\'name\') inside a WHERE clause (no tuple to extract)', () => {
  const rows = parseCatalogValues("update t set calories_per_100g = 47 where lower(name) = lower('שסק');")
  assert.equal(rows.length, 0)
})

test('parseCatalogValues: ignores an ON CONFLICT clause and ordinary prose comments', () => {
  const rows = parseCatalogValues("-- some prose (with parens) here\nvalues ('תפוח', 52, 0.3) on conflict ((lower(name))) do nothing;")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'תפוח')
})

test('validateCatalogRows: a clean catalog produces no errors', () => {
  const { errors } = validateCatalogRows([
    { name: 'תפוח', calories: 52, protein: 0.3, category: 'fruit', basis: 'raw' },
    { name: 'בננה', calories: 89, protein: 1.1, category: 'fruit', basis: 'raw' },
  ])
  assert.deepEqual(errors, [])
})

test('validateCatalogRows: catches a case-insensitive duplicate name', () => {
  const { errors } = validateCatalogRows([
    { name: 'תפוח', calories: 52, protein: 0.3 },
    { name: 'תפוח', calories: 55, protein: 0.4 },
  ])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Duplicate name/)
})

test('validateCatalogRows: catches negative calories', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: -5, protein: 1 }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /calories_per_100g must be a finite number >= 0/)
})

test('validateCatalogRows: catches negative protein', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 5, protein: -1 }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /protein_per_100g must be a finite number >= 0/)
})

test('validateCatalogRows: catches a non-numeric calories value', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 'a lot', protein: 1 }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /calories_per_100g must be a finite number/)
})

test('validateCatalogRows: catches missing calories/protein', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: null, protein: undefined }])
  assert.equal(errors.length, 2)
})

test('validateCatalogRows: catches an invalid category', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, category: 'not_a_real_category', basis: 'raw' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /invalid category/)
})

test('validateCatalogRows: catches an invalid basis', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, category: 'fruit', basis: 'liquefied' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /invalid basis/)
})

test('validateCatalogRows: a row with no category/basis at all (legacy shape) is not flagged for that', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1 }])
  assert.deepEqual(errors, [])
})

test('validateCatalogRows: an empty catalog is trivially valid', () => {
  const { errors, warnings } = validateCatalogRows([])
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
})

test('CATEGORIES and BASIS_VALUES expose the exact enum the 039 migration\'s CHECK constraints use', () => {
  assert.equal(CATEGORIES.size, 19)
  assert.ok(CATEGORIES.has('prepared_dish'))
  assert.equal(BASIS_VALUES.size, 11)
  assert.ok(BASIS_VALUES.has('canned_drained'))
})

test('validateCatalogRows: catches a missing source_id when the field is present but empty', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceId: '' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /missing source_id/)
})

test('validateCatalogRows: does not require source_id when the row never carries the field at all', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1 }])
  assert.deepEqual(errors, [])
})

test('validateCatalogRows: catches a missing source_name when the field is present but empty', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: '' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /missing source_name/)
})

test('validateCatalogRows: catches a named restaurant chain in source_name', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: "USDA FoodData Central (SR Legacy) -- McDONALD'S, Cheeseburger" }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /names a specific restaurant chain/)
})

test('validateCatalogRows: catches a "restaurant"-qualified source_name', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: 'USDA FoodData Central (Survey (FNDDS)) -- Pasta with tomato-based sauce, restaurant' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /qualified "restaurant"/)
})

test('validateCatalogRows: catches a "Fast foods, ..." industry-average source_name', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: 'USDA FoodData Central (Survey (FNDDS)) -- Fast foods, nachos, with cheese' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /industry-wide average/)
})

test('validateCatalogRows: a plain, real source_name with no restaurant/fast-food signal passes clean', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceId: '169097', sourceName: 'USDA FoodData Central (SR Legacy) -- Oranges, raw, all commercial varieties' }])
  assert.deepEqual(errors, [])
})

test('validateCatalogRows: catches a named commercial grocery brand in source_name (CHOBANI)', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: 'USDA FoodData Central (SR Legacy) -- Yogurt, Greek, nonfat, peach, CHOBANI' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /specific commercial grocery brand/)
})

test('validateCatalogRows: catches a named commercial grocery brand in source_name (Archway)', () => {
  const { errors } = validateCatalogRows([{ name: 'x', calories: 1, protein: 1, sourceName: 'USDA FoodData Central (SR Legacy) -- Archway Home Style Cookies, Reduced Fat Ginger Snaps' }])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /specific commercial grocery brand/)
})
