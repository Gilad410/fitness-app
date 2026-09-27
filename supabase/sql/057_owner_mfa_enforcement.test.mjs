import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sql = fs.readFileSync(new URL('./057_owner_mfa_enforcement.sql', import.meta.url), 'utf8')

test('057 is atomic and replaces only the owner authorization function', () => {
  assert.match(sql, /^\s*--[\s\S]*?\bbegin\s*;/i)
  assert.match(sql, /\bcommit\s*;\s*$/i)
  assert.match(sql, /create or replace function public\.is_owner\(\)/i)
  assert.doesNotMatch(sql, /\b(drop|truncate|delete)\b/i)
})

test('owner authorization requires both the owner role and aal2', () => {
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'aal'/i)
  assert.match(sql, /=\s*'aal2'/i)
  assert.match(sql, /user_id\s*=\s*auth\.uid\(\)\s+and\s+role\s*=\s*'owner'/i)
})

test('is_owner keeps the hardened execution grants', () => {
  assert.match(sql, /revoke execute on function public\.is_owner\(\) from public/i)
  assert.match(sql, /revoke execute on function public\.is_owner\(\) from anon/i)
  assert.match(sql, /grant execute on function public\.is_owner\(\) to authenticated/i)
})
