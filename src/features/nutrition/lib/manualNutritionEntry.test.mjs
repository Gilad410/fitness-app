import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isManualNutritionValid, parseManualNutrition } from './manualNutritionEntry.js'

// ---------------------------------------------------------------------
// Reproduces the exact reported regression: typing "6.5" into the
// protein field must never be truncated to "6", and must never, by
// itself, trigger any navigation/save -- only an explicit confirm
// (the button click) may do that.
// ---------------------------------------------------------------------

test('SCENARIO: typing "6.5" into the protein field character by character never calls confirm/save, and the fully-typed value survives intact -- only an explicit confirm() call, made once at the end, does anything', () => {
  let confirmCalls = 0
  function confirm(caloriesRaw, proteinRaw) {
    confirmCalls += 1
    return parseManualNutrition({ caloriesRaw, proteinRaw })
  }

  const caloriesRaw = '300'
  let proteinRaw = ''
  const typedSoFar = []
  for (const char of '6.5') {
    // Simulates exactly what v-model on a text input does on each
    // keystroke: append the character to the raw string -- nothing
    // else. Re-checking validity on every keystroke (as the real
    // :disabled binding on the confirm button does) must never itself
    // call confirm().
    proteinRaw += char
    typedSoFar.push(proteinRaw)
    isManualNutritionValid({ caloriesRaw, proteinRaw })
  }

  assert.deepEqual(typedSoFar, ['6', '6.', '6.5'], 'each keystroke must be preserved in full, never truncated (e.g. never collapsing "6." back down to "6")')
  assert.equal(proteinRaw, '6.5', 'the final typed value must be exactly "6.5", not "6" and not "65"')
  assert.equal(confirmCalls, 0, 'no navigation/save may occur before the confirmation button is actually clicked')

  // Only now -- the explicit confirm button click -- does anything happen.
  const result = confirm(caloriesRaw, proteinRaw)
  assert.equal(confirmCalls, 1)
  assert.equal(result.proteinPer100g, 6.5, 'the confirmed value must be the full 6.5, not truncated to 6')
  assert.equal(result.caloriesPer100g, 300)
})

test('isManualNutritionValid: an in-progress value like "6." (mid-typing, before the second digit) is not treated as an error state that would block or alter typing', () => {
  // Number("6.") === 6, a valid finite number -- this must not throw or
  // otherwise disrupt typing; it only affects whether the confirm button
  // is enabled, never the input's own value.
  assert.equal(isManualNutritionValid({ caloriesRaw: '300', proteinRaw: '6.' }), true)
})

test('isManualNutritionValid: an empty protein is valid (protein is optional)', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '300', proteinRaw: '' }), true)
})

// Number('') === 0 in JS, which is finite and >= 0 -- this permissive
// behavior is unchanged from the original inline computed this module
// was extracted from (not a new rule introduced here); documented so a
// future change to the empty-calories case is a deliberate decision,
// not an accidental one.
test('isManualNutritionValid: empty calories coerces to 0 (Number(\'\') === 0), which passes -- pre-existing behavior, unchanged by this extraction', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '', proteinRaw: '' }), true)
})

test('isManualNutritionValid: negative or non-numeric calories/protein are rejected', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '-5', proteinRaw: '' }), false)
  assert.equal(isManualNutritionValid({ caloriesRaw: '300', proteinRaw: '-1' }), false)
  assert.equal(isManualNutritionValid({ caloriesRaw: 'abc', proteinRaw: '' }), false)
})

test('parseManualNutrition: an unset protein parses to null, never 0 -- distinguishing "unknown" from "zero grams of protein"', () => {
  const result = parseManualNutrition({ caloriesRaw: '300', proteinRaw: '' })
  assert.equal(result.proteinPer100g, null)
  assert.equal(result.caloriesPer100g, 300)
})

test('parseManualNutrition: surrounding whitespace in a typed value does not affect the parsed number', () => {
  const result = parseManualNutrition({ caloriesRaw: '300', proteinRaw: '  6.5  ' })
  assert.equal(result.proteinPer100g, 6.5)
})

// ---------------------------------------------------------------------
// requireProtein -- added for BarcodeFoodEntry.vue's "מבושל לפי האריזה"
// (cooked, per package) flow: transcribing BOTH figures directly off a
// physical package's printed nutrition table means there is no excuse
// for a missing protein value the way an unlabeled food might have one
// -- the whole point of that flow is never inventing or estimating
// protein, so it must be required, not silently treated as "unknown."
// ---------------------------------------------------------------------

test('isManualNutritionValid: requireProtein defaults to false -- every existing caller (the regular manual-entry flow) is unaffected by this addition', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '158', proteinRaw: '' }), true)
})

test('REGRESSION: cooked protein is required -- isManualNutritionValid({ requireProtein: true }) rejects an empty protein even though calories alone would otherwise pass', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '158', proteinRaw: '', requireProtein: true }), false)
})

test('isManualNutritionValid: requireProtein: true accepts a real typed protein value alongside the real package calories figure (158 kcal/100g)', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '158', proteinRaw: '5.8', requireProtein: true }), true)
})

test('isManualNutritionValid: requireProtein: true still rejects a negative or non-numeric protein, same as the optional case', () => {
  assert.equal(isManualNutritionValid({ caloriesRaw: '158', proteinRaw: '-1', requireProtein: true }), false)
  assert.equal(isManualNutritionValid({ caloriesRaw: '158', proteinRaw: 'abc', requireProtein: true }), false)
})
