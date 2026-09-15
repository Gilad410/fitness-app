import { ref } from 'vue'
import { retentionCutoffDate } from './nutritionLogRetention.js'

// A shared, REACTIVE "what's today's 7-day retention cutoff, right now"
// clock -- the piece that was missing from 038_trainee_nutrition_log_retention.sql's
// original rollout (independent review): server-side RLS only filters a
// NEW query; it does nothing for a row already fetched into a Pinia
// store's state before it expired. A nutrition screen left open across
// the Jerusalem calendar-day boundary would keep SHOWING (and totaling)
// an entry the server would already refuse to return if asked again.
//
// `retentionCutoff` is a module-level singleton ref (not one instance per
// component) so BOTH the coach's store (nutritionLogs.js) and the
// trainee's store (traineeNutrition.js) -- which live for the app's
// lifetime, independent of any one component's mount/unmount -- read the
// exact same reactive value inside their getters (nutritionLogsCore.js).
// Whichever nutrition screen is actually mounted
// (NutritionSection.vue or TraineeNutritionView.vue -- never both at once
// in this app's routing) is what keeps it current, via
// startRetentionClock()/stopRetentionClock() below. This mirrors the
// existing `authEventState` module-level reactive() singleton in
// supabaseClient.js -- same reasoning: a value multiple independent
// consumers need to read reactively, that outlives any single component.
//
// Because a Pinia getter is itself a Vue computed(), and a component-level
// computed() that calls that getter reads `retentionCutoff.value`
// SYNCHRONOUSLY, inside its own evaluation (via nutritionLogsCore.js's
// functions) -- Vue's dependency tracking correctly attributes that read
// to whichever computed is calling it, exactly the same mechanism that
// already makes state.logsByTrainee[traineeId] mutations propagate to
// NutritionSection.vue's `logs`/`groupedLogs`/`todayTotal` computeds
// today. No change is needed at any of those call sites for them to
// become retention-reactive too -- only the getters' own bodies (see
// nutritionLogs.js / traineeNutrition.js) needed to start reading this
// ref.
export const retentionCutoff = ref(retentionCutoffDate())

// Recomputes retentionCutoff.value from `now`. Returns true if the value
// actually changed (used by tests; Vue's reactivity is already a no-op
// for an unchanged primitive assignment, so callers never need to check
// this for correctness).
export function refreshRetentionCutoff(now = () => new Date()) {
  const next = retentionCutoffDate(now())
  const changed = next !== retentionCutoff.value
  retentionCutoff.value = next
  return changed
}

// Cheap, and frequent enough that a screen left open across midnight --
// with the tab staying visible/focused the whole time, e.g. an
// always-on external display, the one case visibilitychange/focus below
// cannot catch on their own -- reflects the new day within a minute of
// it actually turning over, with zero user interaction.
const DEFAULT_INTERVAL_MS = 60_000

let refCount = 0
let intervalHandle = null
let clearIntervalRef = null
let removeVisibilityListener = null
let removeFocusListener = null

// Idempotent, reference-counted start -- safe to call from more than one
// mounted component (or the same component mounting more than once
// before a prior instance's stop() runs) without leaking duplicate
// timers/listeners: the underlying setInterval/event listeners are only
// ever actually attached on the FIRST start() (refCount 0 -> 1) and only
// ever actually removed once every matching stopRetentionClock() call has
// run (refCount back down to 0).
//
// All dependencies are injected with real-browser defaults so a real
// .vue caller needs zero arguments (`startRetentionClock()`), while a
// test can supply fakes -- a manually-advanceable `now`, a fake
// setInterval/clearInterval pair, and fake
// addVisibilityChangeListener/addFocusListener subscribers -- to
// deterministically exercise "left open across midnight" and "tab
// backgrounded then restored" without real timers, a real DOM, or a real
// clock. See nutritionRetentionClock.test.mjs.
export function startRetentionClock({
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => new Date(),
  setIntervalFn = typeof setInterval === 'function' ? setInterval : null,
  clearIntervalFn = typeof clearInterval === 'function' ? clearInterval : null,
  addVisibilityChangeListener,
  addFocusListener,
} = {}) {
  refCount += 1
  if (refCount > 1) return stopRetentionClock

  // Refresh immediately on start, not just on the first timer tick --
  // e.g. a screen re-mounted after having been navigated away from for a
  // while should show today's correct retention state right away.
  refreshRetentionCutoff(now)

  clearIntervalRef = clearIntervalFn
  if (setIntervalFn) {
    intervalHandle = setIntervalFn(() => refreshRetentionCutoff(now), intervalMs)
  }

  const handleWake = () => refreshRetentionCutoff(now)

  if (addVisibilityChangeListener) {
    removeVisibilityListener = addVisibilityChangeListener(handleWake)
  } else if (typeof document !== 'undefined') {
    const listener = () => {
      // Only worth recomputing when the tab actually becomes visible
      // again (the moment a backgrounded/sleeping tab is restored) --
      // becoming hidden has nothing to refresh.
      if (document.visibilityState === 'visible') handleWake()
    }
    document.addEventListener('visibilitychange', listener)
    removeVisibilityListener = () => document.removeEventListener('visibilitychange', listener)
  }

  if (addFocusListener) {
    removeFocusListener = addFocusListener(handleWake)
  } else if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWake)
    removeFocusListener = () => window.removeEventListener('focus', handleWake)
  }

  return stopRetentionClock
}

// Standalone (not just the value startRetentionClock() returns) so a
// caller can always `import { stopRetentionClock }` directly for
// onUnmounted, exactly symmetric with startRetentionClock() in
// onMounted -- matching this app's established mount/unmount pairing
// convention (e.g. TraineeProgressPhotosSection.vue's preview-URL
// revocation in onBeforeUnmount).
export function stopRetentionClock() {
  if (refCount === 0) return
  refCount -= 1
  if (refCount > 0) return

  if (intervalHandle !== null && clearIntervalRef) clearIntervalRef(intervalHandle)
  intervalHandle = null
  clearIntervalRef = null

  removeVisibilityListener?.()
  removeVisibilityListener = null
  removeFocusListener?.()
  removeFocusListener = null
}
