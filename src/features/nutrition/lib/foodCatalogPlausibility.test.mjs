import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLAUSIBILITY_BOUNDS, checkPlausibility } from './foodCatalogPlausibility.js'

test('PLAUSIBILITY_BOUNDS defines the same 19 categories CATEGORIES (foodCatalogValidation.js) enumerates', () => {
  assert.equal(Object.keys(PLAUSIBILITY_BOUNDS).length, 19)
  assert.ok(PLAUSIBILITY_BOUNDS.prepared_dish)
})

test('checkPlausibility: a normal value comfortably inside bounds is plausible', () => {
  const { plausible, issues } = checkPlausibility('fruit', 52, 0.3) // apple
  assert.equal(plausible, true)
  assert.deepEqual(issues, [])
})

test('checkPlausibility: an unknown category returns plausible: null, not a false positive', () => {
  const { plausible, issues } = checkPlausibility('not_a_real_category', 100, 5)
  assert.equal(plausible, null)
  assert.equal(issues.length, 1)
  assert.match(issues[0], /unknown category/)
})

test('checkPlausibility: flags calories below the category floor', () => {
  const { plausible, issues } = checkPlausibility('meat_poultry', 10, 20)
  assert.equal(plausible, false)
  assert.match(issues[0], /calories 10 outside plausible range/)
})

test('checkPlausibility: flags protein above the category ceiling', () => {
  const { plausible, issues } = checkPlausibility('fruit', 50, 50)
  assert.equal(plausible, false)
  assert.match(issues.join(' '), /protein 50 outside plausible range/)
})

test('checkPlausibility: non-finite/non-numeric values are always flagged, never silently pass', () => {
  const { plausible, issues } = checkPlausibility('fruit', NaN, undefined)
  assert.equal(plausible, false)
  assert.equal(issues.length, 2)
})

// Note: the חזה עוף צלוי production bug (79 kcal / 16.79g protein, a
// deli-sliced product mismatched for plain roasted breast -- see 041)
// was NOT caught by this bounds check -- 79 kcal and 16.79g protein are
// both inside meat_poultry's [60, 500] / [12, 42] ranges. It was found
// by a separate "implied fat content" heuristic (calories - protein*4
// vs. a threshold), which exists only as uncommitted scratchpad tooling
// and is out of scope for this change. This bounds check and that
// heuristic are complementary, not the same thing -- documented here so
// a future reader doesn't assume this module alone would catch that
// class of error.
test('the meat_poultry bounds alone do NOT catch the חזה עוף צלוי-style error (both its wrong values were within-bounds) -- documents the limits of this check, not a claim it covers everything', () => {
  const wrong = checkPlausibility('meat_poultry', 79, 16.79)
  assert.equal(wrong.plausible, true, 'both values are within meat_poultry bounds -- this check alone would not have flagged it')

  const corrected = checkPlausibility('meat_poultry', 165, 31.02)
  assert.equal(corrected.plausible, true, 'the corrected roasted-breast value also passes')
})

// Regression: the exact reason prepared_dish's ceiling was raised.
test('regression: falafel (514 kcal / 8.28g protein, fdcId 2707408) is plausible under the raised prepared_dish ceiling (was wrongly excluded at the old 500 ceiling)', () => {
  const { plausible, issues } = checkPlausibility('prepared_dish', 514, 8.28)
  assert.equal(plausible, true, 'falafel must pass under the 550 ceiling')
  assert.deepEqual(issues, [])
  assert.equal(PLAUSIBILITY_BOUNDS.prepared_dish.kcal[1], 550, 'the ceiling itself must be 550, not silently reverted')
})

test('the raised prepared_dish ceiling is not unlimited: a value still above 550 is flagged', () => {
  const { plausible, issues } = checkPlausibility('prepared_dish', 700, 10)
  assert.equal(plausible, false)
  assert.match(issues[0], /calories 700 outside plausible range \[40, 550\]/)
})

test('prepared_dish protein bounds are unchanged by the kcal ceiling fix', () => {
  assert.deepEqual(PLAUSIBILITY_BOUNDS.prepared_dish.protein, [2, 35])
})
