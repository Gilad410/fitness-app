import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCoachId } from './resolveCoachId.js'

// ---------------------------------------------------------------------
// coach_barcode_products' save() must key every write on the id
// supabase.auth.getUser() resolves to -- the actual, live auth.uid()
// RLS's with_check compares against -- never on anything else (a Pinia
// store's cached session, a profile id, a trainee id, a demo id). These
// tests exercise exactly that contract in isolation, without needing a
// real Supabase client.
// ---------------------------------------------------------------------

test('resolveCoachId: returns data.user.id from a real getUser() result', () => {
  const getUserResult = { data: { user: { id: 'coach-real-auth-uid-123' } }, error: null }
  assert.equal(resolveCoachId(getUserResult), 'coach-real-auth-uid-123')
})

test('resolveCoachId: throws when there is no signed-in user, never returns undefined/null as a usable id', () => {
  const getUserResult = { data: { user: null }, error: null }
  assert.throws(() => resolveCoachId(getUserResult))
})

test('resolveCoachId: throws when getUser() itself errored (e.g. an expired/invalid session), never swallows it into a falsy id', () => {
  const getUserResult = { data: { user: null }, error: new Error('invalid JWT') }
  assert.throws(() => resolveCoachId(getUserResult), /invalid JWT/)
})

test('resolveCoachId: throws on a completely empty/malformed result rather than crashing on a property-access error', () => {
  assert.throws(() => resolveCoachId({}))
  assert.throws(() => resolveCoachId(undefined))
})

test('resolveCoachId: ignores any other id-shaped field that might be present alongside data.user -- only data.user.id is ever used', () => {
  const getUserResult = {
    data: {
      user: { id: 'coach-real-auth-uid-123' },
      // Neither of these is a real getUser() shape -- included only to
      // prove they are never read as a fallback coach id.
      profile_id: 'profile-999',
      trainee_id: 'trainee-888',
    },
    error: null,
  }
  assert.equal(resolveCoachId(getUserResult), 'coach-real-auth-uid-123')
})
