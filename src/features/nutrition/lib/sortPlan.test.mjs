// node --test src/features/nutrition/lib/sortPlan.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortPlan } from './sortPlan.js'

test('returns null/undefined unchanged', () => {
  assert.equal(sortPlan(null), null)
  assert.equal(sortPlan(undefined), undefined)
})

test('sorts meals by display_order regardless of input order', () => {
  const plan = {
    id: 'p1',
    meals: [
      { id: 'm-c', display_order: 2, items: [] },
      { id: 'm-a', display_order: 0, items: [] },
      { id: 'm-b', display_order: 1, items: [] },
    ],
  }
  const sorted = sortPlan(plan)
  assert.deepEqual(
    sorted.meals.map((m) => m.id),
    ['m-a', 'm-b', 'm-c'],
  )
})

test('sorts each meal\'s items by display_order independently', () => {
  const plan = {
    meals: [
      {
        id: 'm1',
        display_order: 0,
        items: [
          { id: 'i2', display_order: 1 },
          { id: 'i1', display_order: 0 },
        ],
      },
      {
        id: 'm2',
        display_order: 1,
        items: [
          { id: 'i4', display_order: 1 },
          { id: 'i3', display_order: 0 },
        ],
      },
    ],
  }
  const sorted = sortPlan(plan)
  assert.deepEqual(sorted.meals[0].items.map((i) => i.id), ['i1', 'i2'])
  assert.deepEqual(sorted.meals[1].items.map((i) => i.id), ['i3', 'i4'])
})

test('a meal with no items array becomes an empty array, not undefined', () => {
  const plan = { meals: [{ id: 'm1', display_order: 0 }] }
  const sorted = sortPlan(plan)
  assert.deepEqual(sorted.meals[0].items, [])
})

test('a plan with no meals array becomes an empty meals array', () => {
  const sorted = sortPlan({ id: 'p1' })
  assert.deepEqual(sorted.meals, [])
})

test('does not mutate the original plan/meals/items (returns new arrays/objects)', () => {
  const originalItems = [{ id: 'i2', display_order: 1 }, { id: 'i1', display_order: 0 }]
  const originalMeal = { id: 'm1', display_order: 0, items: originalItems }
  const plan = { meals: [originalMeal] }

  const sorted = sortPlan(plan)

  assert.notEqual(sorted, plan)
  assert.notEqual(sorted.meals, plan.meals)
  assert.notEqual(sorted.meals[0], originalMeal)
  assert.notEqual(sorted.meals[0].items, originalItems)
  // Original input untouched.
  assert.deepEqual(originalItems.map((i) => i.id), ['i2', 'i1'])
})

test('preserves other plan fields untouched', () => {
  const plan = { id: 'p1', title: 'תפריט', notes: 'הערה', trainee_id: 't1', meals: [] }
  const sorted = sortPlan(plan)
  assert.equal(sorted.id, 'p1')
  assert.equal(sorted.title, 'תפריט')
  assert.equal(sorted.notes, 'הערה')
  assert.equal(sorted.trainee_id, 't1')
})
