import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNutritionDateStrip, shiftIsoDate } from './nutritionDateStrip.js'

test('the nutrition date strip contains the retained seven days, ending today', () => {
  assert.deepEqual(buildNutritionDateStrip('2026-10-03'), [
    '2026-09-27',
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
  ])
})

test('calendar shifting crosses leap-day, month, and year boundaries', () => {
  assert.equal(shiftIsoDate('2024-03-01', -1), '2024-02-29')
  assert.equal(shiftIsoDate('2026-01-01', -1), '2025-12-31')
})

test('a different visible-day count still ends on the supplied today date', () => {
  assert.deepEqual(buildNutritionDateStrip('2026-10-03', 3), [
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
  ])
})

test('invalid dates and day counts fail instead of silently shifting', () => {
  assert.throws(() => shiftIsoDate('2026-02-30', 1), /valid ISO calendar date/)
  assert.throws(() => buildNutritionDateStrip('2026-10-03', 0), /positive day count/)
})
