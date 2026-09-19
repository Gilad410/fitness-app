// Pure parsing/validation for the manual_nutrition step's typed-in
// calories/protein fields. Extracted after a real reported regression:
// with these fields as <input type="number">, a decimal value like "6.5"
// could be silently mangled while typing (native number inputs on
// certain mobile keyboards do not reliably keep an in-progress "6." as a
// valid intermediate string), and -- root-caused together with that same
// native-input quirk -- typing into the protein field could prematurely
// fire the same transition approveManual()'s confirm button triggers,
// making the manual-entry screen appear to "disappear" mid-typing.
//
// The fix has two parts:
// 1. BarcodeFoodEntry.vue's calories/protein/grams fields are now plain
//    <input type="text" inputmode="decimal"> bound with v-model -- a
//    text input's v-model keeps the EXACT typed string, character by
//    character ("6" -> "6." -> "6.5"), with no native browser coercion
//    at any point; inputmode="decimal" still gives mobile users a
//    numeric keyboard.
// 2. Deciding whether the form is complete enough to enable the confirm
//    button (isManualNutritionValid) and turning the typed strings into
//    numbers (parseManualNutrition) are two separate, pure functions.
//    Neither is ever called as a side effect of a keystroke -- only an
//    explicit click on the confirm button calls parseManualNutrition().
//    This module has no Vue/DOM dependency, so that contract is directly
//    testable: see manualNutritionEntry.test.mjs for a character-by-
//    character simulation of typing "6.5" that asserts exactly this.

export function isManualNutritionValid({ caloriesRaw, proteinRaw }) {
  const cal = Number(caloriesRaw)
  if (!Number.isFinite(cal) || cal < 0) return false
  const trimmedProtein = String(proteinRaw ?? '').trim()
  if (trimmedProtein === '') return true
  const protein = Number(proteinRaw)
  return Number.isFinite(protein) && protein >= 0
}

// Only ever called from the confirm button's click handler (approveManual()
// in BarcodeFoodEntry.vue) -- turns the validated strings into the
// numbers that get saved to the coach cache and, eventually, logged.
// Never called while typing.
export function parseManualNutrition({ caloriesRaw, proteinRaw }) {
  const proteinTrimmed = String(proteinRaw ?? '').trim()
  return {
    caloriesPer100g: Number(caloriesRaw),
    proteinPer100g: proteinTrimmed === '' ? null : Number(proteinRaw),
  }
}
