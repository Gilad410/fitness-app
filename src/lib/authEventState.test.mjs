// node --test src/lib/authEventState.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAuthEventState,
  applyAuthEvent,
  consumeRecoveryContext,
  hasValidRecoveryContext,
} from './authEventState.js'

// ---------------------------------------------------------------------
// applyAuthEvent -- the event -> flag reducer
// ---------------------------------------------------------------------
test('PASSWORD_RECOVERY sets recoveryReady and binds recoveryUserId', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  assert.equal(state.recoveryReady, true)
  assert.equal(state.recoveryUserId, 'user-a')
  assert.equal(state.lastEvent, 'PASSWORD_RECOVERY')
})

test('SIGNED_IN clears both recoveryReady and recoveryUserId', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  applyAuthEvent(state, 'SIGNED_IN', 'user-b')
  assert.equal(state.recoveryReady, false)
  assert.equal(state.recoveryUserId, null)
})

test('SIGNED_OUT also clears both, not just SIGNED_IN', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  applyAuthEvent(state, 'SIGNED_OUT', null)
  assert.equal(state.recoveryReady, false)
  assert.equal(state.recoveryUserId, null)
})

test('other events (TOKEN_REFRESHED, INITIAL_SESSION, ...) leave the recovery context untouched', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  for (const event of ['TOKEN_REFRESHED', 'INITIAL_SESSION', 'USER_UPDATED']) {
    applyAuthEvent(state, event, 'user-a')
    assert.equal(state.recoveryReady, true, `${event} must not clear recoveryReady`)
    assert.equal(state.recoveryUserId, 'user-a')
  }
})

test('consumeRecoveryContext clears both fields', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  consumeRecoveryContext(state)
  assert.equal(state.recoveryReady, false)
  assert.equal(state.recoveryUserId, null)
})

// ---------------------------------------------------------------------
// hasValidRecoveryContext -- the actual gate useResetPassword.js uses
// ---------------------------------------------------------------------
test('valid recovery: a genuine PASSWORD_RECOVERY for THIS user grants access', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), true)
})

test('bound identity: a recovery verified for user A does not grant access to currently-signed-in user B', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  // Even if, hypothetically, recoveryReady were somehow still true while
  // a different user is now current (defense in depth beyond the
  // SIGNED_IN-clears-it behavior above), the identity check alone must
  // still deny it.
  assert.equal(hasValidRecoveryContext('user-b', state), false)
})

test('expired/invalid link, no existing session: no event fired, no current user -> denied', () => {
  const state = createAuthEventState()
  assert.equal(hasValidRecoveryContext(null, state), false)
})

test('expired/invalid link while ANOTHER account is already signed in: pre-existing session untouched by the SDK, but recovery was never verified -> denied', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'SIGNED_IN', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), false, 'an existing session alone must never be sufficient')
})

test('direct navigation to the reset-password page while normally signed in (no link ever clicked): denied', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'SIGNED_IN', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), false)
})

test('a genuine recovery followed later by an unrelated normal sign-in in the same tab revokes access', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), true)

  applyAuthEvent(state, 'SIGNED_IN', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), false)
})

test('one-time use: after consumption, a later check for the same user is denied', () => {
  const state = createAuthEventState()
  applyAuthEvent(state, 'PASSWORD_RECOVERY', 'user-a')
  assert.equal(hasValidRecoveryContext('user-a', state), true)

  consumeRecoveryContext(state)
  assert.equal(hasValidRecoveryContext('user-a', state), false)
})
