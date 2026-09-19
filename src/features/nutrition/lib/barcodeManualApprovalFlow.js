// Pure decision logic for the "found without nutrition -> manual details
// -> approval/save -> quantity -> save food log" path in
// BarcodeFoodEntry.vue. Extracted specifically because THIS was the real
// bug reported: manual nutrition entry, quantity entry, the coach-cache
// save, and the trainee-log save used to be combined into a single
// step/button, with no explicit boundary between "approved and saved to
// your cache" and "logged for this trainee today" -- a coach who backed
// out (or whose cache-save silently failed) after approving could end up
// with nothing logged and no clear indication anything had happened, and
// with no way to continue to quantity without going back and re-scanning.
//
// Pure/DI: no Vue, no Supabase -- takes only the plain values the real
// component already has in hand at the moment of approval, so the exact
// navigation contract fixed here (proceed to quantity ALWAYS, regardless
// of whether the cache-save succeeded; never claim a value was cached
// when it wasn't) is asserted independently of mounting the component.

// The step BarcodeFoodEntry.vue transitions to immediately after a
// manual nutrition approval -- the SAME 'found' step already used for an
// Open Food Facts match with usable nutrition and for a previously
// coach-saved reuse, so quantity entry and the final log-save button are
// identical regardless of where the product came from. There is
// deliberately no other step in between and no path back through
// "re-enter the barcode": this function always returns the same value,
// which is the concrete meaning of "must not require going back and
// scanning again to enter food data."
export function nextStepAfterManualApproval() {
  return 'found'
}

// The exact product shape the reused 'found' step (and its existing
// confirmFound()) expects, built from what the coach just typed and
// approved -- independent of whether a coach-cache save was attempted or
// succeeded, since quantity/log-save must never depend on that.
export function productFromManualApproval({ productName, caloriesPer100g, proteinPer100g }) {
  return {
    name: productName,
    caloriesPer100g,
    proteinPer100g,
    source: 'manual',
    sourceUrl: null,
  }
}

// Which note the 'found' step should show about the (separate, already-
// completed-or-failed-by-this-point) coach-cache save:
// - 'not_applicable': this barcode was never eligible for caching (the
//   not_found path -- Open Food Facts never confirmed a product/barcode
//   association to cache in the first place).
// - 'saved': the cache save was attempted and succeeded -- safe to tell
//   the coach the values are remembered for next time.
// - 'failed': the cache save was attempted and failed -- must NEVER be
//   reported as 'saved' (that would be exactly the kind of silent-
//   discard this feature exists to avoid); the detailed error is shown
//   separately (see categorizeSaveFailure.js), this only decides which
//   short note accompanies the quantity step.
export function manualApprovalCacheOutcome({ canSaveForFuture, cacheSaveSucceeded }) {
  if (!canSaveForFuture) return 'not_applicable'
  return cacheSaveSucceeded ? 'saved' : 'failed'
}
