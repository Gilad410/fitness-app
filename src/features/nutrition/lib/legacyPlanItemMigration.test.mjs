// node --test src/features/nutrition/lib/legacyPlanItemMigration.test.mjs
//
// Tests a hand-mirrored JS reference model of 037's data-migration
// INSERT ... SELECT column mapping -- NOT the actual SQL, which remains
// unexecuted and unverified in this environment (no local Postgres/
// Docker available; 037 has not been applied to any database).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapLegacyItemToMeal } from './legacyPlanItemMigration.js'

test('preserves id, plan_id, and coach_id unchanged (row identity and ownership)', () => {
  const legacyItem = {
    id: 'item-1',
    plan_id: 'plan-1',
    coach_id: 'coach-1',
    name: 'ארוחת בוקר',
    description: null,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
  const meal = mapLegacyItemToMeal(legacyItem)
  assert.equal(meal.id, 'item-1')
  assert.equal(meal.plan_id, 'plan-1')
  assert.equal(meal.coach_id, 'coach-1')
})

test('name maps straight across unchanged', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'ארוחת צהריים', description: null, display_order: 1,
    created_at: 't1', updated_at: 't1',
  }
  assert.equal(mapLegacyItemToMeal(legacyItem).name, 'ארוחת צהריים')
})

test('description becomes notes (column renamed, value unchanged)', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'ארוחת ערב', description: 'להימנע מסוכר', display_order: 2,
    created_at: 't1', updated_at: 't1',
  }
  assert.equal(mapLegacyItemToMeal(legacyItem).notes, 'להימנע מסוכר')
})

test('a null description becomes a null notes, not an empty string or omitted field', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'חטיף', description: null, display_order: 3,
    created_at: 't1', updated_at: 't1',
  }
  assert.equal(mapLegacyItemToMeal(legacyItem).notes, null)
})

test('display_order and both timestamps are preserved exactly -- ordering and history are not reset', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'ארוחת בוקר', description: null, display_order: 5,
    created_at: '2023-06-01T08:00:00Z', updated_at: '2023-09-01T08:00:00Z',
  }
  const meal = mapLegacyItemToMeal(legacyItem)
  assert.equal(meal.display_order, 5)
  assert.equal(meal.created_at, '2023-06-01T08:00:00Z')
  assert.equal(meal.updated_at, '2023-09-01T08:00:00Z')
})

test('the mapped meal has exactly the columns the new table expects -- nothing extra invented, nothing dropped', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'ארוחת בוקר', description: 'הערה', display_order: 0,
    created_at: 't1', updated_at: 't1',
  }
  const meal = mapLegacyItemToMeal(legacyItem)
  assert.deepEqual(
    Object.keys(meal).sort(),
    ['coach_id', 'created_at', 'display_order', 'id', 'name', 'notes', 'plan_id', 'updated_at'],
  )
})

test('no calories/protein/food fields are invented for a legacy row -- the mapped meal carries none', () => {
  const legacyItem = {
    id: 'item-1', plan_id: 'p1', coach_id: 'c1',
    name: 'ארוחת בוקר', description: null, display_order: 0,
    created_at: 't1', updated_at: 't1',
  }
  const meal = mapLegacyItemToMeal(legacyItem)
  assert.equal('calories' in meal, false)
  assert.equal('protein' in meal, false)
  assert.equal('food_id' in meal, false)
})
