// Pure, framework-agnostic core for traineeNutritionPlan.js's loading state
// machine -- no Pinia/Vue/Supabase import, so it can be unit-tested
// directly under Node (see traineeNutritionPlanCore.test.mjs), the same
// strategy already used for supabase/functions/invite-trainee/handler.js.
// Operates on a plain, mutable "state" object with the same shape as the
// Pinia store's own state -- Pinia's `this` inside an action supports the
// same get/set property access a plain object does, so the real store
// (traineeNutritionPlan.js) just passes `this` straight through.
//
// Fixes three bugs an independent review found in the original
// ensureLoaded()/fetchPlan() (a single trainee could see a previous
// trainee's cached plan after a same-SPA-session sign-out/sign-in swap):
//
//   1. loadPromise was never cleared once it settled, so a FAILED load
//      could never be retried (ensureLoaded() kept returning the same
//      rejected promise forever), and a SUCCEEDED load meant "revisiting
//      the nutrition page" never re-fetched, so a coach's edit to the
//      plan would never show up. Fixed: loadPromise (and
//      loadPromiseForUserId) are always cleared in a `.finally()`, and
//      ensureLoaded() never caches a *resolved* load at all -- every call
//      with no load currently in flight starts a fresh one (same
//      "never permanently cache" convention already used by
//      nutritionLogsStore.ensureLoaded()/progressPhotosStore.ensureLoaded()
//      elsewhere in this codebase).
//   2. Nothing scoped a load, or the value it produced, to WHICH signed-in
//      user it was for. Fixed: every call carries the current user's id
//      (or null, for "signed out"); a different id than whoever the
//      currently-held `plan` belongs to synchronously clears it BEFORE a
//      new load starts (so not even a brief instant shows the wrong
//      user's data), and loadPromiseForUserId scopes in-flight dedup to
//      the same id (a load in flight for user A is never handed back to
//      user B's ensureLoaded() call -- B starts its own).
//   3. A slow response could still be committed after the signed-in user
//      had since changed (another sign-in/out completed while the
//      request was outstanding). Fixed: the resolved value is only
//      committed if the signed-in user is STILL the one the load was
//      started for, checked again at response time via the same
//      getCurrentUserId() the caller already provides -- a stale response
//      for a since-changed user is silently discarded instead.
//
// Together, "signed out" is not a special case at all -- it is just
// another identity (represented as null), so the exact same mismatch
// check that isolates trainee A's data from trainee B's also clears
// state the instant anyone signs out, the next time (or even mid-flight,
// for #3) this store is touched. There is deliberately no separate
// "reset on sign-out" hook wired into the shared auth store for this
// (which would need that store to import this one, a real circular
// import risk) -- every real read path in this app already goes through
// ensureLoaded() first (see traineeNutritionPlan.js / its component), so
// this lazy, access-time check closes the leak completely. A belt-and-
// suspenders explicit reset() is still called from the trainee's own
// logout action (TraineeHeader.vue) for the common sign-out path.

export function ensureLoaded(state, { getCurrentUserId, fetchPlan }) {
  const currentUserId = getCurrentUserId()

  // A different identity than whoever `plan` currently reflects --
  // clear synchronously, before kicking off any new load, so nothing
  // stale from a previous user (or "signed out" itself) is ever visible
  // even for an instant while the fresh load is in flight.
  if (state.loadedForUserId !== null && state.loadedForUserId !== currentUserId) {
    state.plan = undefined
    state.loadedForUserId = null
  }

  // Dedupe: an identical-identity load is already in flight -- reuse it
  // rather than firing a second request. A load in flight for a
  // DIFFERENT identity is not reused; this falls through and starts a
  // fresh one scoped to the current identity instead.
  if (state.loadPromise && state.loadPromiseForUserId === currentUserId) {
    return state.loadPromise
  }

  state.loading = true
  state.error = null

  const promise = fetchPlan()
    .then((data) => {
      // Discard a stale response: only commit if the signed-in identity
      // is still the one this load was started for.
      if (getCurrentUserId() !== currentUserId) return
      state.plan = data
      state.loadedForUserId = currentUserId
    })
    .catch((err) => {
      state.error = 'אירעה שגיאה. נסה/י שוב.'
      throw err
    })
    .finally(() => {
      state.loading = false
      if (state.loadPromise === promise) {
        state.loadPromise = null
        state.loadPromiseForUserId = null
      }
    })

  state.loadPromise = promise
  state.loadPromiseForUserId = currentUserId
  return promise
}

export function reset(state) {
  state.plan = undefined
  state.loadedForUserId = null
  state.loading = false
  state.loadPromise = null
  state.loadPromiseForUserId = null
  state.error = null
}
