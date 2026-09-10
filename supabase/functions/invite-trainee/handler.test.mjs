// Unit tests for handleInviteRequest (handler.js), run under Node:
//   node --test supabase/functions/invite-trainee/handler.test.mjs
// Zero new dependencies -- node:test/node:assert are built into Node 18+.
//
// =====================================================================
// What this DOES verify
// =====================================================================
// The orchestration logic in handler.js: which RPC gets called with what
// arguments, how every branch of coach_get_or_issue_trainee_invite's
// possible outcomes and every inviteUserByEmail outcome (success /
// generic failure / duplicate email) map to a response, that a failed
// email send NEVER triggers a cancellation under any circumstance (the
// bug this file's tests were written against -- see
// supabase/sql/034_safe_trainee_invite_retry.sql and handler.js's "Why
// there is no rollback RPC" / "Deliberately NO cancellation here"
// comments), and that a returned RPC `error` is always checked explicitly
// rather than assumed away. The fake `asUser`/`admin` clients below
// (fakeSupabase()) reimplement, in plain JS, the exact state machine
// supabase/sql/034_safe_trainee_invite_retry.sql's coach_get_or_issue_trainee_invite
// is supposed to implement (including the `for update` row lock, modeled
// as a per-trainee async queue so "concurrent" calls in a test cannot
// interleave mid-mutation) -- so a passing test here confirms the JS
// orchestration is correct FOR THAT MODEL of the RPC's behavior.
//
// =====================================================================
// What this does NOT verify (see the implementation notes reported
// alongside this change for the full list)
// =====================================================================
// - That the real SQL in 034_safe_trainee_invite_retry.sql actually
//   behaves like the fake here once applied to a real Postgres database
//   (no local Postgres/Supabase CLI/Docker was available in this
//   environment to run it against -- the SQL was reviewed by hand
//   against the existing, already-applied 021 migration's style and
//   locking pattern instead, not executed).
// - That auth.admin.inviteUserByEmail's real error shape (code/message)
//   for a duplicate email matches what is assumed here. This was checked
//   against the installed @supabase/auth-js source and the GoTrue
//   `/invite` handler source on GitHub (both confirm the assumption --
//   see the code review notes), not by calling the real API.
// - That the linking trigger (link_trainee_on_email_confirmed,
//   021_trainee_auth_and_roles.sql) actually fires and links the right
//   trainee row when a real invited user clicks a real email and Supabase
//   Auth flips their email_confirmed_at. That trigger is unchanged by
//   this fix, but "unchanged" was confirmed by reading the migration, not
//   by observing a real invite being accepted end to end.
// - Real network/CORS/Deno-runtime behavior of index.ts itself (the
//   Deno.serve wrapper) -- only handleInviteRequest, the part index.ts
//   delegates to, runs under this test file.
//
// A real deploy-environment test (staging Supabase project, a throwaway
// trainee row, an inbox you control) is still needed before this reaches
// real trainees -- see the implementation notes for the exact manual
// checklist.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleInviteRequest } from './handler.js'

const VALID_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ---------------------------------------------------------------------
// Fake Supabase clients -- model coach_get_or_issue_trainee_invite's
// state machine (per 034_safe_trainee_invite_retry.sql) plus a minimal
// `trainees` table and a stand-in for auth.admin.inviteUserByEmail.
// coach_cancel_trainee_invite is modeled too (unchanged, unscoped, exactly
// as in 021_trainee_auth_and_roles.sql) purely so tests can assert it is
// never called by handler.js anymore -- see "Why there is no rollback
// RPC" in the migration file.
// ---------------------------------------------------------------------
function fakeSupabase({ trainee, now = () => new Date(), inviteEmailImpl } = {}) {
  const row = {
    id: trainee?.id ?? 'trainee-1',
    coach_id: trainee?.coach_id ?? 'coach-1',
    full_name: trainee?.full_name ?? 'Test Trainee',
    email: trainee?.email ?? 'trainee@example.com',
    invite_token: trainee?.invite_token ?? null,
    invite_status: trainee?.invite_status ?? 'none',
    invite_expires_at: trainee?.invite_expires_at ?? null,
  }

  // Models `select ... for update`: calls for the same row execute one at
  // a time, in the order they arrive, each only starting once the
  // previous one's simulated "transaction" has fully finished (committed)
  // -- the same non-interleaving guarantee the real row lock provides.
  let lock = Promise.resolve()
  function withRowLock(fn) {
    const run = lock.then(fn, fn)
    // Swallow so one failed "transaction" doesn't wedge the lock for
    // whoever queues up next -- matches Postgres releasing the lock on
    // rollback just as much as on commit.
    lock = run.catch(() => {})
    return run
  }

  let issueCalls = 0
  let cancelCalls = []
  let inviteEmailCalls = []

  const rpc = async (name, params) => {
    if (name === 'coach_get_or_issue_trainee_invite') {
      return withRowLock(() => {
        issueCalls += 1
        if (params.p_trainee_id !== row.id) {
          return { data: null, error: { message: 'Trainee not found or not owned by the current coach.' } }
        }
        if (row.invite_status === 'accepted') {
          return {
            data: null,
            error: {
              message:
                'This trainee already has a linked account -- unlink it before issuing a new invite.',
            },
          }
        }
        if (!row.email || !VALID_EMAIL_RE.test(row.email)) {
          return { data: null, error: { message: 'Trainee email is not a valid email address.' } }
        }

        const stillValid = row.invite_status === 'invited' && row.invite_expires_at > now()
        if (stillValid) {
          return {
            data: [{ invite_token: row.invite_token, invite_expires_at: row.invite_expires_at, newly_issued: false }],
          }
        }

        row.invite_token = `token-${issueCalls}`
        row.invite_status = 'invited'
        row.invite_expires_at = new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000)
        return {
          data: [{ invite_token: row.invite_token, invite_expires_at: row.invite_expires_at, newly_issued: true }],
        }
      })
    }

    if (name === 'coach_cancel_trainee_invite') {
      // Unscoped, exactly like the real (unchanged) 021 function --
      // clears whatever is currently pending. Only reachable from a test
      // calling it directly (the coach's explicit "בטל הזמנה" action);
      // handler.js itself never calls this RPC.
      return withRowLock(() => {
        cancelCalls.push(params)
        if (row.invite_status !== 'invited') {
          return { data: null, error: { message: 'No pending invite to cancel for this trainee.' } }
        }
        row.invite_token = null
        row.invite_status = 'none'
        row.invite_expires_at = null
        return { data: null, error: null }
      })
    }

    throw new Error(`unexpected rpc: ${name}`)
  }

  const from = (table) => {
    assert.equal(table, 'trainees')
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { full_name: row.full_name, email: row.email }, error: null }),
        }),
      }),
    }
  }

  const defaultInviteEmailImpl = async () => ({ error: null })
  const inviteUserByEmail = async (email, opts) => {
    inviteEmailCalls.push({ email, opts })
    return (fake.admin.auth.admin._impl ?? inviteEmailImpl ?? defaultInviteEmailImpl)(email, opts)
  }

  const fake = {
    asUser: { rpc, from },
    admin: { auth: { admin: { inviteUserByEmail, _impl: null } } },
    row,
    getIssueCalls: () => issueCalls,
    getCancelCalls: () => cancelCalls,
    getInviteEmailCalls: () => inviteEmailCalls,
  }
  return fake
}

const SITE_URL = 'https://app.example.com'

// ---------------------------------------------------------------------
// 1. First invitation
// ---------------------------------------------------------------------
test('first invitation: issues a fresh token and sends successfully', async () => {
  const fake = fakeSupabase({ trainee: { invite_status: 'none' } })
  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.newly_issued, true)
  assert.equal(result.body.email, 'trainee@example.com')
  assert.equal(fake.row.invite_status, 'invited')
  assert.equal(fake.getCancelCalls().length, 0)

  const emailCall = fake.getInviteEmailCalls()[0]
  assert.equal(emailCall.email, 'trainee@example.com')
  assert.equal(emailCall.opts.redirectTo, `${SITE_URL}/trainee/join`)
  assert.equal(emailCall.opts.data.trainee_invite_token, result.body.invite_token)
})

// ---------------------------------------------------------------------
// 2. Resend while still valid -- must reuse, not rotate
// ---------------------------------------------------------------------
test('resend of a still-valid pending invite reuses the same token (no rotation)', async () => {
  const fake = fakeSupabase({
    trainee: {
      invite_status: 'invited',
      invite_token: 'original-token',
      invite_expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
    },
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 200)
  assert.equal(result.body.newly_issued, false)
  assert.equal(result.body.invite_token, 'original-token')
  assert.equal(fake.row.invite_token, 'original-token', 'token must not have been rotated')
})

// ---------------------------------------------------------------------
// 3. Delivery failure NEVER cancels -- fresh issue, resend, or duplicate
// ---------------------------------------------------------------------
test('delivery failure on a fresh issue does NOT cancel -- the token stays pending for retry', async () => {
  const fake = fakeSupabase({
    trainee: { invite_status: 'none' },
    inviteEmailImpl: async () => ({ error: { message: 'SMTP timed out' } }),
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 502)
  assert.match(result.body.error.message, /Failed to send the invitation email/)
  assert.equal(fake.getCancelCalls().length, 0, 'a failed send must never call the cancel RPC')
  assert.equal(fake.row.invite_status, 'invited', 'the invite must remain pending, not be rolled back')
  assert.ok(fake.row.invite_token, 'the token must still be present for a retry to reuse')
})

test('delivery failure on a resend does NOT cancel the pre-existing invite', async () => {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  const fake = fakeSupabase({
    trainee: { invite_status: 'invited', invite_token: 'still-good-token', invite_expires_at: expiresAt },
    inviteEmailImpl: async () => ({ error: { message: 'rate limited' } }),
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 502)
  assert.equal(fake.getCancelCalls().length, 0, 'a resend failure must never trigger a cancel call')
  assert.equal(fake.row.invite_status, 'invited')
  assert.equal(fake.row.invite_token, 'still-good-token', 'the original, still-valid token must survive')
  assert.equal(fake.row.invite_expires_at, expiresAt)
})

// ---------------------------------------------------------------------
// 4. THE regression this file exists to guard: a concurrent request's
//    successfully-delivered invite must survive a DIFFERENT request's
//    later send failure for the same (reused) token. This is exactly the
//    interleaving an earlier, scoped-rollback version of handler.js still
//    got wrong -- see "Why there is no rollback RPC" in
//    supabase/sql/034_safe_trainee_invite_retry.sql.
// ---------------------------------------------------------------------
test('B succeeds, then A fails: T remains valid (no cancellation on any send failure)', async () => {
  const fake = fakeSupabase({ trainee: { invite_status: 'none' } })

  // "Request A" mints token T -- modeled as a standalone call to the
  // issue RPC, the same step handleInviteRequest's own step 1 performs
  // for a real request. Kept separate from A's send (below) so "request
  // B" can run its own full request in between, exactly like the real
  // bug's timeline.
  const { data: issueA } = await fake.asUser.rpc('coach_get_or_issue_trainee_invite', {
    p_trainee_id: 'trainee-1',
  })
  const tokenT = issueA[0].invite_token
  assert.equal(issueA[0].newly_issued, true)

  // "Request B" (e.g. a double-clicked resend) runs the REAL handler
  // end-to-end: it reuses T (newly_issued=false, nothing rewritten) and
  // its send SUCCEEDS -- T is now a real, delivered invitation sitting in
  // the trainee's inbox.
  const resultB = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })
  assert.equal(resultB.status, 200)
  assert.equal(resultB.body.invite_token, tokenT)
  assert.equal(resultB.body.newly_issued, false)

  // "Request A" now completes its own, separately in-flight send attempt
  // for T -- which fails. Run through the real handler again (it
  // re-resolves the same still-valid T via the idempotent RPC, standing
  // in for request A having held onto T from its own earlier issue call)
  // so the failure path under test is handler.js's actual code, not a
  // hand-rolled stand-in for it.
  fake.admin.auth.admin._impl = async () => ({ error: { message: 'network blip during A\'s send' } })
  const resultA = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })
  assert.equal(resultA.status, 502)

  // The regression: A's failure must not have invalidated the invitation
  // B already successfully delivered.
  assert.equal(fake.row.invite_token, tokenT, "B's delivered invitation must survive A's later failure")
  assert.equal(fake.row.invite_status, 'invited')
  assert.equal(fake.getCancelCalls().length, 0, 'handler.js must never call the cancel RPC on a send failure')
})

// ---------------------------------------------------------------------
// 5. Duplicate email
// ---------------------------------------------------------------------
test('duplicate email (fresh issue) is reported clearly and does not cancel', async () => {
  const fake = fakeSupabase({
    trainee: { invite_status: 'none' },
    inviteEmailImpl: async () => ({
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    }),
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 409)
  assert.equal(
    result.body.error.message,
    'A user with this email address has already been registered.',
  )
  assert.equal(fake.getCancelCalls().length, 0, 'a duplicate-email failure must not cancel either')
  assert.equal(fake.row.invite_status, 'invited')
})

test('duplicate email (resend of an existing invite) leaves the existing invite untouched', async () => {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  const fake = fakeSupabase({
    trainee: { invite_status: 'invited', invite_token: 'still-good-token', invite_expires_at: expiresAt },
    inviteEmailImpl: async () => ({ error: { code: 'email_exists', message: 'already registered' } }),
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 409)
  assert.equal(fake.getCancelCalls().length, 0)
  assert.equal(fake.row.invite_status, 'invited')
  assert.equal(fake.row.invite_token, 'still-good-token')
})

// ---------------------------------------------------------------------
// 6. Expired / cancelled invites mint a fresh token
// ---------------------------------------------------------------------
test('an expired pending invite is replaced with a fresh token, not reused', async () => {
  const fake = fakeSupabase({
    trainee: {
      invite_status: 'invited',
      invite_token: 'expired-token',
      invite_expires_at: new Date(Date.now() - 1000), // already expired
    },
  })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 200)
  assert.equal(result.body.newly_issued, true)
  assert.notEqual(result.body.invite_token, 'expired-token')
})

test('a cancelled invite (status none) mints a fresh token', async () => {
  const fake = fakeSupabase({ trainee: { invite_status: 'none', invite_token: null, invite_expires_at: null } })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 200)
  assert.equal(result.body.newly_issued, true)
  assert.ok(result.body.invite_token)
})

// ---------------------------------------------------------------------
// 7. Concurrency: two overlapping issue calls converge on one token
// ---------------------------------------------------------------------
test('two concurrent first-time issue calls converge on the same token, not two', async () => {
  const fake = fakeSupabase({ trainee: { invite_status: 'none' } })

  const [a, b] = await Promise.all([
    handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL }),
    handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL }),
  ])

  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
  assert.equal(a.body.invite_token, b.body.invite_token, 'both requests must agree on one token')
  // Exactly one of the two should have actually minted it.
  assert.equal([a.body.newly_issued, b.body.newly_issued].filter(Boolean).length, 1)
})

// ---------------------------------------------------------------------
// 8. RPC errors are surfaced explicitly, not swallowed
// ---------------------------------------------------------------------
test('an issue RPC error (e.g. wrong owner) is surfaced as a 400 with its message', async () => {
  const fake = fakeSupabase({ trainee: { id: 'someone-elses-trainee' } })

  const result = await handleInviteRequest({ ...fake, traineeId: 'trainee-1', siteUrl: SITE_URL })

  assert.equal(result.status, 400)
  assert.equal(result.body.error.message, 'Trainee not found or not owned by the current coach.')
  assert.equal(fake.getInviteEmailCalls().length, 0, 'must not attempt to email when issuing failed')
})

// ---------------------------------------------------------------------
// 9. Correct coach-trainee linking -- OUT OF REACH for this test file.
// ---------------------------------------------------------------------
// Linking (trainees.auth_user_id / user_roles) happens entirely inside
// Postgres, via link_trainee_on_email_confirmed (021_trainee_auth_and_roles.sql,
// unchanged by this fix) once a real Supabase Auth account's
// email_confirmed_at transitions to non-null. Nothing in this file talks
// to a real Postgres or GoTrue instance, so this cannot be exercised
// here -- see the implementation notes for the manual staging-project
// checklist this still needs.
