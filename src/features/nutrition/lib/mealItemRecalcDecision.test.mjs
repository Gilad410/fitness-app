// node --test src/features/nutrition/lib/mealItemRecalcDecision.test.mjs
//
// Tests a hand-mirrored JS reference model of the trigger's decision
// logic (see mealItemRecalcDecision.js's own header) -- NOT the actual
// SQL/PL-pgSQL, which remains unexecuted and unverified in this
// environment (no local Postgres/Docker available; 037 has not been
// applied to any database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDistinctFrom, shouldRecalculate } from './mealItemRecalcDecision.js'

// ---------------------------------------------------------------------
// isDistinctFrom -- SQL's IS DISTINCT FROM semantics
// ---------------------------------------------------------------------
test('isDistinctFrom: two equal values are not distinct', () => {
  assert.equal(isDistinctFrom(150, 150), false)
  assert.equal(isDistinctFrom('a', 'a'), false)
})

test('isDistinctFrom: two different values are distinct', () => {
  assert.equal(isDistinctFrom(150, 200), true)
})

test('isDistinctFrom: two nulls are NOT distinct (unlike plain <>/=, which SQL would make NULL)', () => {
  assert.equal(isDistinctFrom(null, null), false)
  assert.equal(isDistinctFrom(undefined, null), false)
  assert.equal(isDistinctFrom(undefined, undefined), false)
})

test('isDistinctFrom: null vs. a real value IS distinct', () => {
  assert.equal(isDistinctFrom(null, 150), true)
  assert.equal(isDistinctFrom(150, null), true)
})

// ---------------------------------------------------------------------
// shouldRecalculate -- the trigger's actual branch decision
// ---------------------------------------------------------------------
test('INSERT always recalculates -- there is no OLD row to compare against or preserve', () => {
  const newRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null }
  assert.equal(shouldRecalculate('INSERT', null, newRow), true)
})

test('UPDATE that only changes display_order (source/quantity unchanged) does NOT recalculate -- reordering preserves the stored snapshot', () => {
  const oldRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null, display_order: 0 }
  const newRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null, display_order: 1 }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), false)
})

test('UPDATE that changes grams (same food) DOES recalculate', () => {
  const oldRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null }
  const newRow = { food_id: 'f1', grams: 200, restaurant_food_item_id: null, servings: null }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), true)
})

test('UPDATE that changes food_id (swaps the referenced food) DOES recalculate', () => {
  const oldRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null }
  const newRow = { food_id: 'f2', grams: 150, restaurant_food_item_id: null, servings: null }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), true)
})

test('UPDATE that changes servings (restaurant item) DOES recalculate', () => {
  const oldRow = { food_id: null, grams: null, restaurant_food_item_id: 'r1', servings: 1 }
  const newRow = { food_id: null, grams: null, restaurant_food_item_id: 'r1', servings: 2 }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), true)
})

test('UPDATE that changes restaurant_food_item_id DOES recalculate', () => {
  const oldRow = { food_id: null, grams: null, restaurant_food_item_id: 'r1', servings: 1 }
  const newRow = { food_id: null, grams: null, restaurant_food_item_id: 'r2', servings: 1 }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), true)
})

// ---------------------------------------------------------------------
// The exact scenario the review flagged: reordering after a catalog
// value changed must NOT silently recalculate and discard the stored
// snapshot.
// ---------------------------------------------------------------------
test('regression: reordering an item whose referenced food\'s catalog calories changed since it was added does not recompute -- only display_order differs between OLD and NEW', () => {
  // The item's OWN row (food_id/grams/restaurant_food_item_id/servings)
  // is untouched by a pure reorder -- only display_order moves. Even
  // though public.foods.calories_per_100g may have changed in the
  // meantime (not represented in this row at all), the trigger's
  // decision is based solely on whether THIS row's source/quantity
  // columns changed, which they did not.
  const oldRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null, display_order: 2 }
  const newRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null, display_order: 1 }
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), false)
})

// ---------------------------------------------------------------------
// Tamper prevention: the trigger is the sole authority over
// calories/protein in both branches (never trusts a client-supplied
// value), which this decision function's caller relies on -- see the
// migration's own trigger body: the "preserve" branch sets
// new.calories/protein back to old.calories/protein regardless of what
// the UPDATE statement tried to set them to.
// ---------------------------------------------------------------------
test('a pure display_order UPDATE is exactly the case where the trigger overrides any client-supplied calories/protein with the OLD stored values', () => {
  const oldRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null }
  const newRow = { food_id: 'f1', grams: 150, restaurant_food_item_id: null, servings: null }
  // Whatever calories/protein the client tried to sneak into this UPDATE
  // is irrelevant to the decision -- shouldRecalculate only looks at
  // source/quantity columns, never at calories/protein themselves.
  assert.equal(shouldRecalculate('UPDATE', oldRow, newRow), false)
})
