// Pure helpers for reordering a nutrition plan's items -- no Pinia/
// Supabase import, unit-tested directly under Node (see
// nutritionPlansCore.test.mjs), the same dependency-injection strategy
// already used for supabase/functions/invite-trainee/handler.js and
// traineeNutritionPlanCore.js.
//
// Fixes bugs an independent review found in the original moveItem()
// (nutritionPlans.js):
//
//   1. It swapped ARRAY POSITIONS but never updated the two swapped
//      items' own `display_order` FIELDS to match. A second move
//      immediately afterward re-sorted by those now-stale fields, which
//      silently undid-then-redid the first swap instead of advancing --
//      e.g. starting from A(0),B(1),C(2), moving A down twice produced
//      B,A,C instead of the expected B,C,A. computeMove() below updates
//      both together, so local state is always internally consistent.
//   2. The two display_order writes were two independent, non-atomic
//      database calls -- if one succeeded and the other failed, the
//      database was left in a partially-swapped state that "restoring
//      the local array" could never actually undo. Fixed server-side by
//      036_nutrition_plan_item_reorder.sql's coach_swap_nutrition_plan_items()
//      RPC (a single atomic transaction: both change or neither does) --
//      moveItem() below calls that instead of issuing two updates itself.
//   3. Nothing stopped two overlapping moveItem() calls for the same
//      plan from racing each other. moveItem() below refuses (throws) a
//      second call while one is already in flight for the same plan,
//      via the injected `reorderState`.

// Given the CURRENT items (any order) and which item to move (direction:
// -1 up / +1 down), returns the two items being swapped plus a NEW items
// array with BOTH the array position AND each swapped item's own
// display_order field updated to match reality after the swap. Returns
// null for a no-op move (item not found, or already at that edge).
export function computeMove(items, itemId, direction) {
  const sorted = [...items].sort((a, b) => a.display_order - b.display_order)
  const index = sorted.findIndex((i) => i.id === itemId)
  const targetIndex = index + direction
  if (index === -1 || targetIndex < 0 || targetIndex >= sorted.length) return null

  const current = sorted[index]
  const target = sorted[targetIndex]

  const swappedCurrent = { ...current, display_order: target.display_order }
  const swappedTarget = { ...target, display_order: current.display_order }

  const reorderedItems = [...sorted]
  reorderedItems[index] = swappedTarget
  reorderedItems[targetIndex] = swappedCurrent

  return { current, target, reorderedItems }
}

// Orchestrates one moveItem() call. `planState`/`reorderState` are plain
// objects (or Pinia-store-backed get/set adapters -- see
// nutritionPlans.js) exposing `.items` and `.inFlight` respectively;
// `deps.swapItems(idA, idB)` performs the actual (atomic, server-side)
// persistence and must throw on failure. Optimistic: `planState.items` is
// updated immediately for a responsive UI, then rolled back to its exact
// pre-move value if `swapItems` throws -- safe to do unconditionally
// because the swap is atomic server-side (see point 2 above): a failure
// here means the database genuinely never changed, so restoring the
// local snapshot is always accurate, never a guess.
export async function moveItem(planState, reorderState, itemId, direction, { swapItems }) {
  if (reorderState.inFlight) {
    throw new Error('A reorder is already in progress for this plan.')
  }

  const move = computeMove(planState.items, itemId, direction)
  if (!move) return

  const { current, target, reorderedItems } = move
  const previousItems = planState.items

  reorderState.inFlight = true
  planState.items = reorderedItems

  try {
    await swapItems(current.id, target.id)
  } catch (err) {
    planState.items = previousItems
    throw err
  } finally {
    reorderState.inFlight = false
  }
}
