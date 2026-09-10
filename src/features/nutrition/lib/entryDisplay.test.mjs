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
