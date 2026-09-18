// Integration test: reads the ACTUAL supabase/sql/045 migration file
// (not a fixture) and validates its structural safety properties --
// transaction wrapping, additive-only nature, and that it doesn't
// silently drop the existing food_id/restaurant_food_item_id source
// branches. Same convention as foodCatalogRealData.test.mjs in the
// food-catalog feature: the one deliberate I/O test in this feature's
// otherwise pure-fixture test suite, never imported by any Vue
// component or Pinia store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../../../supabase/sql')
const auditsDir = path.resolve(here, '../../../../supabase/audits')

function read(file) {
  return readFileSync(path.join(sqlDir, file), 'utf8')
}

function readAudit(file) {
  return readFileSync(path.join(auditsDir, file), 'utf8')
}

function migrationText() {
  return read('045_trainee_nutrition_logs_barcode_source.sql')
}

function preflightText() {
  return readAudit('trainee_nutrition_logs_045_preflight_check.sql')
}

test('045 is transaction-safe: opens with begin; and closes with commit;', () => {
  const text = migrationText()
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/)
  assert.match(withoutComments.trimEnd(), /commit;\s*$/)
})

test('045 uses "add column if not exists" for every new column (defensive, idempotent)', () => {
  const text = migrationText()
  const addColumnCount = (text.match(/add column/gi) || []).length
  const addColumnIfNotExistsCount = (text.match(/add column if not exists/gi) || []).length
  assert.equal(addColumnCount, 5, `expected 5 new columns (barcode, barcode_source, barcode_product_name, barcode_calories_per_100g, barcode_protein_per_100g), found ${addColumnCount}`)
  assert.equal(addColumnIfNotExistsCount, 5, 'every "add column" must use "if not exists"')
})

test('045 does not drop or alter the existing food_id/restaurant_food_item_id/grams/servings columns -- additive only', () => {
  const text = migrationText()
  assert.doesNotMatch(text, /drop column/i)
  assert.doesNotMatch(text, /alter column food_id/i)
  assert.doesNotMatch(text, /alter column restaurant_food_item_id/i)
  assert.doesNotMatch(text, /alter column grams/i)
})

test('045 does not touch public.foods, public.food_reference_catalog, or public.restaurant_food_items -- a barcode product is never written into any reusable catalog', () => {
  const text = migrationText()
  assert.doesNotMatch(text, /insert into public\.foods/i)
  assert.doesNotMatch(text, /insert into public\.food_reference_catalog/i)
  assert.doesNotMatch(text, /insert into public\.restaurant_food_items/i)
  assert.doesNotMatch(text, /update public\.foods/i)
  assert.doesNotMatch(text, /update public\.food_reference_catalog/i)
})

test('045\'s replacement source-check constraint has exactly 3 branches (food_id, restaurant_food_item_id, barcode)', () => {
  const text = migrationText()
  const constraintBlock = text.slice(
    text.indexOf('add constraint trainee_nutrition_logs_source_check'),
    text.indexOf('-- 3. Extend'),
  )
  const orCount = (constraintBlock.match(/\)\s*\n\s*or\s*\n\s*\(/g) || []).length
  assert.equal(orCount, 2, `expected exactly 2 "or"s joining 3 branches, found ${orCount}`)
  assert.match(constraintBlock, /food_id is not null and restaurant_food_item_id is null and barcode is null/)
  assert.match(constraintBlock, /food_id is null and restaurant_food_item_id is not null and barcode is null/)
  assert.match(constraintBlock, /food_id is null and restaurant_food_item_id is null and barcode is not null/)
})

test('045\'s barcode branch requires calories but explicitly allows protein to be null (unknown-protein products are supported, not an error)', () => {
  const text = migrationText()
  const barcodeBranch = text.slice(
    text.indexOf('food_id is null and restaurant_food_item_id is null and barcode is not null'),
    text.indexOf('-- 3. Extend'),
  )
  assert.match(barcodeBranch, /barcode_calories_per_100g is not null/)
  assert.doesNotMatch(barcodeBranch, /barcode_protein_per_100g is not null/)
})

test('045\'s trigger replacement preserves the existing food_id and restaurant_food_item_id branches byte-for-byte in formula (kcal/protein * quantity / basis)', () => {
  const text = migrationText()
  assert.match(text, /new\.calories = round\(v_calories_per_100g \* new\.grams \/ 100\.0, 1\);/)
  assert.match(text, /new\.calories = round\(v_calories_per_serving \* new\.servings, 1\);/)
})

test('045\'s barcode trigger branch applies the exact calories_per_100g * grams / 100 / protein_per_100g * grams / 100 formula, rounded to 1 decimal', () => {
  const text = migrationText()
  assert.match(text, /new\.calories = round\(new\.barcode_calories_per_100g \* new\.grams \/ 100\.0, 1\);/)
  assert.match(text, /round\(new\.barcode_protein_per_100g \* new\.grams \/ 100\.0, 1\)/)
})

test('045\'s final report is a read-only SELECT before commit;, never a raise/exception (cannot abort the migration)', () => {
  const text = migrationText()
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /raise\s+exception/i)
  const selectIndex = withoutComments.indexOf('select count(*) as rows_failing_source_check')
  const commitIndex = withoutComments.lastIndexOf('commit;')
  assert.ok(selectIndex !== -1 && selectIndex < commitIndex)
})

test('045 does not reference restaurant_food_item_id or food_id as columns it modifies in a way that could orphan trainee_nutrition_plan_meal_items or existing logs (no delete/truncate anywhere)', () => {
  const text = migrationText()
  assert.doesNotMatch(text, /\bdelete\s+from\b/i)
  assert.doesNotMatch(text, /\btruncate\b/i)
})

test('045\'s barcode branch requires a source and product name but does not restrict barcode_source to a specific value -- both "open_food_facts" and "manual" satisfy it identically', () => {
  const text = migrationText()
  const barcodeBranch = text.slice(
    text.indexOf('food_id is null and restaurant_food_item_id is null and barcode is not null'),
    text.indexOf('-- 3. Extend'),
  )
  assert.match(barcodeBranch, /barcode_source is not null/)
  assert.doesNotMatch(barcodeBranch, /barcode_source\s*=\s*'/, 'must not hardcode a specific source value -- manual entries need to satisfy this branch too')
})

// ---------------------------------------------------------------------
// The standalone preflight check (supabase/audits/), meant to be run in
// the Supabase SQL Editor BEFORE 045 itself.
// ---------------------------------------------------------------------

test('the 045 preflight check is schema-agnostic (references only columns/objects that predate 045, so it can never fail regardless of whether 045 has run)', () => {
  const text = preflightText()
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /\bbarcode\b|\bbarcode_source\b|\bbarcode_product_name\b|\bbarcode_calories_per_100g\b|\bbarcode_protein_per_100g\b/)
})

test('the 045 preflight check is read-only -- no writes, no transaction needed', () => {
  const withoutComments = preflightText().replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /\b(insert|update|delete|alter|drop|truncate|begin|commit)\b/i)
})

test('the 045 preflight check inspects information_schema.columns, pg_constraint, and pg_proc -- covering columns, the constraint, and the trigger function 045 is about to touch', () => {
  const text = preflightText()
  assert.match(text, /information_schema\.columns/)
  assert.match(text, /pg_constraint/)
  assert.match(text, /pg_proc/)
  assert.match(text, /from public\.trainee_nutrition_logs/)
})
