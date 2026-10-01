// Plain-Node regression tests (no framework configured in this project --
// run directly with `node nutritionReconcile.test.mjs`; exits non-zero on
// any failure). Pins the confirmed approval defect (barcode 72917589 --
// reader agreement silently treated as stored-value agreement) and the
// identity/basis/prep-state approval gates, so a future change cannot
// silently reintroduce them.
import assert from 'node:assert/strict'
import { roundForCompare, readersAgree, matchesStored, checkApprovalGate, decideOutcome } from './nutritionReconcile.mjs'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok  - ${name}`)
  } catch (err) {
    console.error(`FAIL - ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

console.log('nutritionReconcile.mjs regression tests')

// --- The confirmed defect: reader agreement != stored agreement ---
test('72917589 regression: two readers agreeing on 6.6g must NOT verify a stored 6.8g', () => {
  const outcome = decideOutcome({
    resolvedCalories: 536, resolvedProtein: 6.6, resolvedBasis: '100g', resolvedPrepState: 'as_sold',
    identityMatch1: 'unclear', identityMatch2: 'unclear',
    storedCalories: 536, storedProtein: 6.8,
  })
  assert.equal(outcome.outcome, 'CORRECTION_PROPOSED', 'must propose a correction, not silently verify the stale stored value')
})

test('readersAgree(6.6, 6.6) is true (identical) but that alone must not imply matchesStored to 6.8', () => {
  assert.equal(readersAgree(6.6, 6.6, 'protein'), true)
  assert.equal(matchesStored(6.6, 6.8, 'protein'), false)
})

// --- matchesStored: no percentage-tolerance fudging ---
test('matchesStored rejects a ~3% protein gap that the old formula used to accept (6.6 vs 6.8)', () => {
  assert.equal(matchesStored(6.6, 6.8, 'protein'), false)
})

test('matchesStored accepts genuine repeating-decimal/rounding artifacts in stored data', () => {
  // 250/85*100 = 294.11764705882354 -- a real value, not a discrepancy,
  // once compared at label precision (whole kcal).
  assert.equal(matchesStored(294.1, 294.117647058824, 'calories'), true)
})

test('matchesStored still rejects a genuine sub-gram discrepancy after rounding (3.5 vs 3.6)', () => {
  assert.equal(matchesStored(3.6, 3.548387096774, 'protein'), false)
})

test('matchesStored requires exact match at rounded precision, not "close enough"', () => {
  assert.equal(matchesStored(100, 102, 'calories'), false) // old formula (abs floor min(3, 3%)) would have accepted this
})

// --- checkApprovalGate: identity / basis / prep-state / missing values ---
test('checkApprovalGate blocks approval on identity conflict even with matching numbers', () => {
  const gate = checkApprovalGate({ identityMatch1: 'no', identityMatch2: 'yes', basis: '100g', prepState: 'as_sold', evidenceCalories: 100, evidenceProtein: 5 })
  assert.equal(gate.eligible, false)
  assert.match(gate.reason, /IDENTITY_CONFLICT/)
})

test('checkApprovalGate blocks approval on an unconverted serving-basis value', () => {
  const gate = checkApprovalGate({ identityMatch1: 'yes', identityMatch2: 'yes', basis: 'serving', prepState: 'as_sold', evidenceCalories: 190, evidenceProtein: 3 })
  assert.equal(gate.eligible, false)
  assert.match(gate.reason, /UNCONVERTED_BASIS/)
})

test('checkApprovalGate blocks approval when prep state is unclear', () => {
  const gate = checkApprovalGate({ identityMatch1: 'yes', identityMatch2: 'yes', basis: '100g', prepState: 'unclear', evidenceCalories: 100, evidenceProtein: 5 })
  assert.equal(gate.eligible, false)
  assert.match(gate.reason, /PREP_STATE_UNCLEAR/)
})

test('checkApprovalGate blocks approval on missing calories', () => {
  const gate = checkApprovalGate({ identityMatch1: 'yes', identityMatch2: 'yes', basis: '100g', prepState: 'as_sold', evidenceCalories: null, evidenceProtein: 5 })
  assert.equal(gate.eligible, false)
  assert.match(gate.reason, /MISSING_CALORIES/)
})

test('checkApprovalGate blocks approval on missing protein', () => {
  const gate = checkApprovalGate({ identityMatch1: 'yes', identityMatch2: 'yes', basis: '100g', prepState: 'as_sold', evidenceCalories: 100, evidenceProtein: undefined })
  assert.equal(gate.eligible, false)
  assert.match(gate.reason, /MISSING_PROTEIN/)
})

test('checkApprovalGate allows a clean, fully-identified, 100g, as_sold record through', () => {
  const gate = checkApprovalGate({ identityMatch1: 'yes', identityMatch2: 'unclear', basis: '100g', prepState: 'as_sold', evidenceCalories: 100, evidenceProtein: 5 })
  assert.equal(gate.eligible, true)
})

// --- decideOutcome: full integration ---
test('decideOutcome verifies a genuinely matching, fully-gated record', () => {
  const outcome = decideOutcome({
    resolvedCalories: 60, resolvedProtein: 3.3, resolvedBasis: '100g', resolvedPrepState: 'as_sold',
    identityMatch1: 'unclear', identityMatch2: 'unclear', storedCalories: 60, storedProtein: 3.3,
  })
  assert.equal(outcome.outcome, 'VERIFIED')
})

test('decideOutcome proposes a correction for a genuine mismatch with clean identity/basis', () => {
  const outcome = decideOutcome({
    resolvedCalories: 191, resolvedProtein: 25, resolvedBasis: '100g', resolvedPrepState: 'as_sold',
    identityMatch1: 'yes', identityMatch2: 'yes', storedCalories: 89, storedProtein: 11.6,
  })
  assert.equal(outcome.outcome, 'CORRECTION_PROPOSED')
})

test('decideOutcome returns UNRESOLVED (never VERIFIED) on identity conflict regardless of numeric match', () => {
  const outcome = decideOutcome({
    resolvedCalories: 379, resolvedProtein: 8.5, resolvedBasis: '100g', resolvedPrepState: 'as_sold',
    identityMatch1: 'no', identityMatch2: 'unclear', storedCalories: 379, storedProtein: 8.5,
  })
  assert.equal(outcome.outcome, 'UNRESOLVED')
})

test('roundForCompare matches nutrition-label printing precision (whole kcal, 0.1g protein)', () => {
  assert.equal(roundForCompare(294.117647058824, 'calories'), 294)
  assert.equal(roundForCompare(6.8333333, 'protein'), 6.8)
})

console.log(`\n${passed} test(s) passed${process.exitCode ? ', SOME FAILED' : ''}`)
