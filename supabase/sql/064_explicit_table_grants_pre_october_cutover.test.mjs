import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sql = fs.readFileSync(
  new URL('./064_explicit_table_grants_pre_october_cutover.sql', import.meta.url),
  'utf8',
)

// Exact verbs verified against every `supabase.from('<table>')` call site in
// src/**/*.{js,vue} (including PostgREST embedded-relation selects that
// never literally name the table in a `.from(...)` call) -- see this
// migration's own header for the full methodology. `null` means group 3:
// no grant to authenticated at all (RPC-only).
const TABLE_VERBS = {
  trainees: 'select, insert, update',
  trainee_progress_logs: 'select, insert, delete',
  foods: 'select, insert, update',
  trainee_nutrition_logs: 'select, insert, delete',
  trainee_circumference_logs: 'select, insert, delete',
  trainee_progress_photos: 'select, insert, delete',
  trainee_training_programs: 'select, insert, update',
  trainee_program_workouts: 'select, insert, update, delete',
  trainee_workout_exercises: 'select, insert, update, delete',
  trainee_notifications: 'select, insert',
  trainee_exercise_submission_videos: 'select, insert, update, delete',
  trainee_nutrition_plans: 'select, insert, update, delete',
  trainee_nutrition_plan_meals: 'select, insert, update, delete',
  trainee_nutrition_plan_meal_items: 'select, insert, update, delete',
  coach_barcode_products: 'select, insert, update',
  barcode_nutrition_basis_preferences: 'select, insert, update',
  food_reference_catalog: 'select',
  restaurant_food_items: 'select',
  exercise_reference_catalog: 'select',
  user_roles: 'select',
  coaches: null,
  coach_status_history: null,
  coach_invitations: null,
  trainee_nutrition_plan_items: null,
}

// Tables that already have their own explicit grants from an earlier
// migration (059/061/062) -- this migration must not touch them again.
const ALREADY_HANDLED_ELSEWHERE = [
  'trainee_custom_foods',
  'privacy_acceptances',
  'trainee_workout_sessions',
  'trainee_workout_set_logs',
]

test('064 is atomic, never drops/truncates/deletes a row, and its only DDL is the session-local helper', () => {
  assert.match(sql, /^\s*--[\s\S]*?\bbegin\s*;/i)
  assert.match(sql, /\bcommit\s*;\s*$/i)
  // Checked as SQL statements, not bare words -- TRUNCATE is legitimately
  // named in this file's own prose (explaining the Postgres privilege of
  // that name), which a bare \btruncate\b word-boundary check would
  // false-positive on.
  assert.doesNotMatch(sql, /^\s*drop\s/im)
  assert.doesNotMatch(sql, /^\s*truncate\s/im)
  assert.doesNotMatch(sql, /\balter\s+table\b/i)
  assert.doesNotMatch(sql, /\bcreate\s+(or\s+replace\s+)?(policy|table)\b/i)
  // Exactly one function, and it must live in pg_temp (session-local --
  // never left behind in the public schema after this script finishes).
  assert.equal((sql.match(/create or replace function/gi) ?? []).length, 1)
  assert.match(sql, /create or replace function pg_temp\.explicit_grant_if_exists/i)
  // "delete" only ever appears as a GRANT privilege keyword here, never
  // as a DML statement against a row.
  assert.doesNotMatch(sql, /^\s*delete\s+from\b/im)
})

test('the helper skips a missing table instead of failing the whole migration', () => {
  assert.match(sql, /to_regclass\('public\.' \|\| p_table\) is null/i)
  assert.match(sql, /raise notice/i)
  // The skip path must return before attempting any revoke/grant.
  const fnStart = sql.indexOf('create or replace function pg_temp.explicit_grant_if_exists')
  const fnBody = sql.slice(fnStart, sql.indexOf('$fn$;', fnStart) + '$fn$;'.length)
  const ifIdx = fnBody.search(/if to_regclass/i)
  const returnIdx = fnBody.search(/\breturn\s*;/i)
  const revokeIdx = fnBody.search(/revoke all/i)
  assert.ok(ifIdx > -1 && returnIdx > -1 && revokeIdx > -1)
  assert.ok(ifIdx < returnIdx && returnIdx < revokeIdx, 'skip-and-return must happen before any revoke')
})

test('the helper always revokes from authenticated too, before any grant -- regression test for a real bug found live', () => {
  // GRANT only ever adds a privilege, it never narrows an existing
  // broader one -- a first live run revoked only `public, anon` before
  // granting a narrower verb list, so every group 1/2 table kept its
  // full original implicit grant to authenticated underneath. There
  // must be exactly one revoke statement in the function body, and it
  // must name public, anon, AND authenticated together, unconditionally
  // (not only inside the p_verbs-is-null branch).
  const fnStart = sql.indexOf('create or replace function pg_temp.explicit_grant_if_exists')
  const fnBody = sql.slice(fnStart, sql.indexOf('$fn$;', fnStart) + '$fn$;'.length)
  const revokeStatements = [...fnBody.matchAll(/revoke all on public\.%I from ([^']+)'/gi)]
  assert.equal(revokeStatements.length, 1, 'expected exactly one revoke statement in the helper')
  const revokedFrom = revokeStatements[0][1].split(',').map((r) => r.trim())
  assert.deepEqual(revokedFrom.sort(), ['anon', 'authenticated', 'public'].sort())
})

test('every table is called through the guarded helper with its verified verbs, exactly once', () => {
  for (const [table, verbs] of Object.entries(TABLE_VERBS)) {
    const calls = [
      ...sql.matchAll(
        new RegExp(`pg_temp\\.explicit_grant_if_exists\\('${table}',\\s*('[^']*'|null)\\)`, 'gi'),
      ),
    ]
    assert.equal(calls.length, 1, `${table}: expected exactly one call, found ${calls.length}`)
    const arg = calls[0][1]
    if (verbs === null) {
      assert.equal(arg.toLowerCase(), 'null', `${table}: expected null (RPC-only)`)
    } else {
      assert.equal(arg, `'${verbs}'`, `${table}: verbs don't match verified usage`)
    }
  }
})

test('tables already covered by an earlier migration are not touched again here', () => {
  for (const table of ALREADY_HANDLED_ELSEWHERE) {
    assert.doesNotMatch(
      sql,
      new RegExp(`explicit_grant_if_exists\\('${table}'`, 'i'),
      `${table}: should not appear in 064 at all`,
    )
  }
})

test('covers exactly the 24 tables identified as relying on implicit default privileges, no more, no less', () => {
  const tables = Object.keys(TABLE_VERBS)
  assert.equal(tables.length, 24)
  assert.equal(new Set(tables).size, 24, 'no duplicate table names')
})

test('read-only reference tables never get a write verb', () => {
  for (const table of ['food_reference_catalog', 'restaurant_food_items', 'exercise_reference_catalog', 'user_roles']) {
    assert.equal(TABLE_VERBS[table], 'select')
  }
})
