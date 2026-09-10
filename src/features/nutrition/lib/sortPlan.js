// Sorts a fetched nutrition plan's nested meals/items by display_order,
// client-side -- shared by both nutritionPlans.js (coach) and
// traineeNutritionPlan.js (trainee, read-only), so ordering logic isn't
// duplicated (and can't drift) between the two. Used regardless of
// whatever ordering (if any) the server-side nested embed query itself
// applied -- single-level embed ordering (a plan's own items, via
// PostgREST's `referencedTable` option) is confirmed working elsewhere in
// this codebase, but this two-level-deep nested embed's server-side
// ordering behavior has not been verified against a live Postgres in this
// environment, so this function -- not the query -- is the actual
// guarantee that meals and each meal's items always display in the right
// order.
export function sortPlan(plan) {
  if (!plan) return plan
  const meals = [...(plan.meals ?? [])]
    .sort((a, b) => a.display_order - b.display_order)
    .map((meal) => ({
      ...meal,
      items: [...(meal.items ?? [])].sort((a, b) => a.display_order - b.display_order),
    }))
  return { ...plan, meals }
}
