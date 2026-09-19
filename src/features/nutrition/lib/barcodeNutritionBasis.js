// Decides, and applies, the nutrition BASIS (as-sold/dry vs.
// prepared/cooked) for an Open-Food-Facts-matched product -- the
// pasta-nutrition-basis investigation. A real reported bug: a barcode
// was correctly recognized as pasta and calories/protein/grams were
// saved, but the app used the product's DRY/uncooked per-100g values
// while the trainee had weighed and entered the amount as COOKED pasta
// -- overstating calories, since cooked pasta absorbs water and is
// roughly 2-2.5x heavier per gram of dry-pasta-equivalent, meaning the
// same gram figure at the dry-basis calorie density is far too high.
//
// The fix does NOT invent a dry-to-cooked conversion factor (pasta
// cook time/shape/water absorption varies enough that any single ratio
// would be a guess, not a fact) -- it uses ONLY real data:
// - When Open Food Facts itself provides a genuinely different
//   "prepared" (as-eaten, after cooking/rehydration/brewing) nutrition
//   figure for this exact product (extractPreparedCaloriesPer100g,
//   barcodeNutrientExtraction.js) -- verified as a real, populated OFF
//   convention against live data (see that module's own comment) --
//   the coach/trainee is asked which basis matches what they weighed,
//   and the CORRESPONDING REAL NUMBERS are used; nothing is converted.
// - When Open Food Facts has ONLY as-sold data (the common case for
//   plain dry pasta, confirmed against several real barcodes during
//   this investigation -- none carried a `_prepared` field at all),
//   there is no second real number to choose between. The result is
//   labeled plainly as as-sold/dry so the reader understands the basis,
//   and no forced choice is presented (there is nothing genuine to
//   choose from) -- see hasDistinctPreparedBasis() below.
//
// Pure/DI: no Vue, no network -- takes the already-extracted product
// values BarcodeFoodEntry.vue has in hand.

export const BASIS_AS_SOLD = 'as_sold'
export const BASIS_PREPARED = 'prepared'
// A THIRD basis, distinct from the two above: manually typed by the
// coach/trainee from the exact physical package's own printed nutrition
// table, used ONLY when Open Food Facts provides no prepared-basis data
// at all for this exact barcode (needsManualCookedPackageEntry below).
// Explicitly NOT a mapping to any generic or branded-different catalog
// entry -- a real correction made during this investigation: an earlier
// draft of this feature proposed resolving to a generic USDA "cooked
// pasta" reference-catalog row, which was rejected because a specific
// branded product (e.g. an Osem pasta) can have real cooked-package
// values that differ from that generic figure. The values for this
// basis never come from anywhere but what the coach/trainee themselves
// typed -- see BarcodeFoodEntry.vue's cookedPackageCalories/
// cookedPackageProtein refs and manualNutritionEntry.js's
// requireProtein option (protein is REQUIRED here, never left to
// resolve to "unknown" the way an unlabeled food's might).
export const BASIS_COOKED_PACKAGE = 'cooked_package'

export const BASIS_LABELS = {
  [BASIS_AS_SOLD]: 'כפי שנמכר / יבש',
  [BASIS_PREPARED]: 'לאחר הכנה / מבושל',
  [BASIS_COOKED_PACKAGE]: 'מבושל לפי האריזה',
}

function isRealNumber(value) {
  return value !== null && value !== undefined
}

// True only when Open Food Facts supplied BOTH a real as-sold AND a
// real prepared calories figure for this product -- the one case where
// a genuine choice exists (two real, different numbers; which one
// applies depends on what was actually weighed). A product can also
// have ONLY a prepared figure with no as-sold one at all (a real,
// verified OFF shape -- see barcodeNutrientExtraction.js's own comment
// on barcode 8852018101024) -- that is not a "choice," since there is
// only one real number to use; initialBasisFor() below resolves that
// case automatically. Protein alone (without a prepared calories
// figure) is never enough to trigger a choice -- calories is what
// actually drives the log's numbers.
export function hasDistinctPreparedBasis({ caloriesPer100g, preparedCaloriesPer100g } = {}) {
  return isRealNumber(caloriesPer100g) && isRealNumber(preparedCaloriesPer100g)
}

// Resolves which real per-100g figures feed the calculation for a given
// basis choice. Never computes or converts a value that was not present
// in the extracted product data -- an unset/invalid basis, or a chosen
// basis Open Food Facts has no real number for, resolves to null
// calories, which the caller (BarcodeFoodEntry.vue's preview/confirm
// gating) must treat as "cannot proceed," never as "assume the other
// basis."
export function nutritionForBasis(product, basis) {
  if (basis === BASIS_AS_SOLD) {
    return {
      caloriesPer100g: product?.caloriesPer100g ?? null,
      proteinPer100g: product?.proteinPer100g ?? null,
    }
  }
  if (basis === BASIS_PREPARED) {
    return {
      caloriesPer100g: product?.preparedCaloriesPer100g ?? null,
      proteinPer100g: product?.preparedProteinPer100g ?? null,
    }
  }
  // No basis chosen (or an unrecognized value) -- deliberately resolves
  // to "nothing," not a default guess, so a required-but-unmade choice
  // blocks the save rather than silently picking one.
  return { caloriesPer100g: null, proteinPer100g: null }
}

// The basis BarcodeFoodEntry.vue should start with for a freshly looked
// -up product:
// - Both real as-sold AND real prepared figures exist -> null. An
//   explicit choice is required, and the UI/preview must stay blocked
//   (via nutritionForBasis(product, null) above) until the
//   coach/trainee actually picks one.
// - Only prepared data exists (a real, verified OFF shape -- see
//   barcodeNutrientExtraction.js) -> BASIS_PREPARED automatically:
//   there is exactly one real number, so there is nothing to choose
//   between; the UI shows it labeled, not blocked behind a pointless
//   choice.
// - Only as-sold data exists (the common case for plain dry pasta) ->
//   BASIS_AS_SOLD automatically, same reasoning.
export function initialBasisFor(product) {
  if (hasDistinctPreparedBasis(product)) return null
  if (isRealNumber(product?.preparedCaloriesPer100g)) return BASIS_PREPARED
  return BASIS_AS_SOLD
}

// True when Open Food Facts genuinely provides no prepared-basis data
// at all for this exact barcode -- the case that offers "מבושל לפי
// האריזה" (cooked, per package). Deliberately does NOT look at product
// category/name to decide "this looks like pasta" -- offering a manual
// cooked-entry option is harmless and useful for any as-sold-only
// product (rice, legumes, oats -- anything a coach/trainee might weigh
// after cooking), and avoiding a category heuristic here is also what
// keeps this from ever being tempted to auto-fill a category-based
// guess. When Open Food Facts DOES provide real prepared data
// (hasDistinctPreparedBasis, or the "prepared only" shape
// initialBasisFor already auto-resolves), this stays false -- a real
// number from Open Food Facts itself is preferred over a manual
// re-entry of the same information.
export function needsManualCookedPackageEntry({ preparedCaloriesPer100g } = {}) {
  return !isRealNumber(preparedCaloriesPer100g)
}

// The label appended to the saved barcode_product_name so "the saved
// item shows the chosen basis" durably, without any new database column
// -- barcode_product_name is already a free-text snapshot (045), so
// this is a text convention, not a schema change. Returns the plain
// name unchanged if no recognized basis was resolved (defensive; should
// not happen for a save that passed the preview/confirm gate above).
export function productNameWithBasis(name, basis) {
  const label = BASIS_LABELS[basis]
  if (!label) return name
  return `${name} (${label})`
}
