// Pure, framework-agnostic aggregation over an array of nutrition-log-like
// rows ({ logged_at, calories, protein, ... }), given the current
// retention cutoff date (see nutritionRetentionClock.js for where that
// value actually comes from -- this module doesn't know or care whether
// it's reactive, only that it's a plain 'YYYY-MM-DD' string comparable to
// logged_at the same way Postgres compares two `date` values).
//
// Shared by BOTH the coach's store (nutritionLogs.js, keyed per trainee)
// and the trainee's own store (traineeNutrition.js, a single flat list)
// -- extracted specifically so the exact same filtering/totals logic (and
// the exact same retention-exclusion behavior) can never drift between
// the two views, the same "one shared core, two thin store wrappers"
// pattern already used elsewhere in this app (nutritionPlansCore.js,
// traineeNutritionPlanCore.js). No Vue/Pinia/Supabase import -- fully
// unit-testable under plain Node (nutritionLogsCore.test.mjs).
//
// This is a client-side courtesy layer only, not the enforcement: the
// server (038_trainee_nutrition_log_retention.sql's RLS policies and
// scheduled cleanup) is what actually decides which rows exist/are
// selectable at all. This module exists so already-fetched, cached rows
// (Pinia state) stop being shown/counted once they'd no longer be
// returned if the same query ran again right now -- see
// nutritionRetentionClock.js for what keeps `cutoff` current while a
// screen stays mounted.

export function retainedLogs(logs, cutoff) {
  return (logs ?? []).filter((log) => log.logged_at >= cutoff)
}

export function logsForDate(logs, date, cutoff) {
  return retainedLogs(logs, cutoff).filter((log) => log.logged_at === date)
}

export function dailyCaloriesTotal(logs, date, cutoff) {
  return logsForDate(logs, date, cutoff).reduce((sum, log) => sum + Number(log.calories), 0)
}

// Only sums entries with a known protein value -- an entry logged against
// a food/item with unset protein is excluded, not treated as 0 (matches
// the pre-existing behavior in both stores, unchanged by retention).
export function dailyProteinTotal(logs, date, cutoff) {
  return logsForDate(logs, date, cutoff)
    .filter((log) => log.protein !== null)
    .reduce((sum, log) => sum + Number(log.protein), 0)
}

export function dailyHasUnknownProtein(logs, date, cutoff) {
  return logsForDate(logs, date, cutoff).some((log) => log.protein === null)
}
