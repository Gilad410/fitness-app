// Shared per-meal and whole-plan nutrition totals -- summed client-side
// from each item's already server-computed calories/protein (the same
// convention NutritionSection.vue's/TraineeNutritionView.vue's own daily
// log totals already use). Used by BOTH NutritionPlanSection.vue (coach)
// and TraineeNutritionPlanSection.vue (trainee) so the two views can
// never drift into showing different totals for the same plan -- no
// database aggregate is needed since every item's calories/protein is
// already the authoritative, server-computed value (037's
// compute_nutrition_amounts()/trigger).
//
// hasUnknownProtein: true when at least one item's protein is null (the
// food/restaurant item it references has no protein_per_100g /
// protein_per_serving on record) -- the summed protein total silently
// excludes that item, so callers must show this flag alongside the total
// rather than letting a partial sum look complete.
//
// itemCount (mealTotals only) / hasLegacyMealsWithoutItems (planTotals):
// a meal with zero items is a normal, expected state -- either a coach
// hasn't added food entries to it yet, or (037_nutrition_plan_meals_and_items.sql)
// it was promoted from a pre-037 free-text trainee_nutrition_plan_items
// row that had no food reference at all and so carries no calculated
// nutrition data. Both cases render the same "no calculated data" message
// rather than a misleading "0 קק"ל", so callers must be able to tell a
// meal like this apart from one that legitimately totals to zero (which,
// given every item's calories/protein is a computed, always-positive-or-
// null value, cannot actually happen once at least one item exists).
export function mealTotals(meal) {
  const items = meal?.items ?? []
  let calories = 0
  let protein = 0
  let hasUnknownProtein = false
  for (const item of items) {
    calories += Number(item.calories)
    if (item.protein === null) {
      hasUnknownProtein = true
    } else {
      protein += Number(item.protein)
    }
  }
  return { calories, protein, hasUnknownProtein, itemCount: items.length }
}

export function planTotals(plan) {
  const meals = plan?.meals ?? []
  let calories = 0
  let protein = 0
  let hasUnknownProtein = false
  let hasLegacyMealsWithoutItems = false
  for (const meal of meals) {
    const totals = mealTotals(meal)
    calories += totals.calories
    protein += totals.protein
    if (totals.hasUnknownProtein) hasUnknownProtein = true
    if (totals.itemCount === 0) hasLegacyMealsWithoutItems = true
  }
  return { calories, protein, hasUnknownProtein, hasLegacyMealsWithoutItems }
}
