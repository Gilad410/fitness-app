// node --test src/features/nutrition/lib/nutritionLogsCore.test.mjs
//
// Tests the REAL implementation module both nutritionLogs.js (coach) and
// traineeNutrition.js (trainee) import and call from their getters --
// not a model of anything. No SQL, no Supabase, no mocking of the module
// under test itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  retainedLogs,
  logsForDate,
  dailyCaloriesTotal,
  dailyProteinTotal,
  dailyHasUnknownProtein,
} from './nutritionLogsCore.js'

const CUTOFF = '2026-01-11' // matches the task's own worked example (038's cutoff when "today" is Jan 17)

function log(overrides) {
  return { logged_at: '2026-01-15', calories: 100, protein: 10, ...overrides }
}

test('retainedLogs: keeps entries on or after the cutoff, drops entries before it', () => {
  const logs = [log({ logged_at: '2026-01-10' }), log({ logged_at: '2026-01-11' }), log({ logged_at: '2026-01-12' })]
  const result = retainedLogs(logs, CUTOFF)
  assert.deepEqual(result.map((l) => l.logged_at), ['2026-01-11', '2026-01-12'])
})

test('retainedLogs: an entry logged exactly on the cutoff date is retained (inclusive lower bound)', () => {
  const logs = [log({ logged_at: CUTOFF })]
  assert.equal(retainedLogs(logs, CUTOFF).length, 1)
})

test('retainedLogs: null/undefined logs array does not throw, returns empty', () => {
  assert.deepEqual(retainedLogs(null, CUTOFF), [])
  assert.deepEqual(retainedLogs(undefined, CUTOFF), [])
})

test('logsForDate: filters by BOTH the exact date AND retention -- an expired entry never appears even on its own logged_at date', () => {
  const logs = [log({ logged_at: '2026-01-05', calories: 999 }), log({ logged_at: '2026-01-12', calories: 200 })]
  assert.deepEqual(logsForDate(logs, '2026-01-05', CUTOFF), [], 'expired -- must not appear even when asking for exactly that date')
  assert.equal(logsForDate(logs, '2026-01-12', CUTOFF).length, 1)
})

test('dailyCaloriesTotal: sums only retained entries for the given date', () => {
  const logs = [
    log({ logged_at: '2026-01-12', calories: 300 }),
    log({ logged_at: '2026-01-12', calories: 150 }),
    log({ logged_at: '2026-01-05', calories: 9999 }), // expired -- must not contribute
    log({ logged_at: '2026-01-13', calories: 50 }), // different date -- must not contribute
  ]
  assert.equal(dailyCaloriesTotal(logs, '2026-01-12', CUTOFF), 450)
})

test('dailyProteinTotal: sums only known-protein, retained, same-date entries -- unknown protein excluded, not treated as 0', () => {
  const logs = [
    log({ logged_at: '2026-01-12', protein: 20 }),
    log({ logged_at: '2026-01-12', protein: null }),
    log({ logged_at: '2026-01-05', protein: 9999 }), // expired
  ]
  assert.equal(dailyProteinTotal(logs, '2026-01-12', CUTOFF), 20)
})

test('dailyHasUnknownProtein: true only if a RETAINED entry on that date has unknown protein', () => {
  const expiredWithUnknownProtein = [log({ logged_at: '2026-01-05', protein: null })]
  assert.equal(
    dailyHasUnknownProtein(expiredWithUnknownProtein, '2026-01-05', CUTOFF),
    false,
    'an expired entry\'s unknown protein must not surface once it has aged out',
  )

  const retainedWithUnknownProtein = [log({ logged_at: '2026-01-12', protein: null })]
  assert.equal(dailyHasUnknownProtein(retainedWithUnknownProtein, '2026-01-12', CUTOFF), true)
})

test('a coach-shaped call (per-trainee array) and a trainee-shaped call (flat array) behave identically given the same data -- exactly what "shared" means here', () => {
  const logs = [log({ logged_at: '2026-01-05', calories: 999 }), log({ logged_at: '2026-01-12', calories: 200 })]
  // nutritionLogs.js calls these with state.logsByTrainee[traineeId]; traineeNutrition.js
  // calls them with state.logs -- both are just plain arrays by the time they reach here.
  assert.deepEqual(retainedLogs(logs, CUTOFF), retainedLogs([...logs], CUTOFF))
  assert.equal(dailyCaloriesTotal(logs, '2026-01-12', CUTOFF), dailyCaloriesTotal([...logs], '2026-01-12', CUTOFF))
})
