// A plain-JS REFERENCE MODEL of section 4's data-migration INSERT ...
// SELECT in supabase/sql/037_nutrition_plan_meals_and_items.sql:
//
//   insert into public.trainee_nutrition_plan_meals
//     (id, plan_id, coach_id, name, notes, display_order, created_at, updated_at)
//   select
//     id, plan_id, coach_id, name, description, display_order, created_at, updated_at
//   from public.trainee_nutrition_plan_items;
//
// IMPORTANT: this does NOT execute or verify the actual SQL -- no local
// Postgres/Docker is available in this environment, and 037 has not been
// applied to any database. This module exists so the column mapping
// itself (which field becomes which, and that nothing is silently
// dropped or invented) has SOME automated regression coverage, kept
// side-by-side comparable with the SQL above so a future edit to one
// that isn't mirrored in the other is easy to spot. It does not exercise
// the database's own behavior (constraints, defaults, transactional
// atomicity with the DROP TABLE that follows it).
export function mapLegacyItemToMeal(legacyItem) {
  return {
    id: legacyItem.id,
    plan_id: legacyItem.plan_id,
    coach_id: legacyItem.coach_id,
    name: legacyItem.name,
    notes: legacyItem.description,
    display_order: legacyItem.display_order,
    created_at: legacyItem.created_at,
    updated_at: legacyItem.updated_at,
  }
}
