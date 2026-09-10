// node --test src/features/nutrition/store/nutritionPlansCore.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMove, moveItem } from './nutritionPlansCore.js'

function item(id, display_order) {
  return { id, display_order, name: id }
}

function ids(items) {
  return items.map((i) => i.id)
}

// ---------------------------------------------------------------------
// computeMove -- the exact bug report repro
// ---------------------------------------------------------------------
test('repeated moves: A(0),B(1),C(2), move A down twice -> B,C,A (not B,A,C)', () => {
  let items = [item('A', 0), item('B', 1), item('C', 2)]

  const move1 = computeMove(items, 'A', 1)
  assert.deepEqual(ids(move1.reorderedItems), ['B', 'A', 'C'])
  // The bug: array position swapped but display_order fields were left
  // stale. The fix must keep them in sync with the new positions.
  assert.equal(move1.reorderedItems.find((i) => i.id === 'A').display_order, 1)
  assert.equal(move1.reorderedItems.find((i) => i.id === 'B').display_order, 0)
  items = move1.reorderedItems

  const move2 = computeMove(items, 'A', 1)
  assert.deepEqual(ids(move2.reorderedItems), ['B', 'C', 'A'], 'the second move must advance, not undo the first')
  items = move2.reorderedItems

  assert.equal(items.find((i) => i.id === 'A').display_order, 2)
  assert.equal(items.find((i) => i.id === 'B').display_order, 0)
  assert.equal(items.find((i) => i.id === 'C').display_order, 1)
})

test('repeated moves: a third down-move past the end is a no-op, not a wraparound', () => {
  let items = [item('A', 0), item('B', 1), item('C', 2)]
  items = computeMove(items, 'A', 1).reorderedItems // -> B,A,C
  items = computeMove(items, 'A', 1).reorderedItems // -> B,C,A (A now last)
  assert.deepEqual(ids(items), ['B', 'C', 'A'])

  const thirdMove = computeMove(items, 'A', 1)
  assert.equal(thirdMove, null, 'A is already last -- moving it down again must be a no-op, not wrap around')
})

test('computeMove is a no-op at the top/bottom edge', () => {
  const items = [item('A', 0), item('B', 1), item('C', 2)]
  assert.equal(computeMove(items, 'A', -1), null, "can't move the first item up")
  assert.equal(computeMove(items, 'C', 1), null, "can't move the last item down")
  assert.equal(computeMove(items, 'missing', 1), null, 'unknown id is a no-op')
})

test('computeMove works from unsorted input (always re-sorts by display_order first)', () => {
  const items = [item('C', 2), item('A', 0), item('B', 1)]
  const move = computeMove(items, 'B', -1)
  assert.deepEqual(ids(move.reorderedItems), ['B', 'A', 'C'])
})

// ---------------------------------------------------------------------
// moveItem -- orchestration: overlap guard, optimistic update, rollback
// ---------------------------------------------------------------------
function makePlanState(items) {
  return { items }
}
function makeReorderState() {
  return { inFlight: false }
}

test('a successful move commits the reordered items and calls swapItems with the right pair', async () => {
  const planState = makePlanState([item('A', 0), item('B', 1), item('C', 2)])
  const reorderState = makeReorderState()
  const calls = []

  await moveItem(planState, reorderState, 'A', 1, {
    swapItems: async (a, b) => {
      calls.push([a, b])
    },
  })

  assert.deepEqual(ids(planState.items), ['B', 'A', 'C'])
  assert.deepEqual(calls, [['A', 'B']])
  assert.equal(reorderState.inFlight, false)
})

test('failed reorder: the local optimistic update is fully rolled back on failure', async () => {
  const original = [item('A', 0), item('B', 1), item('C', 2)]
  const planState = makePlanState(original)
  const reorderState = makeReorderState()

  await assert.rejects(
    moveItem(planState, reorderState, 'A', 1, {
      swapItems: async () => {
        throw new Error('network blip')
      },
    }),
  )

  assert.deepEqual(planState.items, original, 'local state must be restored exactly, not left partially swapped')
  assert.equal(reorderState.inFlight, false, 'the in-flight flag must clear even after a failure')
})

test('after a failed reorder, a retry succeeds normally (not permanently stuck)', async () => {
  const planState = makePlanState([item('A', 0), item('B', 1), item('C', 2)])
  const reorderState = makeReorderState()

  await assert.rejects(
    moveItem(planState, reorderState, 'A', 1, {
      swapItems: async () => {
        throw new Error('network blip')
      },
    }),
  )

  await moveItem(planState, reorderState, 'A', 1, { swapItems: async () => {} })
  assert.deepEqual(ids(planState.items), ['B', 'A', 'C'])
})

test('overlapping reorders for the same plan are refused, not raced', async () => {
  const planState = makePlanState([item('A', 0), item('B', 1), item('C', 2)])
  const reorderState = makeReorderState()

  let releaseFirst
  const first = moveItem(planState, reorderState, 'A', 1, {
    swapItems: () => new Promise((resolve) => (releaseFirst = resolve)),
  })

  // A second reorder while the first is still in flight must be refused
  // outright -- not queued, not silently ignored (silence would look
  // indistinguishable from the click having done nothing).
  await assert.rejects(
    moveItem(planState, reorderState, 'B', 1, { swapItems: async () => {} }),
    /already in progress/,
  )

  releaseFirst()
  await first
  assert.deepEqual(ids(planState.items), ['B', 'A', 'C'], "only the first (legitimate) move must have applied")

  // Once the first has fully settled, a new reorder is allowed again.
  await moveItem(planState, reorderState, 'A', 1, { swapItems: async () => {} })
  assert.deepEqual(ids(planState.items), ['B', 'C', 'A'])
})

test('a no-op move (edge of the list) never sets inFlight or calls swapItems', async () => {
  const planState = makePlanState([item('A', 0), item('B', 1)])
  const reorderState = makeReorderState()
  let called = false

  await moveItem(planState, reorderState, 'A', -1, {
    swapItems: async () => {
      called = true
    },
  })

  assert.equal(called, false)
  assert.equal(reorderState.inFlight, false)
  assert.deepEqual(ids(planState.items), ['A', 'B'])
})
