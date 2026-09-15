// Pure, framework-agnostic persistence for the coach's remembered
// trainee selection -- no Pinia/Vue/window import at the top level, so
// the actual read/write/clear/per-coach-keying logic is fully
// unit-testable under plain Node with a fake in-memory storage object,
// not just "doesn't crash without a DOM". src/features/trainees/store/selectedTrainee.js
// (the real Pinia store, used by the app) is a thin wrapper around this.
//
// Keyed by the coach's own auth user id -- see storageKey() -- so a
// different coach signing in on the same browser never even reads the
// previous coach's remembered selection.

export function storageKey(coachUserId) {
  return `fitness-app:selected-trainee:${coachUserId}`
}

// Real window.localStorage when available (a real browser); null
// otherwise (plain Node, SSR, or a browser with storage disabled/private
// browsing that throws on access) -- callers below already treat a null
// storage as "nothing persisted", never as an error.
export function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readSelectedTrainee(coachUserId, storage = defaultStorage()) {
  if (!coachUserId || !storage) return null
  try {
    return storage.getItem(storageKey(coachUserId))
  } catch {
    // Storage can throw on access (quota, disabled, private browsing) --
    // fails safe to "nothing remembered", never to a crash.
    return null
  }
}

export function writeSelectedTrainee(coachUserId, traineeId, storage = defaultStorage()) {
  if (!coachUserId || !storage) return
  try {
    storage.setItem(storageKey(coachUserId), traineeId)
  } catch {
    // Best-effort only -- an in-memory-only selection for the rest of
    // this tab's session is still strictly better than throwing.
  }
}

export function clearSelectedTrainee(coachUserId, storage = defaultStorage()) {
  if (!coachUserId || !storage) return
  try {
    storage.removeItem(storageKey(coachUserId))
  } catch {
    // Best-effort -- see writeSelectedTrainee() above.
  }
}

// The actual "an explicit trainee id in a route takes precedence over
// remembered selection, and a since-invalidated remembered id is cleared
// rather than kept" decision -- called identically from every workspace
// view's own onMounted (NutritionWorkspaceView.vue, ProgressWorkspaceView.vue,
// TrainingProgramsListView.vue, TraineeDetailView.vue) once each has
// resolved (or failed to resolve) its own route param against
// useTraineesStore().getById(...). Pure and side-effect-free -- the
// caller is what actually calls store.select()/store.clear() based on
// the returned action, this only decides WHICH one (or neither):
//
//   - resolvedTraineeId is truthy (a real, accessible trainee was found
//     for this route) -> { type: 'select', traineeId: resolvedTraineeId }
//     -- the route always wins, regardless of anything previously
//     remembered.
//   - resolvedTraineeId is falsy AND the currently remembered id is
//     EXACTLY this route's own param (the remembered trainee itself is
//     what just failed to resolve -- deleted, or never existed) ->
//     { type: 'clear' }.
//   - resolvedTraineeId is falsy but the remembered id is for some OTHER
//     trainee (a stale/bad link was visited for a trainee that was never
//     the remembered one) -> { type: 'none' } -- a perfectly good,
//     unrelated remembered selection must not be wiped out just because
//     an unrelated bad URL was visited.
export function reconcileSelectionWithRoute({ resolvedTraineeId, routeParamId, rememberedId }) {
  if (resolvedTraineeId) return { type: 'select', traineeId: resolvedTraineeId }
  if (rememberedId === routeParamId) return { type: 'clear' }
  return { type: 'none' }
}
