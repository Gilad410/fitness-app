import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeRestSeconds,
  formatClock,
  restProgress,
  DEFAULT_REST_SECONDS,
  MAX_REST_SECONDS,
} from './restTimer.js'

// The rest duration comes from the coach's own rest_seconds on each
// exercise. That field is optional and free-typed, so every shape it can
// actually arrive in has to resolve to something countable.

test('a real rest_seconds is used as given', () => {
  assert.equal(normalizeRestSeconds(90), 90)
  assert.equal(normalizeRestSeconds(45), 45)
  assert.equal(normalizeRestSeconds(180), 180)
})

test('a missing rest falls back to the default rather than counting nothing', () => {
  assert.equal(normalizeRestSeconds(null), DEFAULT_REST_SECONDS)
  assert.equal(normalizeRestSeconds(undefined), DEFAULT_REST_SECONDS)
  assert.equal(normalizeRestSeconds(''), DEFAULT_REST_SECONDS)
})

test('numeric strings from the database are accepted', () => {
  assert.equal(normalizeRestSeconds('120'), 120)
  assert.equal(normalizeRestSeconds('90.4'), 90)
})

test('zero and negatives fall back — a zero-second rest is not a rest', () => {
  assert.equal(normalizeRestSeconds(0), DEFAULT_REST_SECONDS)
  assert.equal(normalizeRestSeconds(-30), DEFAULT_REST_SECONDS)
})

test('an absurd value is capped — a ten-hour rest is a typo, not an instruction', () => {
  assert.equal(normalizeRestSeconds(99999), MAX_REST_SECONDS)
  assert.equal(normalizeRestSeconds(MAX_REST_SECONDS + 1), MAX_REST_SECONDS)
})

test('junk never produces NaN on screen', () => {
  for (const v of ['abc', {}, [], true, NaN, Infinity]) {
    const out = normalizeRestSeconds(v)
    assert.ok(Number.isFinite(out) && out > 0, `${JSON.stringify(v)} -> ${out}`)
  }
})

test('the clock reads as m:ss with a padded seconds field', () => {
  assert.equal(formatClock(90), '1:30')
  assert.equal(formatClock(60), '1:00')
  assert.equal(formatClock(9), '0:09')
  assert.equal(formatClock(600), '10:00')
})

test('the clock stops at zero instead of showing a negative', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(-5), '0:00')
  assert.equal(formatClock(NaN), '0:00')
  assert.equal(formatClock(undefined), '0:00')
})

test('progress runs 0 to 1 as the rest elapses', () => {
  assert.equal(restProgress(90, 90), 0)
  assert.equal(restProgress(45, 90), 0.5)
  assert.equal(restProgress(0, 90), 1)
})

test('progress never leaves 0..1, whatever it is handed', () => {
  assert.equal(restProgress(-10, 90), 1)
  assert.equal(restProgress(200, 90), 0)
  assert.equal(restProgress(10, 0), 0)
  assert.equal(restProgress(NaN, 90), 0)
  assert.equal(restProgress(10, undefined), 0)
})
