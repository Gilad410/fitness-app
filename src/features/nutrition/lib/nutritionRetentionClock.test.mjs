// node --test src/features/nutrition/lib/nutritionRetentionClock.test.mjs
//
// Tests the REAL implementation module NutritionSection.vue and
// TraineeNutritionView.vue call in their own onMounted/onUnmounted, and
// that nutritionLogs.js / traineeNutrition.js's getters read from
// directly -- not a model of anything. Real Vue ref()/reactivity (works
// standalone under plain Node, no DOM -- verified elsewhere in this
// repo's test suite already), with setInterval/clearInterval and the
// visibility/focus subscriptions injected as fakes so "midnight passes
// while mounted" and "tab restored after sleep" are deterministic and
// don't depend on real timers, a real DOM, or a real clock.
//
// startRetentionClock()/stopRetentionClock() are MODULE-LEVEL singletons
// (by design -- see the module's own header for why), so every test
// below fully balances its own start() calls with matching stop() calls
// before finishing, leaving the module's internal ref-count/listeners
// clean for the next test in this file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retentionCutoff, refreshRetentionCutoff, startRetentionClock, stopRetentionClock } from './nutritionRetentionClock.js'

// ---------------------------------------------------------------------
// Test doubles -- a manually-advanceable clock, a manually-fireable fake
// interval, and manually-fireable fake visibility/focus subscriptions.
// ---------------------------------------------------------------------
function makeFakeClock(initialIso) {
  let current = new Date(initialIso)
  return {
    now: () => current,
    advanceTo: (iso) => {
      current = new Date(iso)
    },
  }
}

function makeFakeInterval() {
  const callbacks = new Map()
  let nextId = 1
  return {
    setIntervalFn: (fn) => {
      const id = nextId++
      callbacks.set(id, fn)
      return id
    },
    clearIntervalFn: (id) => {
      callbacks.delete(id)
    },
    tick: () => {
      for (const fn of callbacks.values()) fn()
    },
    activeCount: () => callbacks.size,
  }
}

function makeFakeSubscription() {
  let handler = null
  let removeCalls = 0
  return {
    subscribe: (cb) => {
      handler = cb
      return () => {
        handler = null
        removeCalls += 1
      }
    },
    fire: () => handler?.(),
    isSubscribed: () => handler !== null,
    removeCallCount: () => removeCalls,
  }
}

// ---------------------------------------------------------------------
// refreshRetentionCutoff -- the plain recompute step
// ---------------------------------------------------------------------
test('refreshRetentionCutoff updates the shared retentionCutoff ref from the given "now"', () => {
  refreshRetentionCutoff(() => new Date('2026-01-17T10:00:00+02:00'))
  assert.equal(retentionCutoff.value, '2026-01-11')

  const changed = refreshRetentionCutoff(() => new Date('2026-01-18T10:00:00+02:00'))
  assert.equal(retentionCutoff.value, '2026-01-12')
  assert.equal(changed, true)

  const unchanged = refreshRetentionCutoff(() => new Date('2026-01-18T14:00:00+02:00'))
  assert.equal(unchanged, false, 'same calendar day -- no change')
})

// ---------------------------------------------------------------------
// startRetentionClock refreshes immediately, and wires up the interval +
// visibility + focus hooks via injected dependencies
// ---------------------------------------------------------------------
test('startRetentionClock refreshes the cutoff immediately, before any tick', () => {
  const clock = makeFakeClock('2026-02-04T10:00:00+02:00')
  const interval = makeFakeInterval()
  const visibility = makeFakeSubscription()
  const focus = makeFakeSubscription()

  const stop = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: visibility.subscribe,
    addFocusListener: focus.subscribe,
  })

  assert.equal(retentionCutoff.value, '2026-01-29')
  stop()
})

// ---------------------------------------------------------------------
// Scenario 1 (explicitly requested): an entry loaded before midnight
// expires while the screen stays mounted -- driven by the periodic
// interval tick, with the tab never losing focus/visibility the whole
// time (the one case visibilitychange/focus cannot catch on their own).
// ---------------------------------------------------------------------
test('SCENARIO: a screen left mounted across the Jerusalem midnight boundary sees the cutoff advance on the next periodic tick', () => {
  const clock = makeFakeClock('2026-01-16T23:50:00+02:00') // just before midnight, Jan 16
  const interval = makeFakeInterval()

  const stop = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: () => () => {}, // no visibility events in this scenario
    addFocusListener: () => () => {},
  })

  // Before midnight: Jan 16 - 6 = Jan 10. An entry logged on Jan 10 is
  // still exactly at the (inclusive) cutoff -- retained.
  assert.equal(retentionCutoff.value, '2026-01-10')

  // Midnight passes in Jerusalem -- the fake "now" crosses into Jan 17 --
  // but nothing re-reads it until the periodic interval fires.
  clock.advanceTo('2026-01-17T00:05:00+02:00')
  assert.equal(retentionCutoff.value, '2026-01-10', 'must not update on its own without a tick -- only setInterval or a wake event moves it')

  interval.tick()

  assert.equal(retentionCutoff.value, '2026-01-11', 'the periodic tick must pick up the new Jerusalem day')
  // An entry logged Jan 10 is now BELOW the new cutoff -- see
  // nutritionRetentionReactivity.test.mjs for this same scenario carried
  // through to an actual store getter excluding it.

  stop()
})

// ---------------------------------------------------------------------
// Scenario 2 (explicitly requested): returning to a sleeping/background
// tab. Simulates a real browser throttling/pausing a backgrounded tab's
// timers (the interval simply never ticks during that time) -- recovery
// must come from the visibilitychange path alone.
// ---------------------------------------------------------------------
test('SCENARIO: a tab backgrounded across midnight and restored later gets the correct cutoff from visibility restoration alone, with zero interval ticks', () => {
  const clock = makeFakeClock('2026-01-16T20:00:00+02:00')
  const interval = makeFakeInterval()
  const visibility = makeFakeSubscription()

  const stop = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: visibility.subscribe,
    addFocusListener: () => () => {},
  })

  assert.equal(retentionCutoff.value, '2026-01-10')

  // The device sleeps for hours, crossing into the next Jerusalem day --
  // and, realistically, into a later one too, simulating a laptop closed
  // over a weekend. No interval.tick() is ever called here, deliberately
  // -- a backgrounded tab's timers commonly don't fire at all.
  clock.advanceTo('2026-01-19T09:00:00+02:00')
  assert.equal(retentionCutoff.value, '2026-01-10', 'still stale -- nothing has woken the clock yet')

  // The user reopens the laptop / switches back to the tab.
  visibility.fire()

  assert.equal(retentionCutoff.value, '2026-01-13', 'restoring visibility must refresh immediately, without waiting for the next interval tick')

  stop()
})

test('window focus restoration also triggers an immediate refresh, independent of visibilitychange', () => {
  const clock = makeFakeClock('2026-01-16T20:00:00+02:00')
  const interval = makeFakeInterval()
  const focus = makeFakeSubscription()

  const stop = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: () => () => {},
    addFocusListener: focus.subscribe,
  })

  clock.advanceTo('2026-01-18T09:00:00+02:00')
  assert.equal(retentionCutoff.value, '2026-01-10')

  focus.fire()
  assert.equal(retentionCutoff.value, '2026-01-12')

  stop()
})

// ---------------------------------------------------------------------
// Lifecycle cleanup -- reference-counted start/stop
// ---------------------------------------------------------------------
test('stopRetentionClock actually removes the interval and listeners once the last matching start() is stopped', () => {
  const clock = makeFakeClock('2026-01-16T20:00:00+02:00')
  const interval = makeFakeInterval()
  const visibility = makeFakeSubscription()
  const focus = makeFakeSubscription()

  const stop = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: visibility.subscribe,
    addFocusListener: focus.subscribe,
  })

  assert.equal(interval.activeCount(), 1)
  assert.equal(visibility.isSubscribed(), true)
  assert.equal(focus.isSubscribed(), true)

  stop()

  assert.equal(interval.activeCount(), 0, 'the interval must be cleared on stop')
  assert.equal(visibility.isSubscribed(), false, 'the visibility listener must be removed on stop')
  assert.equal(focus.isSubscribed(), false, 'the focus listener must be removed on stop')
})

test('two overlapping start() calls only attach ONE interval/listener set -- stop() must be called once per start() before anything is torn down', () => {
  const clock = makeFakeClock('2026-01-16T20:00:00+02:00')
  const interval = makeFakeInterval()
  const visibility = makeFakeSubscription()

  const stopA = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: visibility.subscribe,
    addFocusListener: () => () => {},
  })
  // A second, overlapping caller (e.g. a second mounted consumer) -- its
  // own injected deps are irrelevant since the clock is already running;
  // start() only actually attaches once, on the very first call.
  const stopB = startRetentionClock({
    now: clock.now,
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
  })

  assert.equal(interval.activeCount(), 1, 'must not attach a second interval for the second start()')

  stopA()
  assert.equal(interval.activeCount(), 1, 'must still be running -- one matching stop() has not been called yet')
  assert.equal(visibility.isSubscribed(), true)

  stopB()
  assert.equal(interval.activeCount(), 0, 'now fully stopped -- every start() has a matching stop()')
  assert.equal(visibility.isSubscribed(), false)
})

test('stopRetentionClock is a safe no-op when the clock was never started', () => {
  assert.doesNotThrow(() => stopRetentionClock())
})

test('stopRetentionClock called more times than startRetentionClock does not go negative or throw', () => {
  const interval = makeFakeInterval()
  const stop = startRetentionClock({
    setIntervalFn: interval.setIntervalFn,
    clearIntervalFn: interval.clearIntervalFn,
    addVisibilityChangeListener: () => () => {},
    addFocusListener: () => () => {},
  })
  stop()
  assert.doesNotThrow(() => stop())
  assert.doesNotThrow(() => stopRetentionClock())
})
