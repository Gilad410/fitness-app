// Shared display formatting for one food entry -- a trainee_nutrition_logs
// row or a trainee_nutrition_plan_meal_items row. Both shapes carry the
// exact same relevant fields (food_id/grams OR restaurant_food_item_id/
// servings, plus the embedded `food`/`restaurant_food_item` joins used
// throughout this app), so one implementation covers both -- used by
// NutritionSection.vue (the food log), NutritionPlanSection.vue (coach
// plan builder), and TraineeNutritionPlanSection.vue (read-only trainee
// view), so a meal item and a logged entry always display identically.
//
// Regular foods show "<name>"; restaurant items show "<item> (<chain>)"
// so the source stays obvious without a dedicated column, and it works
// for any chain automatically -- nothing here names a specific chain.
export function entryDisplayName(entry) {
  if (entry.restaurant_food_item) {
    return `${entry.restaurant_food_item.item_name} (${entry.restaurant_food_item.chain_name})`
  }
  return entry.food?.name ?? ''
}

export function entryQuantityLabel(entry) {
  if (entry.restaurant_food_item) {
    const servings = Number(entry.servings)
    const servingsText = Number.isInteger(servings) ? String(servings) : servings.toFixed(1)
    const servingsWord = servings === 1 ? 'מנה' : 'מנות'
    return `${servingsText} ${servingsWord} · ${entry.restaurant_food_item.serving_description}`
  }
  return `${entry.grams} גרם`
}
