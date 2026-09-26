import { test } from 'node:test'
import assert from 'node:assert/strict'
import { performOwnerLogout, POST_LOGOUT_PATH } from './ownerLogout.js'

// The owner screen had no way out: with a live session, navigating to
// /login bounced straight back to /owner/coaches (the guard sends an
// authenticated user to their own area), so signing in as anyone else was
// impossible without clearing site data by hand. These tests pin the
// sign-out sequence, including the part that is easy to get wrong -- what
// happens when the remote sign-out fails.

function fakes({ signOutRejects = false } = {}) {
  const calls = []
  const authStore = {
    async signOut() {
      calls.push('signOut')
      if (signOutRejects) throw new Error('network down')
    },
  }
  const ownerStore = {
    coaches: [{ email: 'coach@example.com', owner_note: 'private note' }],
    pendingInvitations: [{ email: 'invited@example.com' }],
    $reset() {
      calls.push('$reset')
      this.coaches = []
      this.pendingInvitations = []
    },
  }
  const navigated = []
  const navigate = (path) => {
    calls.push('navigate')
    navigated.push(path)
  }
  return { authStore, ownerStore, navigate, navigated, calls }
}

test('happy path: ends the session, clears owner state, then navigates to /login', async () => {
  const f = fakes()
  const result = await performOwnerLogout(f)

  assert.deepEqual(f.calls, ['signOut', '$reset', 'navigate'], 'order matters')
  assert.deepEqual(f.navigated, ['/login'])
  assert.equal(result.signOutFailed, false)
})

test('the landing path is /login', () => {
  assert.equal(POST_LOGOUT_PATH, '/login')
})

test('owner-scoped local data does not survive the logout', async () => {
  const f = fakes()
  await performOwnerLogout(f)

  assert.deepEqual(f.ownerStore.coaches, [], 'coach emails and owner notes must be gone')
  assert.deepEqual(f.ownerStore.pendingInvitations, [], 'invited addresses must be gone')
})

test('the session is ended BEFORE the local state is cleared', async () => {
  // If the order were reversed, a slow/failed sign-out would leave a live
  // session with an emptied screen -- the confusing half-state.
  const f = fakes()
  await performOwnerLogout(f)
  assert.ok(f.calls.indexOf('signOut') < f.calls.indexOf('$reset'))
})

test('navigation happens LAST, after the teardown', async () => {
  const f = fakes()
  await performOwnerLogout(f)
  assert.equal(f.calls[f.calls.length - 1], 'navigate')
})

test('a failing remote sign-out still clears local data and still navigates', async () => {
  // Fail closed: a network error is no reason to keep the previous
  // owner's private notes on screen, or to trap them on an admin page.
  const f = fakes({ signOutRejects: true })
  const result = await performOwnerLogout(f)

  assert.equal(result.signOutFailed, true)
  assert.deepEqual(f.ownerStore.coaches, [])
  assert.deepEqual(f.ownerStore.pendingInvitations, [])
  assert.deepEqual(f.navigated, ['/login'])
})

test('a failing remote sign-out does not reject to the caller', async () => {
  const f = fakes({ signOutRejects: true })
  await assert.doesNotReject(() => performOwnerLogout(f))
})

test('repeated logouts are harmless', async () => {
  const f = fakes()
  await performOwnerLogout(f)
  await performOwnerLogout(f)
  assert.deepEqual(f.navigated, ['/login', '/login'])
  assert.deepEqual(f.ownerStore.coaches, [])
})
