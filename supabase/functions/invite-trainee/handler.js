// Pure request-handling logic for the invite-trainee Edge Function.
// Deliberately has NO Deno-specific syntax (no `Deno.*`, no `jsr:`/`https:`
// import specifiers) and takes every dependency (the two Supabase clients,
// the trainee id, the site URL) as plain arguments -- nothing here reads
// an environment variable or constructs a client itself. That's what lets
// this exact file be imported and unit-tested directly under Node (see
// handler.test.mjs, run with `node --test`) as well as from index.ts's
// Deno.serve HTTP glue: both call this same function, so there is nothing
// here that is re-implemented (and could drift) between the two.
//
// Returns a plain { status, body } object rather than a Response -- the
// Deno-specific Response/JSON serialization stays in index.ts, which is
// the only part of this feature that cannot be exercised under Node.
//
// =====================================================================
// Retry/resend safety (see supabase/sql/034_safe_trainee_invite_retry.sql
// for the full writeup of the token-rotation bug this fixes)
// =====================================================================
// Step 1 calls coach_get_or_issue_trainee_invite, NOT the older
// coach_issue_trainee_invite -- the new RPC reuses a still-pending,
// unexpired invite completely unchanged (no write) instead of always
// rotating the token. A resend therefore never destroys a still-valid,
// possibly-already-delivered token just by being attempted.
//
// On a failed *send* (step 3), this function does NOT cancel the invite,
// under any circumstance -- see the comment at that call site for why an
// earlier version's rollback-on-failure was itself unsafe, and was
// removed rather than made more clever. Cancellation only ever happens
// through the coach's own explicit "בטל הזמנה" action
// (coach_cancel_trainee_invite, called directly from
// traineeInvites.js's cancel(), never from this function). A failed send
// leaves the token exactly as issued -- 'invited', unexpired, still
// claimable -- so simply retrying (resend, or the trainee clicking an
// earlier successfully-delivered copy of the same link) is always a safe
// and sufficient recovery; there is nothing here for a caller to clean up.
export async function handleInviteRequest({ asUser, admin, traineeId, siteUrl }) {
  // Step 1: idempotent issue-or-reuse. Every RPC error is checked
  // explicitly via the returned `{ error }` -- supabase-js's .rpc() never
  // throws on a database-side failure, it reports it in this field, so a
  // try/catch around a bare call would silently miss it.
  const { data: issueData, error: issueError } = await asUser.rpc(
    'coach_get_or_issue_trainee_invite',
    { p_trainee_id: traineeId },
  )
  if (issueError) {
    return errorResult(400, issueError.message)
  }

  // coach_get_or_issue_trainee_invite is `returns table(...)` -- PostgREST
  // returns set-returning functions as an array of rows.
  const issued = Array.isArray(issueData) ? issueData[0] : issueData
  const inviteToken = issued?.invite_token
  const inviteExpiresAt = issued?.invite_expires_at
  const newlyIssued = issued?.newly_issued === true
  if (!inviteToken) {
    return errorResult(500, 'Invite was issued but returned no token.')
  }

  // Step 2: read back the trainee's name/email to address the email to --
  // still the as-user client, so still scoped by trainees_select_own.
  const { data: trainee, error: traineeError } = await asUser
    .from('trainees')
    .select('full_name, email')
    .eq('id', traineeId)
    .single()
  if (traineeError) {
    return errorResult(500, `Could not load trainee details after issuing the invite: ${traineeError.message}`)
  }
  if (!trainee?.email) {
    return errorResult(500, 'Could not load trainee details after issuing the invite.')
  }

  // Step 3: the one privileged call this whole function exists for.
  const { error: inviteEmailError } = await admin.auth.admin.inviteUserByEmail(trainee.email, {
    // Lands the trainee back on the existing onboarding page
    // (TraineeJoinView.vue) already-authenticated via Supabase's own
    // invite link -- that view detects an existing session and shows the
    // "set your password" step instead of its self-serve email+password
    // form. See that component for the branch that handles this.
    redirectTo: `${siteUrl}/trainee/join`,
    data: {
      trainee_invite_token: inviteToken,
      full_name: trainee.full_name,
    },
  })

  if (inviteEmailError) {
    // Deliberately NO cancellation here -- an earlier version of this
    // function rolled back (cancelled) the invite on a failed send
    // whenever `newlyIssued` was true, scoped to the exact token it had
    // just minted via p_expected_token. That scoping stops a rollback
    // from clearing a *different* request's token, but it does not stop
    // it from clearing its OWN token out from under a concurrent request
    // that reused that same token and already delivered it successfully:
    //   1. Request A issues token T fresh (newlyIssued=true).
    //   2. Request B (e.g. a double-clicked resend) reuses T
    //      (newlyIssued=false) and its send SUCCEEDS -- T is now a real,
    //      delivered invitation sitting in the trainee's inbox.
    //   3. Request A's own send then fails. p_expected_token=T still
    //      matches the row (B's reuse never wrote anything), so A's
    //      "scoped" rollback cancels T anyway -- destroying the
    //      invitation B just successfully delivered.
    // There is no token-level distinction between "the token a failed
    // send is entitled to cancel" and "the token a concurrent successful
    // send already relied on" -- reuse means multiple requests can
    // legitimately share one token, so cancelling on failure is unsafe
    // regardless of how precisely it is scoped. The only safe fix is to
    // never auto-cancel on a send failure at all: leave the token
    // pending and let a retry (or an already-delivered earlier copy of
    // the link) recover it. See the regression test in handler.test.mjs
    // ("B succeeds, then A fails: T remains valid") for this exact
    // interleaving.
    const isDuplicate =
      inviteEmailError.code === 'email_exists' ||
      /already.*(registered|exists|invited)/i.test(inviteEmailError.message ?? '')

    return errorResult(
      isDuplicate ? 409 : 502,
      isDuplicate
        ? 'A user with this email address has already been registered.'
        : `Failed to send the invitation email: ${inviteEmailError.message}`,
    )
  }

  return {
    status: 200,
    body: {
      ok: true,
      invite_token: inviteToken,
      invite_expires_at: inviteExpiresAt,
      email: trainee.email,
      newly_issued: newlyIssued,
    },
  }
}

function errorResult(status, message) {
  return { status, body: { error: { message } } }
}
