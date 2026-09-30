import { reactive } from 'vue'

// Rest timer for the trainee's training screen.
//
// No schema change anywhere: the duration comes from the coach's own
// `rest_seconds` on each exercise (023_trainee_training_access.sql
// already returns it, and TraineeTrainingView already displays it as
// text). This only counts it down.
//
// ONE timer at a time, held in a module-level reactive singleton rather
// than a Pinia store. Two reasons: nothing here is server state or is
// shared across features, and the start buttons live in the exercise
// list while the countdown renders in a sticky bar at the bottom --
// which needs shared state but not a store's lifecycle. Starting a
// second rest replaces the first, because a person rests between sets of
// one exercise, not two at once.

export const DEFAULT_REST_SECONDS = 90
// A coach can type anything into the program; a ten-hour rest is a typo,
// not an instruction, and an hour is already far past useful.
export const MAX_REST_SECONDS = 3600

/**
 * The rest duration to actually count down for an exercise.
 * @param {unknown} value the exercise's rest_seconds, possibly null
 */
export function normalizeRestSeconds(value) {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_REST_SECONDS
  const whole = Math.round(n)
  if (whole <= 0) return DEFAULT_REST_SECONDS
  return Math.min(whole, MAX_REST_SECONDS)
}

/**
 * m:ss for a countdown. Negative clamps to 0:00 rather than showing a
 * minus, which would read as a fault rather than "time is up".
 */
export function formatClock(seconds) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Fraction elapsed, 0..1 — drives the progress bar. */
export function restProgress(remaining, total) {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0
  const done = (total - remaining) / total
  return Math.min(1, Math.max(0, done))
}

// ---------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------

export const restState = reactive({
  running: false,
  finished: false,
  remaining: 0,
  total: 0,
  exerciseName: '',
  exerciseId: null,
})

let handle = null

function clear() {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
}

export function startRest(exercise) {
  clear()
  const total = normalizeRestSeconds(exercise?.rest_seconds)
  restState.total = total
  restState.remaining = total
  restState.exerciseName = exercise?.name ?? ''
  restState.exerciseId = exercise?.id ?? null
  restState.running = true
  restState.finished = false

  handle = setInterval(() => {
    restState.remaining -= 1
    if (restState.remaining <= 0) {
      restState.remaining = 0
      restState.running = false
      restState.finished = true
      clear()
      // A short buzz if the device offers one. No sound: a phone in a gym
      // is often on silent, and an unexpected noise mid-set is worse than
      // a missed cue.
      try {
        globalThis.navigator?.vibrate?.([120, 60, 120])
      } catch {
        // vibration is a nicety; never let it break the timer
      }
    }
  }, 1000)
}

export function stopRest() {
  clear()
  restState.running = false
  restState.finished = false
  restState.remaining = 0
  restState.total = 0
  restState.exerciseName = ''
  restState.exerciseId = null
}

export function addRest(seconds) {
  if (!restState.running) return
  restState.remaining = Math.min(MAX_REST_SECONDS, restState.remaining + seconds)
  restState.total = Math.max(restState.total, restState.remaining)
}
