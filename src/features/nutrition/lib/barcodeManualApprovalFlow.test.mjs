import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextStepAfterManualApproval,
  productFromManualApproval,
  manualApprovalCacheOutcome,
  isEligibleForCoachCache,
} from './barcodeManualApprovalFlow.js'

// ---------------------------------------------------------------------
// Reproduces the exact reported navigation bug: "barcode found without
// nutrition -> manual details -> approval/save -> quantity -> save food
// log" must be reachable in one continuous flow, with no forced
// back-and-rescan step, and the cache save and log save must stay
// separable -- a cache-save failure must never block reaching quantity,
// and must never be misreported as a success.
// ---------------------------------------------------------------------

test('nextStepAfterManualApproval: always proceeds straight to the quantity/log-save step -- no intermediate step, no path back to re-scanning', () => {
  assert.equal(nextStepAfterManualApproval(), 'found')
})

test('productFromManualApproval: builds the exact shape the reused quantity step (and confirmFound) expects, from the coach-typed values', () => {
  const product = productFromManualApproval({
    productName: 'Milka Alpenmilch',
    caloriesPer100g: 534,
    proteinPer100g: 6.3,
  })
  assert.deepEqual(product, {
    name: 'Milka Alpenmilch',
    caloriesPer100g: 534,
    proteinPer100g: 6.3,
    source: 'manual',
    sourceUrl: null,
  })
})

test('productFromManualApproval: an unknown protein value passes through as null, not coerced to 0 -- the quantity step must not fabricate a value', () => {
  const product = productFromManualApproval({ productName: 'x', caloriesPer100g: 300, proteinPer100g: null })
  assert.equal(product.proteinPer100g, null)
})

test('manualApprovalCacheOutcome: not_found path (never eligible for caching) -> not_applicable, regardless of the cacheSaveSucceeded flag', () => {
  assert.equal(manualApprovalCacheOutcome({ canSaveForFuture: false, cacheSaveSucceeded: true }), 'not_applicable')
  assert.equal(manualApprovalCacheOutcome({ canSaveForFuture: false, cacheSaveSucceeded: false }), 'not_applicable')
})

test('manualApprovalCacheOutcome: eligible barcode, cache save succeeded -> saved', () => {
  assert.equal(manualApprovalCacheOutcome({ canSaveForFuture: true, cacheSaveSucceeded: true }), 'saved')
})

test('manualApprovalCacheOutcome: eligible barcode, cache save failed -> failed, never silently reported as saved -- the exact "silently discard an approved product" gap this whole feature exists to close', () => {
  assert.equal(manualApprovalCacheOutcome({ canSaveForFuture: true, cacheSaveSucceeded: false }), 'failed')
})

// ---------------------------------------------------------------------
// End-to-end assertion of the reported contract, composing all three
// pure functions exactly as BarcodeFoodEntry.vue's approveManual() does:
// even in the worst case (cache save fails), the coach still lands on
// the quantity step with a real, usable product to log.
// ---------------------------------------------------------------------

test('SCENARIO: manual approval whose cache save fails still reaches the quantity/log-save step with the typed values intact', () => {
  const canSaveForFuture = true
  const cacheSaveSucceeded = false // simulates coachBarcodeProductsStore.save() throwing

  const outcome = manualApprovalCacheOutcome({ canSaveForFuture, cacheSaveSucceeded })
  const product = productFromManualApproval({ productName: 'Milka Alpenmilch', caloriesPer100g: 534, proteinPer100g: 6.3 })
  const nextStep = nextStepAfterManualApproval()

  assert.equal(outcome, 'failed')
  assert.equal(nextStep, 'found')
  assert.equal(product.caloriesPer100g, 534, 'the values the coach typed must still be usable for quantity/log-save even though caching them failed')
})

// ---------------------------------------------------------------------
// isEligibleForCoachCache -- the gate that lets BarcodeFoodEntry.vue be
// reused UNCHANGED for the trainee-side flow (TraineeNutritionView.vue),
// which passes enableCoachCache: false since coach_barcode_products' RLS
// (coach_id = auth.uid()) can never match a trainee's own id.
// ---------------------------------------------------------------------

test('isEligibleForCoachCache: a coach (enableCoachCache: true) scanning a product OFF found but with no nutrition data IS eligible', () => {
  assert.equal(isEligibleForCoachCache({ enableCoachCache: true, lookupStatus: 'no_nutrition_data' }), true)
})

test('isEligibleForCoachCache: a trainee (enableCoachCache: false) is NEVER eligible, even for the exact same no_nutrition_data lookup result a coach would be offered caching for', () => {
  assert.equal(isEligibleForCoachCache({ enableCoachCache: false, lookupStatus: 'no_nutrition_data' }), false)
})

test('isEligibleForCoachCache: a genuinely not_found barcode is never eligible, for a coach or a trainee -- nothing was confirmed by Open Food Facts to cache in the first place', () => {
  assert.equal(isEligibleForCoachCache({ enableCoachCache: true, lookupStatus: 'not_found' }), false)
  assert.equal(isEligibleForCoachCache({ enableCoachCache: false, lookupStatus: 'not_found' }), false)
})
