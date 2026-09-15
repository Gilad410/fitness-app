// node --test src/features/trainees/store/selectedTraineeStorage.test.mjs
//
// Tests the REAL implementation module selectedTrainee.js (the actual
// Pinia store used by the app) delegates to for every read/write/clear
// and for the route-precedence decision -- not a model of anything. A
// fake in-memory storage object stands in for window.localStorage (which
// doesn't exist under plain Node), but the module under test is
// unmodified production code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  storageKey,
  readSelectedTrainee,
  writeSelectedTrainee,
  clearSelectedTrainee,
  reconcileSelectionWithRoute,
} from './selectedTraineeStorage.js'

function makeFakeStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    _map: map,
  }
}

// ---------------------------------------------------------------------
// storageKey -- per-coach keying
// ---------------------------------------------------------------------
test('storageKey embeds the coach user id, so two different coaches never collide', () => {
  assert.notEqual(storageKey('coach-a'), storageKey('coach-b'))
  assert.equal(storageKey('coach-a'), storageKey('coach-a'))
})

// ---------------------------------------------------------------------
// read/write/clear round-trip
// ---------------------------------------------------------------------
test('write then read round-trips the exact value, scoped to that coach', () => {
  const storage = makeFakeStorage()
  writeSelectedTrainee('coach-a', 'trainee-1', storage)
  assert.equal(readSelectedTrainee('coach-a', storage), 'trainee-1')
})

test('reading before any write returns null, not throw or undefined', () => {
  const storage = makeFakeStorage()
  assert.equal(readSelectedTrainee('coach-a', storage), null)
})

test('a different coach never reads a value written for another coach on the same storage', () => {
  const storage = makeFakeStorage()
  writeSelectedTrainee('coach-a', 'trainee-1', storage)
  assert.equal(readSelectedTrainee('coach-b', storage), null, 'coach B must not see coach A\'s remembered trainee')
})

test('clear removes exactly this coach\'s value, leaving another coach\'s value untouched', () => {
  const storage = makeFakeStorage()
  writeSelectedTrainee('coach-a', 'trainee-1', storage)
  writeSelectedTrainee('coach-b', 'trainee-2', storage)

  clearSelectedTrainee('coach-a', storage)

  assert.equal(readSelectedTrainee('coach-a', storage), null)
  assert.equal(readSelectedTrainee('coach-b', storage), 'trainee-2', 'must be unaffected by clearing coach A')
})

test('selecting trainee B after trainee A overwrites the stored value for that same coach', () => {
  const storage = makeFakeStorage()
  writeSelectedTrainee('coach-a', 'trainee-A', storage)
  assert.equal(readSelectedTrainee('coach-a', storage), 'trainee-A')

  writeSelectedTrainee('coach-a', 'trainee-B', storage)
  assert.equal(readSelectedTrainee('coach-a', storage), 'trainee-B')
})

// ---------------------------------------------------------------------
// Graceful degradation -- no coach id, or storage unavailable/throwing
// (private browsing, quota, disabled) -- never crashes
// ---------------------------------------------------------------------
test('every function is a safe no-op/returns null when coachUserId is missing (not signed in yet)', () => {
  const storage = makeFakeStorage()
  assert.doesNotThrow(() => writeSelectedTrainee(null, 'trainee-1', storage))
  assert.equal(readSelectedTrainee(null, storage), null)
  assert.doesNotThrow(() => clearSelectedTrainee(null, storage))
  assert.equal(storage._map.size, 0, 'nothing should have been written without a coach id')
})

test('every function fails safe when storage is null (e.g. defaultStorage() found no real window)', () => {
  assert.doesNotThrow(() => writeSelectedTrainee('coach-a', 'trainee-1', null))
  assert.equal(readSelectedTrainee('coach-a', null), null)
  assert.doesNotThrow(() => clearSelectedTrainee('coach-a', null))
})

test('every function fails safe when the storage object itself throws (private browsing, quota, disabled)', () => {
  const throwingStorage = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }
  assert.doesNotThrow(() => writeSelectedTrainee('coach-a', 'trainee-1', throwingStorage))
  assert.equal(readSelectedTrainee('coach-a', throwingStorage), null)
  assert.doesNotThrow(() => clearSelectedTrainee('coach-a', throwingStorage))
})

// ---------------------------------------------------------------------
// reconcileSelectionWithRoute -- "explicit route id takes precedence over
// remembered selection" + "missing/invalid selection falls back
// correctly" + "stale remembered id is cleared, but an unrelated valid
// one is left alone"
// ---------------------------------------------------------------------
test('a resolved trainee ALWAYS wins and is selected, regardless of what was previously remembered', () => {
  assert.deepEqual(
    reconcileSelectionWithRoute({ resolvedTraineeId: 'trainee-B', routeParamId: 'trainee-B', rememberedId: 'trainee-A' }),
    { type: 'select', traineeId: 'trainee-B' },
  )
})

test('a resolved trainee is selected even when nothing was remembered before (first-ever selection)', () => {
  assert.deepEqual(
    reconcileSelectionWithRoute({ resolvedTraineeId: 'trainee-A', routeParamId: 'trainee-A', rememberedId: null }),
    { type: 'select', traineeId: 'trainee-A' },
  )
})

test('an unresolved route that matches the remembered id clears it (the remembered trainee itself was deleted/invalid)', () => {
  assert.deepEqual(
    reconcileSelectionWithRoute({ resolvedTraineeId: null, routeParamId: 'trainee-A', rememberedId: 'trainee-A' }),
    { type: 'clear' },
  )
})

test('an unresolved route for a DIFFERENT id than what is remembered leaves the remembered selection alone', () => {
  assert.deepEqual(
    reconcileSelectionWithRoute({ resolvedTraineeId: null, routeParamId: 'some-bad-id', rememberedId: 'trainee-A' }),
    { type: 'none' },
    'visiting an unrelated bad link must not wipe out a perfectly good existing selection',
  )
})

test('an unresolved route with nothing remembered at all does nothing (no selection to clear)', () => {
  assert.deepEqual(
    reconcileSelectionWithRoute({ resolvedTraineeId: null, routeParamId: 'trainee-A', rememberedId: null }),
    { type: 'none' },
  )
})
