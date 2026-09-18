// Shared display formatting for one food entry -- a trainee_nutrition_logs
// row or a trainee_nutrition_plan_meal_items row. Both shapes carry the
// exact same relevant fields (food_id/grams OR restaurant_food_item_id/
// servings, plus the embedded `food`/`restaurant_food_item` joins used
// throughout this app), so one implementation covers both -- used by
// NutritionSection.vue (the food log), NutritionPlanSection.vue (coach
// plan builder), and TraineeNutritionPlanSection.vue (read-only trainee
// view), so a meal item and a logged entry always display identically.
//
// A third shape, barcode-sourced entries, exists ONLY on
// trainee_nutrition_logs (never a plan item -- barcode scanning is a
// food-LOG feature only, see 045_trainee_nutrition_logs_barcode_source.sql).
// Its name/source aren't behind a join (there's no separate table row to
// join to -- the product name and per-100g values are snapshotted
// directly onto the log row at scan time), so it's checked first, ahead
// of the two joined-relation branches below, which a barcode row simply
// never has.
//
// Regular foods show "<name>"; restaurant items show "<item> (<chain>)";
// barcode entries show "<product name> (ברקוד)" so the source stays
// obvious without a dedicated column, exactly like the restaurant
// branch already does for its own source.
export function entryDisplayName(entry) {
  if (entry.barcode) {
    return `${entry.barcode_product_name ?? ''} (ברקוד)`
  }
  if (entry.restaurant_food_item) {
    return `${entry.restaurant_food_item.item_name} (${entry.restaurant_food_item.chain_name})`
  }
  return entry.food?.name ?? ''
}

export function entryQuantityLabel(entry) {
  if (entry.barcode) {
    return `${entry.grams} גרם`
  }
  if (entry.restaurant_food_item) {
    const servings = Number(entry.servings)
    const servingsText = Number.isInteger(servings) ? String(servings) : servings.toFixed(1)
    const servingsWord = servings === 1 ? 'מנה' : 'מנות'
    return `${servingsText} ${servingsWord} · ${entry.restaurant_food_item.serving_description}`
  }
  return `${entry.grams} גרם`
}
