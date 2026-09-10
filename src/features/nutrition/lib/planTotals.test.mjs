// node --test src/features/nutrition/lib/planTotals.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mealTotals, planTotals } from './planTotals.js'

// ---------------------------------------------------------------------
// mealTotals
// ---------------------------------------------------------------------
test('mealTotals: sums calories/protein across all items', () => {
  const meal = {
    items: [
      { calories: 300, protein: 20 },
      { calories: 150, protein: 5 },
    ],
  }
  assert.deepEqual(mealTotals(meal), { calories: 450, protein: 25, hasUnknownProtein: false, itemCount: 2 })
})

test('mealTotals: an item with null protein is excluded from the protein sum and flagged', () => {
  const meal = {
    items: [
      { calories: 300, protein: 20 },
      { calories: 150, protein: null },
    ],
  }
  const totals = mealTotals(meal)
  assert.equal(totals.calories, 450)
  assert.equal(totals.protein, 20)
  assert.equal(totals.hasUnknownProtein, true)
  assert.equal(totals.itemCount, 2)
})

test('mealTotals: a meal with no items (legacy migrated meal) totals to zero with itemCount 0', () => {
  assert.deepEqual(mealTotals({ items: [] }), { calories: 0, protein: 0, hasUnknownProtein: false, itemCount: 0 })
})

test('mealTotals: a meal with no items array at all is treated the same as an empty one', () => {
  assert.deepEqual(mealTotals({}), { calories: 0, protein: 0, hasUnknownProtein: false, itemCount: 0 })
})

test('mealTotals: null/undefined meal does not throw', () => {
  assert.deepEqual(mealTotals(null), { calories: 0, protein: 0, hasUnknownProtein: false, itemCount: 0 })
  assert.deepEqual(mealTotals(undefined), { calories: 0, protein: 0, hasUnknownProtein: false, itemCount: 0 })
})

test('mealTotals: string calories/protein (as PostgREST numeric columns may arrive) are coerced to numbers', () => {
  const meal = { items: [{ calories: '300', protein: '20' }] }
  const totals = mealTotals(meal)
  assert.equal(totals.calories, 300)
  assert.equal(totals.protein, 20)
})

// ---------------------------------------------------------------------
// planTotals
// ---------------------------------------------------------------------
test('planTotals: sums across every meal', () => {
  const plan = {
    meals: [
      { items: [{ calories: 300, protein: 20 }] },
      { items: [{ calories: 200, protein: 10 }, { calories: 100, protein: 5 }] },
    ],
  }
  const totals = planTotals(plan)
  assert.equal(totals.calories, 600)
  assert.equal(totals.protein, 35)
  assert.equal(totals.hasUnknownProtein, false)
  assert.equal(totals.hasLegacyMealsWithoutItems, false)
})

test('planTotals: hasUnknownProtein is true if ANY meal has an item with unknown protein', () => {
  const plan = {
    meals: [
      { items: [{ calories: 300, protein: 20 }] },
      { items: [{ calories: 200, protein: null }] },
    ],
  }
  assert.equal(planTotals(plan).hasUnknownProtein, true)
})

test('planTotals: hasLegacyMealsWithoutItems is true if ANY meal has zero items', () => {
  const plan = {
    meals: [
      { items: [{ calories: 300, protein: 20 }] },
      { items: [] }, // e.g. a meal promoted from a pre-037 free-text row
    ],
  }
  const totals = planTotals(plan)
  assert.equal(totals.hasLegacyMealsWithoutItems, true)
  // The legacy meal contributes nothing to the totals -- it isn't
  // fabricated as zero-calorie food, it's just excluded.
  assert.equal(totals.calories, 300)
  assert.equal(totals.protein, 20)
})

test('planTotals: an empty plan (no meals) totals to zero with no flags set', () => {
  assert.deepEqual(planTotals({ meals: [] }), {
    calories: 0,
    protein: 0,
    hasUnknownProtein: false,
    hasLegacyMealsWithoutItems: false,
  })
})

test('planTotals: null/undefined plan does not throw', () => {
  assert.deepEqual(planTotals(null), {
    calories: 0,
    protein: 0,
    hasUnknownProtein: false,
    hasLegacyMealsWithoutItems: false,
  })
})
