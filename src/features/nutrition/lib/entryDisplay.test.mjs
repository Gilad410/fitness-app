// node --test src/features/nutrition/lib/entryDisplay.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryDisplayName, entryQuantityLabel } from './entryDisplay.js'

// ---------------------------------------------------------------------
// A regular-food entry (grams-based) -- same for a
// trainee_nutrition_logs row and a trainee_nutrition_plan_meal_items row.
// ---------------------------------------------------------------------
test('regular food: display name is just the food name', () => {
  const entry = { food_id: 'f1', grams: 150, food: { name: 'חזה עוף' }, restaurant_food_item: null }
  assert.equal(entryDisplayName(entry), 'חזה עוף')
})

test('regular food: quantity label is "<grams> גרם"', () => {
  const entry = { food_id: 'f1', grams: 150, food: { name: 'חזה עוף' }, restaurant_food_item: null }
  assert.equal(entryQuantityLabel(entry), '150 גרם')
})

test('a food entry with no embedded food row (e.g. RLS-hidden) falls back to an empty name, not a crash', () => {
  const entry = { food_id: 'f1', grams: 150, food: null, restaurant_food_item: null }
  assert.equal(entryDisplayName(entry), '')
})

// ---------------------------------------------------------------------
// A restaurant-item entry (servings-based)
// ---------------------------------------------------------------------
test('restaurant item: display name is "<item> (<chain>)"', () => {
  const entry = {
    restaurant_food_item_id: 'r1',
    servings: 1,
    restaurant_food_item: { item_name: 'ביג מק', chain_name: 'מקדונלד\'ס', serving_description: 'מנה רגילה' },
  }
  assert.equal(entryDisplayName(entry), 'ביג מק (מקדונלד\'ס)')
})

test('restaurant item: quantity label uses מנה (singular) for exactly 1 serving', () => {
  const entry = {
    servings: 1,
    restaurant_food_item: { item_name: 'ביג מק', chain_name: 'מקדונלד\'ס', serving_description: 'מנה רגילה' },
  }
  assert.equal(entryQuantityLabel(entry), '1 מנה · מנה רגילה')
})

test('restaurant item: quantity label uses מנות (plural) for a non-1 integer serving count', () => {
  const entry = {
    servings: 2,
    restaurant_food_item: { item_name: 'ביג מק', chain_name: 'מקדונלד\'ס', serving_description: 'מנה רגילה' },
  }
  assert.equal(entryQuantityLabel(entry), '2 מנות · מנה רגילה')
})

test('restaurant item: a fractional serving count is shown with one decimal, not as an integer', () => {
  const entry = {
    servings: 0.5,
    restaurant_food_item: { item_name: 'קפוצ׳ינו', chain_name: 'ארומה', serving_description: 'גדול' },
  }
  assert.equal(entryQuantityLabel(entry), '0.5 מנות · גדול')
})

// ---------------------------------------------------------------------
// A barcode-sourced entry (grams-based, log-only -- see the module
// comment for why this is never a plan-item shape).
// ---------------------------------------------------------------------
test('barcode entry: display name is "<product name> (ברקוד)"', () => {
  const entry = { barcode: '4006381333931', barcode_product_name: 'דגני בוקר לדוגמה', grams: 40 }
  assert.equal(entryDisplayName(entry), 'דגני בוקר לדוגמה (ברקוד)')
})

test('barcode entry: quantity label is "<grams> גרם", same format as a regular food', () => {
  const entry = { barcode: '4006381333931', barcode_product_name: 'דגני בוקר לדוגמה', grams: 40 }
  assert.equal(entryQuantityLabel(entry), '40 גרם')
})

test('barcode entry: a missing product-name snapshot falls back to an empty name, not a crash', () => {
  const entry = { barcode: '4006381333931', barcode_product_name: null, grams: 40 }
  assert.equal(entryDisplayName(entry), ' (ברקוד)')
})

test('a barcode entry is checked before the restaurant/food branches -- a malformed row with both never reads as a restaurant item', () => {
  const entry = {
    barcode: '4006381333931',
    barcode_product_name: 'דגני בוקר לדוגמה',
    grams: 40,
    restaurant_food_item: { item_name: 'should not be used', chain_name: 'x', serving_description: 'x' },
  }
  assert.equal(entryDisplayName(entry), 'דגני בוקר לדוגמה (ברקוד)')
})

// ---------------------------------------------------------------------
// Identical behavior regardless of which feature the entry came from --
// the whole point of sharing this module between the food log and the
// nutrition plan.
// ---------------------------------------------------------------------
test('a log-shaped entry and a plan-item-shaped entry with the same data produce identical output', () => {
  const logEntry = {
    id: 'log1',
    trainee_id: 't1',
    food_id: 'f1',
    grams: 200,
    calories: 300,
    food: { name: 'אורז' },
    restaurant_food_item: null,
  }
  const planItemEntry = {
    id: 'item1',
    meal_id: 'm1',
    food_id: 'f1',
    grams: 200,
    calories: 300,
    food: { name: 'אורז' },
    restaurant_food_item: null,
  }
  assert.equal(entryDisplayName(logEntry), entryDisplayName(planItemEntry))
  assert.equal(entryQuantityLabel(logEntry), entryQuantityLabel(planItemEntry))
})

// ---------------------------------------------------------------------
// REGRESSION -- real trainee-side bug: a trainee's barcode-sourced log
// row showed grams/calories/protein correctly but the product name was
// blank. Root cause: the name WAS written (trainee_log_nutrition_entry's
// barcode branch inserts barcode_product_name), WAS returned (RPC's
// `returning *`), and WAS present in the read query
// (traineeNutrition.js's fetchAll() selects '*') -- but
// TraineeNutritionView.vue had its OWN local entryDisplayName()/
// entryQuantityLabel(), a stale pre-barcode duplicate of THIS shared
// module that never gained a barcode branch, so it always fell through
// to `log.food?.name ?? ''` (null for a barcode row, which has no
// food_id) -- a rendering bug, not a write/read bug. Fixed by having
// TraineeNutritionView.vue import and use this shared module directly
// instead of its own copy. This test exercises the EXACT row shape
// traineeNutrition.js's fetchAll() actually returns for a trainee's
// barcode entry (the `food`/`restaurant_food_item` embed keys PostgREST
// includes as null when neither food_id nor restaurant_food_item_id is
// set), proving the shared function -- now the only implementation --
// handles it correctly.
// ---------------------------------------------------------------------
test('REGRESSION: a trainee-shaped barcode log row (as actually returned by traineeNutrition.js fetchAll(), including the null food/restaurant_food_item embeds) shows the real product name, not a blank', () => {
  const traineeBarcodeLogRow = {
    id: 'log-9',
    trainee_id: 't1',
    coach_id: 'c1',
    food_id: null,
    restaurant_food_item_id: null,
    barcode: '7622202268298',
    barcode_source: 'open_food_facts',
    barcode_product_name: 'Milka Alpenmilch',
    barcode_calories_per_100g: 534,
    barcode_protein_per_100g: 6.3,
    grams: 40,
    servings: null,
    calories: 213.6,
    protein: 2.5,
    logged_at: '2026-09-19',
    food: null,
    restaurant_food_item: null,
  }
  assert.equal(entryDisplayName(traineeBarcodeLogRow), 'Milka Alpenmilch (ברקוד)')
  assert.equal(entryQuantityLabel(traineeBarcodeLogRow), '40 גרם')
})
