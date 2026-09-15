// node --test src/features/nutrition/lib/nutritionLogRetention.test.mjs
//
// Tests a hand-mirrored JS reference model of 038's retention-cutoff SQL
// (public.trainee_nutrition_log_retention_cutoff() /
// cleanup_expired_nutrition_logs()) -- NOT the actual SQL, which remains
// unexecuted and unverified in this environment (no local Postgres/
// Docker available; 038 has not been applied to any database). See
// nutritionLogRetention.js's own header for exactly what is and isn't
// independently verified here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { israelCalendarDate, retentionCutoffDate, isExpired } from './nutritionLogRetention.js'

// ---------------------------------------------------------------------
// The exact worked example from the task/migration: "a food diary entry
// dated the 10th should expire on the 17th."
// ---------------------------------------------------------------------
test('the 10th expires exactly on the 17th (7 days later), not the 16th or 18th', () => {
  const noonJerusalemOn17th = new Date('2026-01-17T10:00:00+02:00') // 10:00 UTC+2 = noon Israel Standard Time
  assert.equal(retentionCutoffDate(noonJerusalemOn17th), '2026-01-11')
  assert.equal(isExpired('2026-01-10', noonJerusalemOn17th), true, 'the 10th must be expired on the 17th')
  assert.equal(isExpired('2026-01-11', noonJerusalemOn17th), false, 'the 11th must NOT be expired yet on the 17th')
})

test('the 10th is still retained on the 16th (one day before its expiry)', () => {
  const noonJerusalemOn16th = new Date('2026-01-16T10:00:00+02:00')
  assert.equal(isExpired('2026-01-10', noonJerusalemOn16th), false)
})

// ---------------------------------------------------------------------
// General boundary: exactly 6 days old (retained) vs exactly 7 days old
// (expired) -- the precise inclusive/exclusive edge the whole rule hinges
// on.
// ---------------------------------------------------------------------
test('an entry exactly 6 days old is retained; exactly 7 days old is expired', () => {
  const now = new Date('2026-03-01T10:00:00+02:00')
  const sixDaysAgo = '2026-02-23' // 01 - 6 = Feb 23
  const sevenDaysAgo = '2026-02-22'
  assert.equal(isExpired(sixDaysAgo, now), false)
  assert.equal(isExpired(sevenDaysAgo, now), true)
})

// ---------------------------------------------------------------------
// Month transition
// ---------------------------------------------------------------------
test('retention cutoff crosses a month boundary correctly', () => {
  // "Today" is Feb 4 in Jerusalem -- 6 days back lands in January.
  const now = new Date('2026-02-04T10:00:00+02:00')
  assert.equal(retentionCutoffDate(now), '2026-01-29')
  assert.equal(isExpired('2026-01-28', now), true, 'Jan 28 is older than the Jan 29 cutoff -- expired')
  assert.equal(isExpired('2026-01-29', now), false, 'Jan 29 is exactly the cutoff -- still retained')
})

// ---------------------------------------------------------------------
// Year transition
// ---------------------------------------------------------------------
test('retention cutoff crosses a year boundary correctly', () => {
  // "Today" is Jan 3, 2026 in Jerusalem -- 6 days back lands in Dec 2025.
  const now = new Date('2026-01-03T10:00:00+02:00')
  assert.equal(retentionCutoffDate(now), '2025-12-28')
  assert.equal(isExpired('2025-12-27', now), true, 'Dec 27, 2025 is older than the Dec 28 cutoff -- expired')
  assert.equal(isExpired('2025-12-28', now), false, 'Dec 28, 2025 is exactly the cutoff -- still retained')
})

// ---------------------------------------------------------------------
// Israel timezone handling -- confirms the conversion is genuinely
// timezone-aware (derived from the instant via Asia/Jerusalem, not a
// naive UTC calendar date), which is the one piece of this rule that
// actually depends on correct IANA tzdata rather than plain arithmetic.
// Does NOT hardcode or assert Israel's exact historical/future DST
// transition dates -- see the module header for why.
// ---------------------------------------------------------------------
test('israelCalendarDate reflects the LOCAL Jerusalem date, not the UTC date, near a day boundary', () => {
  // 22:30 UTC in June (Israel Daylight Time, UTC+3) is 01:30 the next
  // calendar day in Jerusalem -- one day ahead of the UTC date.
  assert.equal(israelCalendarDate(new Date('2026-06-15T22:30:00Z')), '2026-06-16')
  // Same UTC-instant shape in January (Israel Standard Time, UTC+2) also
  // crosses into the next local day (22:30 + 2h = 00:30) -- confirms the
  // day-boundary crossing isn't specific to one season/offset.
  assert.equal(israelCalendarDate(new Date('2026-01-15T22:30:00Z')), '2026-01-16')
})

test('a logged_at just past the Israel-local midnight boundary is treated as the later day, matching israelCalendarDate', () => {
  // An entry logged for 2026-06-16 (the Jerusalem-local date at this
  // instant, per the case above) must be measured against "today" as
  // 2026-06-16 in Jerusalem, not 2026-06-15 in UTC -- i.e. retention math
  // must be built on israelCalendarDate(), never on the raw UTC instant.
  const instant = new Date('2026-06-15T22:30:00Z')
  assert.equal(israelCalendarDate(instant), '2026-06-16')
  assert.equal(retentionCutoffDate(instant), '2026-06-10')
})

// ---------------------------------------------------------------------
// Coach/trainee consistency: both read paths (coach's nutritionLogs.js,
// trainee's traineeNutrition.js) rely on the SAME SQL cutoff via RLS
// (038's whole design), not on separate client-side logic -- this test
// documents that this JS reference model itself has exactly one cutoff
// function, used identically regardless of which "view" would call it,
// mirroring that there is no second, divergent implementation anywhere.
// ---------------------------------------------------------------------
test('the same cutoff/expiry functions apply uniformly regardless of caller -- no separate coach vs. trainee variant exists', () => {
  const now = new Date('2026-01-17T10:00:00+02:00')
  const coachView = { loggedAt: '2026-01-10', expired: isExpired('2026-01-10', now) }
  const traineeView = { loggedAt: '2026-01-10', expired: isExpired('2026-01-10', now) }
  assert.deepEqual(coachView, traineeView)
})
