import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accessCheckDecision,
  accessCheckEntry,
  SOFT_AGE_MS,
  HARD_TTL_MS,
} from './accessCheckCache.js'

// The router guard used to await a Supabase round trip before every
// protected navigation, which is what made changing screens feel stuck.
// These rules decide when a recent answer may stand in for that call.

const NOW = 1_700_000_000_000

test('nothing cached means the check must actually run', () => {
  assert.equal(accessCheckDecision(null, NOW), 'fetch')
  assert.equal(accessCheckDecision(undefined, NOW), 'fetch')
  assert.equal(accessCheckDecision({ value: true }, NOW), 'fetch', 'no timestamp')
  assert.equal(accessCheckDecision({ value: true, at: NaN }, NOW), 'fetch')
})

test('a very recent answer is used without touching the network', () => {
  assert.equal(accessCheckDecision({ value: 'active', at: NOW }, NOW), 'use')
  assert.equal(accessCheckDecision({ value: 'active', at: NOW - 1000 }, NOW), 'use')
  assert.equal(accessCheckDecision({ value: 'active', at: NOW - (SOFT_AGE_MS - 1) }, NOW), 'use')
})

test('past the soft age it is still used, but a refresh starts behind it', () => {
  assert.equal(
    accessCheckDecision({ value: 'active', at: NOW - SOFT_AGE_MS }, NOW),
    'use-and-refresh',
  )
  assert.equal(
    accessCheckDecision({ value: 'active', at: NOW - (HARD_TTL_MS - 1) }, NOW),
    'use-and-refresh',
  )
})

test('past the hard TTL it is awaited again — a stale answer never stands forever', () => {
  // This is what stops a run of failing background refreshes from
  // serving an old answer indefinitely.
  assert.equal(accessCheckDecision({ value: 'active', at: NOW - HARD_TTL_MS }, NOW), 'fetch')
  assert.equal(accessCheckDecision({ value: 'active', at: NOW - 600_000 }, NOW), 'fetch')
})

test('a clock that jumped backwards does not make an old answer look new', () => {
  // A device waking from sleep, or an NTP correction, must not extend
  // the life of a cached access answer.
  assert.equal(accessCheckDecision({ value: 'active', at: NOW + 60_000 }, NOW), 'fetch')
})

test('the soft age is comfortably shorter than the hard TTL', () => {
  assert.ok(SOFT_AGE_MS > 0)
  assert.ok(SOFT_AGE_MS < HARD_TTL_MS, 'otherwise nothing would ever refresh in the background')
})

test('the window stays short enough to be defensible', () => {
  // The guard routes the UI; RLS is the real boundary. Even so, the
  // window a suspended account could still be routed normally is capped
  // at under a minute by construction.
  assert.ok(HARD_TTL_MS <= 60_000, 'a stale access answer must not outlive a minute')
})

test('an entry records the value with the time it was taken', () => {
  const e = accessCheckEntry('suspended', NOW)
  assert.deepEqual(e, { value: 'suspended', at: NOW })
  assert.equal(accessCheckDecision(e, NOW), 'use')
})

test('false and null are cached as real answers, not treated as missing', () => {
  // The trainee check returns a boolean; a cached `false` must be used,
  // not mistaken for an empty cache and refetched every time.
  assert.equal(accessCheckDecision(accessCheckEntry(false, NOW), NOW), 'use')
  assert.equal(accessCheckDecision(accessCheckEntry(null, NOW), NOW), 'use')
})
