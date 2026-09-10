// A plain-JS REFERENCE MODEL of the decision logic inside
// public.set_nutrition_plan_meal_item_calories() -- the BEFORE INSERT OR
// UPDATE trigger on trainee_nutrition_plan_meal_items
// (supabase/sql/037_nutrition_plan_meals_and_items.sql, section 6).
//
// IMPORTANT: this does NOT execute or verify the actual SQL/PL-pgSQL --
// no local Postgres/Docker is available in this environment (confirmed:
// `which psql`/`docker` both fail here), and 037 has not been applied to
// any database, disposable or otherwise. This module is a hand-mirrored
// re-implementation of the trigger's IS DISTINCT FROM comparison, kept
// deliberately trivial and side-by-side comparable with the SQL so a
// reviewer can check the two agree by reading them, and so a future edit
// to one that isn't mirrored in the other is easy to spot. It exercises
// the DECISION (recalculate vs. preserve), not the actual arithmetic
// (compute_nutrition_amounts() itself, or IS DISTINCT FROM's real NULL
// semantics under Postgres) -- those remain genuinely unverified without
// a live database. See the migration file's own comments for the full
// reasoning (Finding #4: preserving nutritional snapshots on reorder,
// and preventing direct tampering with calculated fields).
//
// shouldRecalculate(tgOp, oldRow, newRow) mirrors:
//   if tg_op = 'UPDATE' then
//     v_source_changed := (
//       new.food_id is distinct from old.food_id
//       or new.grams is distinct from old.grams
//       or new.restaurant_food_item_id is distinct from old.restaurant_food_item_id
//       or new.servings is distinct from old.servings
//     );
//   else
//     v_source_changed := true;
//   end if;
//
// `isDistinctFrom(a, b)` mirrors SQL's IS DISTINCT FROM: like `!==`
// except two nulls/undefined are NOT distinct (unlike SQL's `<>`, which
// would make the whole comparison NULL instead of true/false).
export function isDistinctFrom(a, b) {
  const na = a === undefined ? null : a
  const nb = b === undefined ? null : b
  if (na === null && nb === null) return false
  return na !== nb
}

export function shouldRecalculate(tgOp, oldRow, newRow) {
  if (tgOp !== 'UPDATE') return true
  return (
    isDistinctFrom(newRow.food_id, oldRow.food_id) ||
    isDistinctFrom(newRow.grams, oldRow.grams) ||
    isDistinctFrom(newRow.restaurant_food_item_id, oldRow.restaurant_food_item_id) ||
    isDistinctFrom(newRow.servings, oldRow.servings)
  )
}
