// Pure mapping from BarcodeFoodEntry.vue's 'resolved' payload (the same
// shape emitted for every source -- an Open Food Facts match, a
// previously coach-approved reuse, or a fresh manual entry) to
// trainee_log_nutrition_entry()'s barcode-path RPC parameters
// (047_trainee_barcode_nutrition_logging.sql).
//
// Extracted so this mapping -- the one thing standing between "a
// barcode was resolved on screen" and "the trainee's log actually
// receives it" -- is directly testable without a live Supabase call,
// matching this codebase's established convention that a Pinia store
// calling supabase.rpc() is never unit-tested itself (see
// foods.js/nutritionLogs.js/traineeNutrition.js's own addEntry()), but
// the pure logic feeding it is.
export function buildTraineeBarcodeLogRpcParams(resolved, loggedAt) {
  return {
    p_barcode: resolved.barcode ?? null,
    p_barcode_source: resolved.barcode_source ?? null,
    p_barcode_product_name: resolved.barcode_product_name ?? null,
    p_barcode_calories_per_100g: resolved.barcode_calories_per_100g ?? null,
    p_barcode_protein_per_100g: resolved.barcode_protein_per_100g ?? null,
    p_grams: resolved.grams ?? null,
    p_logged_at: loggedAt,
  }
}
