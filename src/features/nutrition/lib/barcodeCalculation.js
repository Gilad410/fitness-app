// Pure calculation for a barcode-scanned food entry -- no Vue/Supabase
// import, same DI-testing convention as every other module in this
// directory (see barcodeCalculation.test.mjs).
//
// This mirrors, byte-for-byte, the formula the server-side trigger will
// apply (see the barcode branch drafted in
// 045_trainee_nutrition_logs_barcode_source.sql): calories = kcal/100g *
// grams / 100, protein = protein/100g * grams / 100, both rounded to 1
// decimal place. Having the identical formula here lets the review step
// show an accurate live preview before saving, without waiting on a
// round-trip to Supabase -- the DB trigger remains the actual source of
// truth for the stored value; this is a client-side preview only, same
// relationship recipeCalculator.js/foodCatalogPlausibility.js have to
// their own server-side counterparts elsewhere in this codebase.
export function calculateBarcodeNutrition({ caloriesPer100g, proteinPer100g, grams }) {
  if (typeof caloriesPer100g !== 'number' || !Number.isFinite(caloriesPer100g) || caloriesPer100g < 0) {
    throw new Error('calculateBarcodeNutrition: caloriesPer100g must be a finite number >= 0')
  }
  if (proteinPer100g !== null && (typeof proteinPer100g !== 'number' || !Number.isFinite(proteinPer100g) || proteinPer100g < 0)) {
    throw new Error('calculateBarcodeNutrition: proteinPer100g must be null or a finite number >= 0')
  }
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
    throw new Error('calculateBarcodeNutrition: grams must be a finite number > 0')
  }

  return {
    calories: round1(caloriesPer100g * grams / 100),
    // Unknown protein stays unknown -- never coerced to 0, matching how
    // a food/restaurant-item with unset protein already behaves
    // throughout this feature (nutritionLogsCore.js's
    // dailyHasUnknownProtein, entryDisplay.js's "חלבון לא ידוע").
    protein: proteinPer100g === null ? null : round1(proteinPer100g * grams / 100),
  }
}

function round1(n) {
  return Math.round(n * 10) / 10
}
