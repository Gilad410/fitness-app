// Shared reconciliation primitives for the nutrition-catalog audit.
//
// This module exists to fix a confirmed approval defect: prior reconciler
// scripts (reconcileSecondReads.mjs, reconcileThe24.mjs,
// reconcilePendingDualRead.mjs) used ONE tolerance function
// (`closeEnough`, relative <=2% OR absolute <= min(3, 3% of the larger
// value)) for TWO fundamentally different questions:
//   1. Do two independent readers agree on what is printed on the label?
//   2. Does the (agreed) evidence value match the STORED database value?
//
// Collapsing these let reader-agreement silently stand in for
// stored-value agreement. Concrete confirmed case: barcode 72917589 --
// both readers independently read 6.6g protein; stored is 6.8g. The old
// tolerance formula treated 6.6-vs-6.8 as "close enough" (diff 0.2 <=
// floor 0.204) and the record was marked VERIFIED, exporting the
// *original* 6.8g as if confirmed. It was never actually confirmed --
// the evidence contradicts it by a real, printed amount.
//
// Fix: two separate, narrower functions.
//   - readersAgree(): a tight check for whether two readers are
//     transcribing the SAME printed digits (OCR/reading noise only --
//     not a business-logic tolerance). Small absolute tolerance,
//     independent of magnitude.
//   - matchesStored(): NO invented percentage tolerance at all. Both
//     values are rounded to the precision nutrition labels actually
//     print at (whole kcal, 0.1g protein) and compared for EXACT
//     equality after rounding. This absorbs genuine floating-point/
//     repeating-decimal artifacts in stored data (e.g. a stored value
//     computed as 250/85*100 = 294.117647...) without papering over a
//     real, printed discrepancy (6.6 vs 6.8 stays a mismatch after
//     rounding to 1 decimal: 6.6 != 6.8).
//
// Also centralizes the identity/basis/prep-state gates that determine
// whether a record is even ELIGIBLE to be marked VERIFIED or
// CORRECTION_PROPOSED, regardless of numeric agreement -- these were
// previously enforced only ad hoc, by hand, during manual review.

/** Round a value to the precision a printed nutrition label actually uses. */
export function roundForCompare(value, kind) {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  if (kind === 'calories') return Math.round(value)
  if (kind === 'protein') return Math.round(value * 10) / 10
  throw new Error(`roundForCompare: unknown kind "${kind}"`)
}

/**
 * Tight check for whether two independent readers are reading the SAME
 * printed number -- transcription/OCR noise only, not a stored-value
 * comparison. A genuine reader disagreement (misread digit, wrong
 * column) should still fail this and go to manual tie-break.
 */
export function readersAgree(a, b, kind) {
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (a === b) return true
  const diff = Math.abs(a - b)
  if (kind === 'calories') return diff <= 1 // whole-kcal rounding noise only
  if (kind === 'protein') return diff <= 0.1 // one printed decimal place of noise
  throw new Error(`readersAgree: unknown kind "${kind}"`)
}

/**
 * Strict evidence-vs-stored comparison. NO percentage tolerance, NO
 * "close enough" fudge factor -- exact equality after rounding both
 * sides to label-printing precision. A real difference at that
 * precision is always a genuine discrepancy, never silently accepted.
 */
export function matchesStored(evidenceValue, storedValue, kind) {
  const e = roundForCompare(evidenceValue, kind)
  const s = roundForCompare(storedValue, kind)
  if (e === null || s === null) return false
  return e === s
}

/**
 * Gate: is this record even eligible to be classified VERIFIED or
 * CORRECTION_PROPOSED, independent of whether the numbers match?
 * Returns { eligible: boolean, reason: string|null }.
 */
export function checkApprovalGate({ identityMatch1, identityMatch2, basis, prepState, evidenceCalories, evidenceProtein }) {
  if (evidenceCalories === null || evidenceCalories === undefined) {
    return { eligible: false, reason: 'MISSING_CALORIES: evidence calories value is missing -- cannot approve with a missing value.' }
  }
  if (evidenceProtein === null || evidenceProtein === undefined) {
    return { eligible: false, reason: 'MISSING_PROTEIN: evidence protein value is missing -- cannot approve with a missing value.' }
  }
  if (identityMatch1 === 'no' || identityMatch2 === 'no') {
    return { eligible: false, reason: 'IDENTITY_CONFLICT: a reader flagged the evidence as showing a different/unrelated product than the catalog entry.' }
  }
  if (basis && basis !== '100g' && basis !== '100ml') {
    return { eligible: false, reason: `UNCONVERTED_BASIS: evidence basis is "${basis}", not a per-100g/100ml figure -- must be deterministically converted from an explicit printed weight before it can be compared, not approved as-is.` }
  }
  if (prepState === 'unclear') {
    return { eligible: false, reason: 'PREP_STATE_UNCLEAR: raw/cooked (or as-sold/prepared) state could not be established, so the value cannot be confirmed as comparable to the stored basis.' }
  }
  return { eligible: true, reason: null }
}

/**
 * Full outcome decision for a two-reader (or reader+manual-resolution)
 * record. Returns { outcome: 'VERIFIED'|'CORRECTION_PROPOSED'|'UNRESOLVED', reason }.
 * `resolvedCalories`/`resolvedProtein`/`resolvedBasis`/`resolvedPrepState` are
 * the values to use for stored-comparison (post any deterministic
 * conversion); `identityMatch1`/`identityMatch2` are the two readers'
 * (or reader+tie-break's) identity judgments.
 */
export function decideOutcome({
  resolvedCalories, resolvedProtein, resolvedBasis, resolvedPrepState,
  identityMatch1, identityMatch2, storedCalories, storedProtein,
}) {
  const gate = checkApprovalGate({
    identityMatch1, identityMatch2, basis: resolvedBasis, prepState: resolvedPrepState,
    evidenceCalories: resolvedCalories, evidenceProtein: resolvedProtein,
  })
  if (!gate.eligible) {
    return { outcome: 'UNRESOLVED', reason: gate.reason }
  }
  const calMatch = matchesStored(resolvedCalories, storedCalories, 'calories')
  const protMatch = matchesStored(resolvedProtein, storedProtein, 'protein')
  if (calMatch && protMatch) {
    return { outcome: 'VERIFIED', reason: `Evidence (${resolvedCalories}kcal/${resolvedProtein}g) matches stored (${storedCalories}/${storedProtein}) at label precision, no tolerance applied.` }
  }
  return {
    outcome: 'CORRECTION_PROPOSED',
    reason: `Evidence (${resolvedCalories}kcal/${resolvedProtein}g) does NOT match stored (${storedCalories}/${storedProtein}) at label precision (whole kcal, 0.1g protein) -- calMatch=${calMatch}, protMatch=${protMatch}. No tolerance was applied to paper over this.`,
  }
}
