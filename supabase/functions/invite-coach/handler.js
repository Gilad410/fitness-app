// Pure request-handling logic for the invite-coach Edge Function.
// Mirrors supabase/functions/invite-trainee/handler.js's shape and
// reasoning exactly -- no Deno-specific syntax, every dependency passed
// as a plain argument, so this exact file is importable and unit-testable
// directly under Node (handler.test.mjs) as well as from index.ts's
// Deno.serve HTTP glue.
//
// Authorization happens BEFORE any privileged action, same as
// invite-trainee: step 1 calls owner_get_or_invite_coach through the
// as-user (RLS-bound) client, which independently re-checks is_owner()
// in its own body (056_owner_coach_administration.sql, section 8). This
// function never re-implements that check itself -- a non-owner caller's
// request is rejected at step 1, before admin.auth.admin.inviteUserByEmail
// (the one privileged, service-role-key call this function exists for) is
// ever reached.
//
// Retry/duplicate safety: owner_get_or_invite_coach is idempotent (a
// still-pending, unexpired invitation for the same email is returned
// UNCHANGED, not rotated -- see the migration's own comment for why,
// identical reasoning to coach_get_or_issue_trainee_invite/034). On a
// failed send, this function does NOT cancel the invitation, for the
// same reason invite-trainee's handler does not: a concurrent request for
// the same email may have already reused and successfully delivered the
// very same token, and there is no way to distinguish "the token this
// failed send is entitled to cancel" from "the token a concurrent
// success already relied on". A failed send leaves the invitation
// exactly as issued -- pending, unexpired, still claimable -- so a retry
// (or the invitee clicking an already-delivered earlier copy of the
// link) is always a safe and sufficient recovery.
export async function handleInviteCoachRequest({ asUser, admin, email, siteUrl }) {
  const { data: issueData, error: issueError } = await asUser.rpc('owner_get_or_invite_coach', {
    p_email: email,
  })
  if (issueError) {
    return errorResult(400, issueError.message)
  }

  const issued = Array.isArray(issueData) ? issueData[0] : issueData
  const inviteToken = issued?.invite_token
  const inviteExpiresAt = issued?.invite_expires_at
  const newlyIssued = issued?.newly_issued === true
  if (!inviteToken) {
    return errorResult(500, 'Invitation was issued but returned no token.')
  }

  const { error: inviteEmailError } = await admin.auth.admin.inviteUserByEmail(email, {
    // Lands the invited coach on the coach-onboarding page
    // (CoachJoinView.vue, mirrors TraineeJoinView.vue), already
    // authenticated via Supabase's own invite link -- that view detects
    // an existing session and shows the "set your password" step.
    redirectTo: `${siteUrl}/coach/join`,
    data: {
      coach_invite_token: inviteToken,
    },
  })

  if (inviteEmailError) {
    // No cancellation on failure -- see the file-header comment and
    // invite-trainee/handler.js's identical, more thoroughly-documented
    // reasoning (034_safe_trainee_invite_retry.sql). Applies unchanged
    // here: reuse means more than one request can legitimately share one
    // token, so a failure-triggered rollback can never be scoped safely.
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
      email,
      newly_issued: newlyIssued,
    },
  }
}

function errorResult(status, message) {
  return { status, body: { error: { message } } }
}
