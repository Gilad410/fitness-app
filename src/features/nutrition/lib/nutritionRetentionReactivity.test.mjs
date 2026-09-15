// node --test src/features/nutrition/lib/nutritionRetentionReactivity.test.mjs
//
// End-to-end reactivity tests through the REAL nutritionLogsCore.js and
// REAL nutritionRetentionClock.js -- the exact same modules
// nutritionLogs.js (coach) and traineeNutrition.js (trainee) import and
// call, completely unmocked here. The one thing genuinely NOT the real
// production file is the store wrapping them: nutritionLogs.js and
// traineeNutrition.js themselves cannot be imported directly under plain
// Node, because they import src/lib/supabaseClient.js, which reads real
// Vite-injected env vars (import.meta.env.VITE_SUPABASE_URL) and throws
// without them -- there is no DOM/Vite dev server in this test
// environment (same limitation documented across this repo's other
// store-adjacent tests). So each store below is a small Pinia store
// defined right here, deliberately matching the real store's state shape
// and getter signatures exactly (coach: per-trainee map; trainee: flat
// list) -- calling the SAME real retentionCutoff ref and the SAME real
// nutritionLogsCore.js functions the production getters call. What this
// verifies is genuine: real Pinia getter reactivity, real Vue computed()
// dependency tracking, and the real filtering/totals logic -- just not
// literally the two production .js files' own few lines of
// state-shape glue, which are visually trivial to review directly.
//
// This is explicitly an ACTUAL IMPLEMENTATION test -- unlike
// nutritionLogRetention.test.mjs (a hand-mirrored JS model of the SQL
// cutoff formula, written to build confidence before that SQL ever runs)
// -- no SQL is executed or modeled here at all; everything below is pure
// JS/Vue/Pinia already running as part of this app today.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computed } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { retentionCutoff, refreshRetentionCutoff, startRetentionClock } from './nutritionRetentionClock.js'
import {
  retainedLogs,
  logsForDate,
  dailyCaloriesTotal,
  dailyProteinTotal,
  dailyHasUnknownProtein,
} from './nutritionLogsCore.js'

// ---- Coach-shaped store: same getter shapes as nutritionLogs.js ----
const useCoachLikeLogsStore = defineStore('coachLikeNutritionLogs', {
  state: () => ({ logsByTrainee: {} }),
  getters: {
    logsFor: (state) => (traineeId) => retainedLogs(state.logsByTrainee[traineeId], retentionCutoff.value),
    dailyTotalFor: (state) => (traineeId, date) =>
      dailyCaloriesTotal(state.logsByTrainee[traineeId], date, retentionCutoff.value),
    dailyProteinTotalFor: (state) => (traineeId, date) =>
      dailyProteinTotal(state.logsByTrainee[traineeId], date, retentionCutoff.value),
    dailyHasUnknownProteinFor: (state) => (traineeId, date) =>
      dailyHasUnknownProtein(state.logsByTrainee[traineeId], date, retentionCutoff.value),
  },
})

// ---- Trainee-shaped store: same getter shapes as traineeNutrition.js ----
const useTraineeLikeLogsStore = defineStore('traineeLikeNutrition', {
  state: () => ({ logs: [] }),
  getters: {
    forDate: (state) => (date) => logsForDate(state.logs, date, retentionCutoff.value),
    dailyTotalFor: (state) => (date) => dailyCaloriesTotal(state.logs, date, retentionCutoff.value),
    dailyProteinTotalFor: (state) => (date) => dailyProteinTotal(state.logs, date, retentionCutoff.value),
    dailyProteinUnknownFor: (state) => (date) => dailyHasUnknownProtein(state.logs, date, retentionCutoff.value),
  },
})

function entry(overrides) {
  return { id: 'e1', logged_at: '2026-01-10', calories: 300, protein: 20, ...overrides }
}

// ---------------------------------------------------------------------
// Basic reactivity: a component-level computed() calling a store getter
// re-evaluates when retentionCutoff.value changes -- the exact mechanism
// NutritionSection.vue's `logs`/`groupedLogs`/`todayTotal` and
// TraineeNutritionView.vue's `entriesForDate`/`dailyTotal` rely on,
// unchanged, with no per-callsite code needed for this to work.
// ---------------------------------------------------------------------
test('a computed() built on a store getter re-evaluates when retentionCutoff changes -- coach shape', () => {
  setActivePinia(createPinia())
  const store = useCoachLikeLogsStore()
  store.logsByTrainee['t1'] = [entry({ id: 'old', logged_at: '2026-01-10' }), entry({ id: 'new', logged_at: '2026-01-14' })]

  refreshRetentionCutoff(() => new Date('2026-01-17T10:00:00+02:00')) // cutoff = 01-11
  const visible = computed(() => store.logsFor('t1'))
  assert.deepEqual(visible.value.map((e) => e.id), ['new'], 'the 01-10 entry is already past this cutoff')

  refreshRetentionCutoff(() => new Date('2026-01-10T10:00:00+02:00')) // cutoff = 01-04 -- both now retained
  assert.deepEqual(visible.value.map((e) => e.id), ['old', 'new'], 'computed must reactively pick up the earlier cutoff')
})

test('a computed() built on a store getter re-evaluates when retentionCutoff changes -- trainee shape', () => {
  setActivePinia(createPinia())
  const store = useTraineeLikeLogsStore()
  store.logs = [entry({ id: 'old', logged_at: '2026-01-10' }), entry({ id: 'new', logged_at: '2026-01-14' })]

  refreshRetentionCutoff(() => new Date('2026-01-17T10:00:00+02:00'))
  const visible = computed(() => store.forDate('2026-01-10'))
  assert.deepEqual(visible.value.map((e) => e.id), [], 'expired -- must not appear even for its own exact date')

  refreshRetentionCutoff(() => new Date('2026-01-10T10:00:00+02:00'))
  assert.deepEqual(visible.value.map((e) => e.id), ['old'])
})

// ---------------------------------------------------------------------
// SCENARIO 1 (explicitly requested): an entry loaded before midnight
// expires while the screen stays mounted -- driven end-to-end from the
// clock's periodic tick through to a store getter's visible entries AND
// totals, for BOTH the coach and the trainee shape (consistent
// coach/trainee visibility).
// ---------------------------------------------------------------------
test('SCENARIO: entries loaded before midnight disappear from BOTH visible entries and totals once the screen has stayed mounted past the Jerusalem day boundary -- coach view', () => {
  setActivePinia(createPinia())
  const store = useCoachLikeLogsStore()
  store.logsByTrainee['t1'] = [
    entry({ id: 'expiring', logged_at: '2026-01-10', calories: 300, protein: 20 }),
    entry({ id: 'staying', logged_at: '2026-01-12', calories: 150, protein: 10 }),
  ]

  const callbacks = new Map()
  let nextId = 1
  let now = new Date('2026-01-16T23:50:00+02:00')

  const stop = startRetentionClock({
    now: () => now,
    setIntervalFn: (fn) => {
      const id = nextId++
      callbacks.set(id, fn)
      return id
    },
    clearIntervalFn: (id) => callbacks.delete(id),
    addVisibilityChangeListener: () => () => {},
    addFocusListener: () => () => {},
  })

  const visibleIds = computed(() => store.logsFor('t1').map((e) => e.id))
  const totalCalories = computed(() => store.dailyTotalFor('t1', '2026-01-10') + store.dailyTotalFor('t1', '2026-01-12'))

  // Before midnight: both entries retained (01-16 - 6 = 01-10, inclusive).
  assert.deepEqual(visibleIds.value.sort(), ['expiring', 'staying'])
  assert.equal(totalCalories.value, 450)

  // Midnight passes; the periodic tick (the only thing that can catch
  // this while the tab stays visible/focused the whole time) fires.
  now = new Date('2026-01-17T00:05:00+02:00')
  for (const fn of callbacks.values()) fn()

  assert.deepEqual(visibleIds.value, ['staying'], 'the expired entry must disappear from visible entries')
  assert.equal(totalCalories.value, 150, 'the expired entry must disappear from the total -- not just the list')

  stop()
})

test('SCENARIO: entries loaded before midnight disappear from BOTH visible entries and totals once the screen has stayed mounted past the Jerusalem day boundary -- trainee view', () => {
  setActivePinia(createPinia())
  const store = useTraineeLikeLogsStore()
  store.logs = [
    entry({ id: 'expiring', logged_at: '2026-01-10', calories: 300, protein: 20 }),
    entry({ id: 'staying', logged_at: '2026-01-12', calories: 150, protein: 10 }),
  ]

  const callbacks = new Map()
  let nextId = 1
  let now = new Date('2026-01-16T23:50:00+02:00')

  const stop = startRetentionClock({
    now: () => now,
    setIntervalFn: (fn) => {
      const id = nextId++
      callbacks.set(id, fn)
      return id
    },
    clearIntervalFn: (id) => callbacks.delete(id),
    addVisibilityChangeListener: () => () => {},
    addFocusListener: () => () => {},
  })

  const stillRetained = computed(() => store.forDate('2026-01-10').length > 0)
  const totalAcrossBothDates = computed(() => store.dailyTotalFor('2026-01-10') + store.dailyTotalFor('2026-01-12'))

  assert.equal(stillRetained.value, true)
  assert.equal(totalAcrossBothDates.value, 450)

  now = new Date('2026-01-17T00:05:00+02:00')
  for (const fn of callbacks.values()) fn()

  assert.equal(stillRetained.value, false, 'the expired entry must no longer appear for its own date')
  assert.equal(totalAcrossBothDates.value, 150)

  stop()
})

// ---------------------------------------------------------------------
// SCENARIO 2 (explicitly requested): returning to a sleeping/background
// tab. No interval tick ever fires (simulating a throttled/paused
// background-tab timer) -- recovery must come from the visibility path
// alone, and must correctly update both entries and totals immediately.
// ---------------------------------------------------------------------
test('SCENARIO: a backgrounded tab restored after sleeping past midnight immediately drops the expired entry from entries AND totals, with zero interval ticks', () => {
  setActivePinia(createPinia())
  const store = useTraineeLikeLogsStore()
  store.logs = [
    entry({ id: 'expiring', logged_at: '2026-01-10', calories: 300, protein: 20 }),
    entry({ id: 'staying', logged_at: '2026-01-15', calories: 150, protein: 10 }),
  ]

  let now = new Date('2026-01-16T20:00:00+02:00')
  let visibilityHandler = null

  const stop = startRetentionClock({
    now: () => now,
    setIntervalFn: () => 1, // interval "armed" but deliberately never invoked below
    clearIntervalFn: () => {},
    addVisibilityChangeListener: (cb) => {
      visibilityHandler = cb
      return () => {
        visibilityHandler = null
      }
    },
    addFocusListener: () => () => {},
  })

  const visibleIds = computed(() => [...store.forDate('2026-01-10'), ...store.forDate('2026-01-15')].map((e) => e.id))
  const total = computed(() => store.dailyTotalFor('2026-01-10') + store.dailyTotalFor('2026-01-15'))

  assert.deepEqual(visibleIds.value.sort(), ['expiring', 'staying'])
  assert.equal(total.value, 450)

  // The laptop sleeps, well past the Jerusalem day boundary -- no ticks
  // fire during this whole time.
  now = new Date('2026-01-19T09:00:00+02:00')
  assert.deepEqual(visibleIds.value.sort(), ['expiring', 'staying'], 'must still be stale -- nothing has woken it yet')

  // The user reopens the laptop / switches back to the tab.
  visibilityHandler()

  assert.deepEqual(visibleIds.value, ['staying'], 'restoring visibility must immediately drop the now-expired entry from visible entries')
  assert.equal(total.value, 150, 'and from the total')

  stop()
})

// ---------------------------------------------------------------------
// Explicit "retained stays visible, expired disappears" check, protein
// totals included (not just calories) -- both shapes.
// ---------------------------------------------------------------------
test('retained entries remain fully visible (including protein/unknown-protein totals) while expired entries are excluded from every total', () => {
  setActivePinia(createPinia())
  const store = useCoachLikeLogsStore()
  store.logsByTrainee['t1'] = [
    entry({ id: 'expired-unknown-protein', logged_at: '2026-01-05', calories: 999, protein: null }),
    entry({ id: 'retained-a', logged_at: '2026-01-12', calories: 200, protein: 15 }),
    entry({ id: 'retained-b', logged_at: '2026-01-12', calories: 100, protein: null }),
  ]

  refreshRetentionCutoff(() => new Date('2026-01-17T10:00:00+02:00')) // cutoff = 01-11

  assert.deepEqual(
    store.logsFor('t1').map((e) => e.id).sort(),
    ['retained-a', 'retained-b'],
    'the expired entry must be gone; both retained entries must remain',
  )
  assert.equal(store.dailyTotalFor('t1', '2026-01-05'), 0, 'expired date contributes nothing')
  assert.equal(store.dailyTotalFor('t1', '2026-01-12'), 300, 'retained entries still sum correctly')
  assert.equal(store.dailyProteinTotalFor('t1', '2026-01-12'), 15, 'only the known-protein retained entry counts')
  assert.equal(
    store.dailyHasUnknownProteinFor('t1', '2026-01-12'),
    true,
    'the retained entry with unknown protein must still be flagged',
  )
  assert.equal(
    store.dailyHasUnknownProteinFor('t1', '2026-01-05'),
    false,
    'an expired entry\'s unknown protein must not surface once it has aged out',
  )
})
