import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const sql = await readFile(new URL('./061_coach_seat_limits_and_privacy.sql', import.meta.url), 'utf8')

test('seat limit is stored on coaches and exposed only through owner RPCs', () => {
  assert.match(sql, /add column if not exists trainee_limit integer/i)
  assert.match(sql, /create function public\.owner_list_coaches\(\)/i)
  assert.match(sql, /create or replace function public\.owner_set_coach_trainee_limit/i)
  assert.match(sql, /if not public\.is_owner\(\)/i)
  assert.match(sql, /revoke execute on function public\.owner_set_coach_trainee_limit.*from anon/is)
})

test('database trigger serializes quota checks and covers insert plus reactivation', () => {
  assert.match(sql, /select trainee_limit into v_limit[\s\S]*for update/i)
  assert.match(sql, /before insert or update of coach_id, status on public\.trainees/i)
  assert.match(sql, /t\.status <> 'archived'/i)
  assert.match(sql, /if v_used >= v_limit/i)
})

test('privacy acceptance collects the minimum and blocks direct table access', () => {
  assert.match(sql, /create table if not exists public\.privacy_acceptances/i)
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i)
  assert.doesNotMatch(sql, /ip_address|user_agent/i)
  assert.match(sql, /revoke all on table public\.privacy_acceptances from public, anon, authenticated/i)
  assert.match(sql, /p_policy_version is distinct from '2026-10-07'/i)
  assert.match(sql, /values \(auth\.uid\(\), v_role, p_policy_version, now\(\)\)/i)
})

test('legacy confirmation flow converts policy metadata into a private server record', () => {
  assert.match(sql, /create or replace function public\.capture_privacy_acceptance_on_role_link/i)
  assert.match(sql, /raw_user_meta_data ->> 'privacy_policy_version'/i)
  assert.match(sql, /after insert or update of role on public\.user_roles/i)
  assert.match(
    sql,
    /revoke execute on function public\.capture_privacy_acceptance_on_role_link\(\) from authenticated/i,
  )
})
