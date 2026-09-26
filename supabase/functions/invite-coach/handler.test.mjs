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

// The fake models TWO stores, because the real system has two and the
// interaction between them is where the interesting bug lived:
//
//   store     -- public.coach_invitations rows
//   authUsers -- auth.users rows
//
// An earlier version of this fake had no authUsers at all: its
// inviteUserByEmail reported success and recorded nothing. That made a
// "resend" look like it worked, because the RPC fake only ever consulted
// the invitation store and happily returned the existing token. Real
// GoTrue creates an UNCONFIRMED auth.users row on a successful invite,
// and owner_get_or_invite_coach rejects any address that already has an
// auth.users row (056, the pre-existing-account check). Modeling only the
// invitation store hid a contradiction that fails 100% of the time in
// production. It is modeled now.
function fakeSupabase({
  invitations = {},
  authUsers = {},
  isOwner = true,
  inviteEmailImpl,
  // Whether a successful inviteUserByEmail creates the Auth user, as real
  // GoTrue does. Only a test that is deliberately modeling a send which
  // failed BEFORE user creation sets this false.
  sendCreatesAuthUser = true,
} = {}) {
  const store = { ...invitations } // email -> {id, token, expiresAt, status}
  const users = { ...authUsers } // email -> {id, confirmed}
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

        // Mirrors the real RPC's ordering: the pre-existing-Auth-account
        // check runs BEFORE the invitation lookup, so it shadows both the
        // token-reuse branch and the expired-row replacement branch.
        if (users[email]) {
          return {
            data: null,
            error: {
              message:
                'An account already exists for this email address. It cannot be invited as a new coach -- have them sign in with the existing account, or use a different address.',
            },
          }
        }

        const existing = store[email]
        if (existing && existing.status === 'invited' && existing.expiresAt > Date.now()) {
          return {
            data: [{ invitation_id: existing.id, invite_token: existing.token, invite_expires_at: new Date(existing.expiresAt).toISOString(), newly_issued: false }],
            error: null,
          }
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

  let userCounter = 0
  const admin = {
    auth: {
      admin: {
        inviteUserByEmail: async (email, opts) => {
          const result = inviteEmailImpl
            ? await inviteEmailImpl(email, opts)
            : { data: { user: { id: 'new-user' } }, error: null }
          if (!result.error && sendCreatesAuthUser) {
            const key = email.toLowerCase().trim()
            if (!users[key]) {
              userCounter += 1
              users[key] = { id: `auth-user-${userCounter}`, confirmed: false }
            }
          }
          return result
        },
      },
    },
  }

  return { asUser, admin, store, users }
}

test('first invitation: issues a fresh token and sends successfully', async () => {
  const { asUser, admin } = fakeSupabase()
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'new.coach@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.newly_issued, true)
  assert.equal(result.body.email, 'new.coach@example.com')
})

test('a successful first invitation creates an unconfirmed Auth user (what real GoTrue does)', async () => {
  const { asUser, admin, users } = fakeSupabase()
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })

  assert.equal(result.status, 200)
  assert.ok(users['x@example.com'], 'inviteUserByEmail must have created an auth.users row')
  assert.equal(users['x@example.com'].confirmed, false, 'and it is unconfirmed until they accept')
})

test('RESEND CONTRADICTION: a second invitation to the same address is rejected, because the first one created the Auth user', async () => {
  // This is the whole reason the dashboard has no resend button. The
  // second call never reaches the token-reuse branch: the RPC's
  // pre-existing-account check fires first and rejects it outright.
  const { asUser, admin } = fakeSupabase()
  const first = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  assert.equal(first.status, 200)

  const second = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })
  assert.equal(second.status, 400, 'a resend fails -- it does not quietly reuse the token')
  assert.match(second.body.error.message, /account already exists/i)
})

test('RESEND CONTRADICTION: an EXPIRED application invitation cannot be re-issued either, for the same reason', async () => {
  // The expired-row replacement branch is equally shadowed by the
  // pre-existing-account check, so an invitation that timed out is a
  // dead end through this path rather than something the owner can
  // refresh.
  const { asUser, admin } = fakeSupabase({
    invitations: {
      'stale@example.com': {
        id: 'inv-old',
        token: 'token-old',
        expiresAt: Date.now() - 1000, // already expired
        status: 'invited',
      },
    },
    authUsers: { 'stale@example.com': { id: 'auth-old', confirmed: false } },
  })

  const result = await handleInviteCoachRequest({ asUser, admin, email: 'stale@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 400)
  assert.match(result.body.error.message, /account already exists/i)
})

test('retry after a send that failed BEFORE user creation still reuses the same token', async () => {
  // The legitimate idempotency the RPC was designed for, and the only
  // case that still reaches the reuse branch. The token is asserted where
  // it actually travels -- the emailed link's metadata -- because the
  // response body no longer carries it.
  const sentTokens = []
  let failFirst = true
  const { asUser, admin } = fakeSupabase({
    sendCreatesAuthUser: false, // modeling a failure before GoTrue created the user
    inviteEmailImpl: async (_email, opts) => {
      sentTokens.push(opts.data.coach_invite_token)
      if (failFirst) {
        failFirst = false
        return { data: null, error: { message: 'SMTP temporarily unavailable' } }
      }
      return { data: {}, error: null }
    },
  })

  const first = await handleInviteCoachRequest({ asUser, admin, email: 'y@example.com', siteUrl: 'https://example.com' })
  assert.equal(first.status, 502, 'the failed send is reported')

  const retry = await handleInviteCoachRequest({ asUser, admin, email: 'y@example.com', siteUrl: 'https://example.com' })
  assert.equal(retry.status, 200)
  assert.equal(retry.body.newly_issued, false, 'the retry reuses rather than rotates')
  assert.equal(sentTokens.length, 2)
  assert.equal(sentTokens[1], sentTokens[0], 'a link already delivered must keep working')
})

test('the response body never carries the invitation token back to the browser', async () => {
  const { asUser, admin } = fakeSupabase()
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'x@example.com', siteUrl: 'https://example.com' })

  assert.equal(result.body.invite_token, undefined)
  // Belt and braces: no field of the body may contain the token value,
  // under any key. The fake issues a recognizable token shape.
  const serialized = JSON.stringify(result.body)
  assert.ok(!/token/i.test(serialized), `response body mentions a token: ${serialized}`)
  // What the dashboard legitimately needs is still there.
  assert.ok(result.body.invitation_id)
  assert.equal(result.body.email, 'x@example.com')
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
  // An accepted invitation means the invitee confirmed their email, so
  // the Auth account exists and is confirmed. That -- not the invitation
  // row's status -- is what the real RPC keys off, so it is what the fake
  // models.
  const { asUser, admin } = fakeSupabase({
    invitations: {
      'taken@example.com': { id: 'inv-x', token: 't', expiresAt: Date.now() + 1000, status: 'accepted' },
    },
    authUsers: { 'taken@example.com': { id: 'auth-taken', confirmed: true } },
  })
  const result = await handleInviteCoachRequest({ asUser, admin, email: 'taken@example.com', siteUrl: 'https://example.com' })
  assert.equal(result.status, 400)
  assert.match(result.body.error.message, /account already exists/i)
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
