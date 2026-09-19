// Pure, in-memory operations on a { [barcode]: row } cache -- the exact
// mechanics coachBarcodeProducts.js (a thin Supabase-touching Pinia
// store, not unit tested here -- same established convention as
// foods.js/nutritionLogs.js) uses internally for its `byBarcode` state.
// Extracted so "approve -> save -> scan again -> automatic reuse" is
// directly, exhaustively testable without mocking Supabase (see
// barcodeProductCache.test.mjs) -- no network/DI involved, this is
// genuinely just object-shape logic, but it's the exact logic that
// decides whether a barcode is remembered.
export function lookupCachedProduct(byBarcode, barcode) {
  return byBarcode[barcode] ?? null
}

// Returns a NEW cache object with `row` stored under `barcode` --
// never mutates the input, matching every other store in this app's
// "replace, don't mutate" state-update convention (see foods.js's own
// `this.foods = [...this.foods, data]`). Re-approving an
// already-cached barcode overwrites the existing entry, mirroring the
// database's own upsert(..., {onConflict: 'coach_id,barcode'})
// semantics -- one row per barcode, not a growing duplicate list.
export function withCachedProduct(byBarcode, barcode, row) {
  return { ...byBarcode, [barcode]: row }
}
