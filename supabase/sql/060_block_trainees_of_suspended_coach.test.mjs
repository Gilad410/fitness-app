import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sql = fs.readFileSync(
  new URL('./060_block_trainees_of_suspended_coach.sql', import.meta.url),
  'utf8',
)

const FUNCTIONS = [
  'trainee_get_auth_context',
  'trainee_get_own_profile',
  'trainee_get_own_starting_circumferences',
  'trainee_get_active_training_program',
]

test('060 is atomic and never drops/truncates/deletes anything', () => {
  assert.match(sql, /^\s*--[\s\S]*?\bbegin\s*;/i)
  assert.match(sql, /\bcommit\s*;\s*$/i)
  assert.doesNotMatch(sql, /\b(drop|truncate|delete)\b/i)
})

test('replaces exactly the four functions that independently resolve trainee identity', () => {
  // These are the only security-definer functions in the schema that
  // resolve `t.auth_user_id = auth.uid()` against public.trainees
  // without going through trainee_get_auth_context() -- confirmed by
  // auditing every supabase/sql/*.sql file's LAST `create or replace`
  // for every such match (see this migration's own header for the full
  // audit trail, including why trainee_mark_notification_read is NOT a
  // fifth one: its live body, from 022, already calls
  // trainee_get_auth_context()).
  assert.equal((sql.match(/create or replace function/gi) ?? []).length, FUNCTIONS.length)
  for (const fn of FUNCTIONS) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`, 'i'))
  }
})

test('every one of the four requires both the trainee and their coach to be active', () => {
  for (const fn of FUNCTIONS) {
    const start = sql.indexOf(`create or replace function public.${fn}(`)
    assert.notEqual(start, -1, `${fn} not found`)
    const end = sql.indexOf('$$;', start)
    const body = sql.slice(start, end)
    assert.match(body, /join public\.coaches c on c\.user_id = t\.coach_id/i, `${fn}: missing coach join`)
    assert.match(body, /t\.status\s*=\s*'active'/i, `${fn}: missing trainee status check`)
    assert.match(body, /c\.access_status\s*=\s*'active'/i, `${fn}: missing coach access_status check`)
    assert.match(body, /public\.is_trainee\(\)/i, `${fn}: missing is_trainee() check`)
  }
  // Symmetric with is_coach() (056): exact equality, not a `<> 'suspended'`
  // check -- a 'pending' coach blocks trainees too. Phrased in prose in
  // the comment (not literal SQL) specifically so this assertion can't
  // false-positive against the comment's own explanation of itself.
  assert.doesNotMatch(sql, /access_status\s*<>\s*'suspended'/i)
  assert.doesNotMatch(sql, /access_status\s*!=\s*'suspended'/i)
})

test('never writes to trainees.status or public.coaches -- every change is a read-only join', () => {
  assert.doesNotMatch(sql, /update\s+public\.trainees/i)
  assert.doesNotMatch(sql, /update\s+public\.coaches/i)
  assert.doesNotMatch(sql, /insert\s+into\s+public\.coaches/i)
})

test('all four stay security definer and stable, unchanged from their current (033) definitions', () => {
  for (const fn of FUNCTIONS) {
    const start = sql.indexOf(`create or replace function public.${fn}(`)
    const end = sql.indexOf('$$;', start)
    const body = sql.slice(start, end)
    assert.match(body, /security definer/i, `${fn}: not security definer`)
    assert.match(body, /\bstable\b/i, `${fn}: not stable`)
    assert.match(body, /set search_path = public, pg_temp/i, `${fn}: search_path not locked down`)
  }
})

test('all four keep their exact grants -- revoked from public/anon, granted to authenticated', () => {
  for (const fn of FUNCTIONS) {
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.${fn}\\(\\) from public;`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.${fn}\\(\\) from anon;`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${fn}\\(\\) to authenticated;`, 'i'),
    )
  }
})

test('none of the four selects a column from public.coaches -- nothing new exposed to the trainee', () => {
  for (const fn of FUNCTIONS) {
    const start = sql.indexOf(`create or replace function public.${fn}(`)
    const end = sql.indexOf('$$;', start)
    const body = sql.slice(start, end)
    const returnsMatch = body.match(/returns\s+table\s*\(([^)]*)\)/i)
    if (returnsMatch) {
      assert.doesNotMatch(returnsMatch[1], /access_status/i, `${fn}: leaks access_status in return type`)
    }
    // A reference to "c." outside the join/where clauses would mean a
    // column from public.coaches is being selected or returned.
    const selectClause = body.slice(0, body.search(/\bfrom\s+public\.(trainees|trainee_training_programs)\b/i))
    assert.doesNotMatch(selectClause, /\bc\./i, `${fn}: selects a column from the coaches alias`)
  }
})

test("trainee_get_active_training_program's program-status filter is untouched", () => {
  // p.status = 'active' is the PROGRAM's own status (a different table),
  // not the trainee's or the coach's -- must survive unchanged.
  const start = sql.indexOf('create or replace function public.trainee_get_active_training_program(')
  const end = sql.indexOf('$$;', start)
  const body = sql.slice(start, end)
  assert.match(body, /p\.status\s*=\s*'active'/i)
  assert.match(body, /p\.coach_id\s*=\s*t\.coach_id/i)
})
