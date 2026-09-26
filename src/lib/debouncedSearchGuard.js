// Guards a single async, debounced search against the classic
// stale-response race: a slower older request finishing after a faster
// newer one and overwriting its results, error, or loading state. This
// is the exact shape TraineeNutritionView.vue's reference-catalog search
// (U5) has to guard against. Framework-agnostic (no Vue, no timers) so
// it is fully unit-testable on its own; the caller owns the debounce
// timer, the actual fetch call, and where to write the outcome.
export function createSearchGuard() {
  let requestId = 0
  return {
    // Claims the next request id. Call this once per request, right
    // before starting the fetch.
    start() {
      requestId += 1
      return requestId
    },
    // True only if `token` is still the most recently started request --
    // i.e. nothing newer has started (start()) or invalidated
    // (invalidate()) since.
    isCurrent(token) {
      return token === requestId
    },
    // Discards whatever is currently in flight: nothing it resolves or
    // rejects with will pass isCurrent() again. Call this when the
    // query itself becomes invalid (the field changed, was cleared, the
    // entry source switched, the form reset, or a result was picked) --
    // as opposed to merely being superseded by a newer query of the same
    // kind, which start() already handles.
    invalidate() {
      requestId += 1
    },
  }
}

// A response is safe to apply to the UI only if BOTH the request id is
// still the guard's current one AND the term it was fetched for still
// equals what the field currently holds. Neither check alone is
// sufficient:
// - the id alone would miss the field having been edited back to a
//   value that was never actually (re-)searched yet (still mid-debounce
//   for a different pending request that just hasn't started).
// - the term alone would miss a genuinely superseded request for the
//   exact same term (e.g. clicking retry again before the first retry's
//   request has resolved).
export function isApplicableSearchResponse({ guard, token, requestTerm, currentTerm }) {
  return guard.isCurrent(token) && requestTerm === currentTerm
}
