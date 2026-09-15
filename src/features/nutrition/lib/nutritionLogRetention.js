// A plain-JS REFERENCE MODEL of the retention-cutoff math in
// supabase/sql/038_trainee_nutrition_log_retention.sql
// (public.trainee_nutrition_log_retention_cutoff() /
// cleanup_expired_nutrition_logs()).
//
// IMPORTANT: this does NOT execute or verify the actual SQL -- no local
// Postgres/Docker is available in this environment, and 038 has not been
// applied to any database. This module is a hand-mirrored
// re-implementation of the SQL cutoff formula, kept deliberately
// side-by-side comparable with it, so a reviewer can check the two agree
// by reading them and a future edit to one that isn't mirrored in the
// other is easy to spot. It also independently exercises the ONE piece
// that genuinely needs a real IANA timezone database to get right --
// converting a UTC instant into an Asia/Jerusalem calendar date, DST
// included -- via JS's own Intl API (which, like Postgres's `at time
// zone`, is backed by the system/ICU IANA tzdata, not a hardcoded
// UTC+2/+3 offset). What this does NOT independently verify: that
// Node's and Postgres's tzdata agree on the exact historical/future
// transition dates for Asia/Jerusalem -- both are standard, regularly
// updated IANA tzdata consumers, and this repo has no tool to cross-check
// them against each other without a live Postgres instance.
//
// RETENTION_DAYS mirrors the SQL migration's "7 days from the logged
// date" rule: an entry logged_at = 2026-01-10 is retained through
// 2026-01-16 and expires (becomes invisible / eligible for deletion)
// starting 2026-01-17 -- exactly 7 calendar days after it was logged.
const RETENTION_DAYS = 7
const TIME_ZONE = 'Asia/Jerusalem'

// The Y-M-D calendar date (as 'YYYY-MM-DD', matching a Postgres `date`)
// that `instant` falls on in Asia/Jerusalem. `en-CA` is the locale whose
// standard date format is already ISO-8601 (YYYY-MM-DD) -- picked for
// that formatting convenience only, not for any Canada-specific
// behavior; the explicit format options make the shape independent of
// locale defaults regardless.
export function israelCalendarDate(instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

// Calendar-date arithmetic only -- deliberately never touches a
// timezone-aware instant/wall-clock -- mirrors Postgres's `date -
// integer`, which operates purely on the calendar date itself, so this
// already crosses month/year boundaries correctly with no special-casing
// (e.g. subtractCalendarDays('2026-01-02', 6) === '2025-12-27').
function subtractCalendarDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day) - days * 24 * 60 * 60 * 1000)
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

// Mirrors public.trainee_nutrition_log_retention_cutoff(): the oldest
// logged_at still retained is "today in Jerusalem minus (RETENTION_DAYS
// - 1)" -- entries strictly older than this (logged_at < cutoff) are
// expired.
export function retentionCutoffDate(now = new Date()) {
  return subtractCalendarDays(israelCalendarDate(now), RETENTION_DAYS - 1)
}

// Mirrors the WHERE clause both the RLS policies and
// cleanup_expired_nutrition_logs() apply: `loggedAt` and the return value
// of retentionCutoffDate() are both plain 'YYYY-MM-DD' strings, so a
// simple lexicographic `<` is a correct date comparison (matching
// Postgres's own `date <` semantics for this format).
export function isExpired(loggedAt, now = new Date()) {
  return loggedAt < retentionCutoffDate(now)
}
