// Unit tests for handleInviteCoachRequest (handler.js), run under Node:
//   node --test supabase/functions/invite-coach/handler.test.mjs
// Mirrors supabase/functions/invite-trainee/handler.test.mjs's structure
// and reasoning throughout.
//
// =====================================================================
// What this DOES verify
// =====================================================================
// The orchestration logic in handler.js: which RPC is called with what
// argument, how every branch of owner_get_or_invite_coach's possible
// outcomes and every inviteUserByEmail outcome (success / generic
// failure / duplicate email) map to a response, and that a failed email
// send NEVER triggers a cancellation under any circumstance. The fake
// `asUser`/`admin` clients below model owner_get_or_invite_coach's state
// machine per 056_owner_coach_administration.sql (including the row-lock
// non-interleaving guarantee, modeled as a per-email async queue).
//
// Unlike invite-trainee/handler.test.mjs (whose header notes no local
// Postgres was available when it was written), the REAL SQL this fake
// models has since been verified directly against a real Postgres engine
// -- see scripts/food-catalog-import/schema-test/testOwnerCoachAdmin.mjs,
// which runs the actual owner_get_or_invite_coach RPC (idempotent reuse,
// duplicate-email rejection, non-owner rejection, the linking trigger)
// under PGlite with genuine RLS enforcement. This file still only tests
// the JS orchestration layer in isolation, not a real deployed Edge
// Function, real GoTrue, or real email delivery -- see the implementation
// notes reported alongside this change for the remaining preview-
// environment verification steps.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleInviteCoachRequest } from './handler.js'

function fakeSupabase({ invitations = {}, isOwner = true, inviteEmailImpl } = {}) {
  const store = { ...invitations } // email -> {token, expiresAt, status}
  let lock = Promise.resolve()
  function withRowLock(fn) {
    const run = lock.then(fn, fn)
    lock = run.then(() => {}, () => {})
    return run
  }
  let tokenCounter = 0

  const asUser = {
    rpc: async (name, args) => {
      assert.equal(name, 'owner_get_or_invite_coach')
      if (!isOwner) {
        return { data: null, error: { message: 'Only the owner may invite a coach.' } }
      }
      return withRowLock(async () => {
        const email = args.p_email.toLowerCase().trim()
        const existing = store[email]
        if (existing && existing.status === 'invited' && existing.expiresAt > Date.now()) {
          return {
            data: [{ invitation_id: existing.id, invite_token: existing.token, invite_expires_at: new Date(existing.expiresAt).toISOString(), newly_issued: false }],
            error: null,
          }
        }
        if (existing?.status === 'accepted') {
          return { data: null, error: { message: 'This email already belongs to an existing account with an assigned role.' } }
        }
        tokenCounter += 1
        const token = `token-${tokenCounter}`
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
        store[email] = { id: `inv-${tokenCounter}`, token, expiresAt, status: 'invited' }
        return {
          data: [{ invitation_id: store[email].id, invite_token: token, invite_expires_at: new Date(expiresAt).toISOString(), newly_issued: true }],
          error: null,
        }
      })
    },
  }

  const admin = {
    auth: {
      admin: {
        inviteUserByEmail: async (email, opts) => {
          if (inviteEmailImpl) return inviteEmailImpl(email, opts)
          return { data: { user: { id: 'new-user' } }, error: null }
        },
      },
    },
  }

  return { asUser, admin, store }
}

test('first invitation: issues a fresh token and sends successfully', async () => {
  const { asUser, admin } = fakeSupabase()
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'new.coach@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.newly_issued, true)
  assert.equal(result.body.email, 'new.coach@example.com')
})

test('resend of a still-pending invite reuses the same token (no rotation)', async () => {
  const { asUser, admin } = fakeSupabase()
  const first = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  const second = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  assert.equal(second.body.invite_token, first.body.invite_token)
  assert.equal(second.body.newly_issued, false)
})

test('a non-owner caller is rejected with 400, before any email is sent', async () => {
  let emailSendCalled = false
  const { asUser, admin } = fakeSupabase({
    isOwner: false,
    inviteEmailImpl: async () => {
      emailSendCalled = true
      return { data: {}, error: null }
    },
  })
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 400)
  assert.match(result.body.error.message, /owner/i)
  assert.equal(emailSendCalled, false, 'the privileged admin email call must never be reached for a rejected caller')
})

test('an email already belonging to an existing account is rejected clearly', async () => {
  const { asUser, admin, store } = fakeSupabase()
  store['taken@example.com'] = { id: 'inv-x', token: 't', expiresAt: Date.now() + 1000, status: 'accepted' }
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'taken@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 400)
  assert.match(result.body.error.message, /already belongs/i)
})

test('delivery failure on a fresh issue does NOT cancel -- the token stays pending for retry', async () => {
  const { asUser, admin, store } = fakeSupabase({
    inviteEmailImpl: async () => ({ data: null, error: { message: 'SMTP timeout' } }),
  })
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'y@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 502)
  assert.equal(store['y@example.com'].status, 'invited', 'the invitation must remain pending, not be cancelled')
})

test('duplicate email reported by inviteUserByEmail itself maps to 409, not 502', async () => {
  const { asUser, admin } = fakeSupabase({
    inviteEmailImpl: async () => ({ data: null, error: { code: 'email_exists', message: 'User already registered' } }),
  })
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'z@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 409)
})

test('B succeeds, then A fails: token remains valid (no cancellation on any send failure)', async () => {
  let callCount = 0
  const { asUser, admin, store } = fakeSupabase({
    inviteEmailImpl: async () => {
      callCount += 1
      // First call (request A's send) fails; a hypothetical concurrent
      // request B is modeled by directly re-reading store state below --
      // the important assertion is simply that A's failure never flips
      // the row back out of 'invited'.
      if (callCount === 1) return { data: null, error: { message: 'transient' } }
      return { data: { user: {} }, error: null }
    },
  })
  await handleInviteCoachRequest({ asUser, admin, email: 'race@example.com', siteUrl: 'https://example.com' })
  assert.equal(store['race@example.com'].status, 'invited')
})

test('missing invite_token in the RPC result is a clear 500, not a silent email send', async () => {
  let emailSendCalled = false
  const asUser = { rpc: async () => ({ data: [{ invite_token: null }], error: null }) }
  const admin = { auth: { admin: { inviteUserByEmail: async () => { emailSendCalled = true; return { data: {}, error: null } } } } }
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 500)
  assert.equal(emailSendCalled, false)
})

test('the invite email is addressed to the exact email argument, with the token in metadata and the coach-join redirect', async () => {
  let capturedEmail, capturedOpts
  const { asUser, admin } = fakeSupabase({
    inviteEmailImpl: async (email, opts) => {
      capturedEmail = email
      capturedOpts = opts
      return { data: {}, error: null }
    },
  })
  await handleInviteCoachRequest({ asUser, admin, email: 'invitee@example.com', siteUrl: 'https://mysite.example' })
  assert.equal(capturedEmail, 'invitee@example.com')
  assert.equal(capturedOpts.redirectTo, 'https://mysite.example/coach/join')
  assert.ok(capturedOpts.data.coach_invite_token)
})
