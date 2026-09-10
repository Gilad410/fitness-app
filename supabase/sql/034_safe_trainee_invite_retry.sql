-- Safe invite retry/resend -- fixes a real data-loss bug in the
-- invite-trainee Edge Function's retry path (supabase/functions/
-- invite-trainee), found during review before that function's first
-- deployment. No email has been sent to a real trainee through this path
-- yet; this migration must be applied before it is.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 033_pre_pilot_security_hardening.sql. Wrapped
-- in a single transaction so it applies entirely or not at all. Purely
-- additive: one new function. No table, column, or existing row is
-- touched; no data is deleted; no existing function's signature or
-- behavior changes.
--
-- (An earlier revision of this file also changed coach_cancel_trainee_invite
-- to accept an optional p_expected_token, for a scoped rollback the Edge
-- Function used to perform on a failed email send. That rollback turned
-- out to be unsafe in its own right -- see "Why there is no rollback
-- RPC" below -- and was removed from the Edge Function entirely, which
-- means nothing calls coach_cancel_trainee_invite with a token anymore.
-- This revision drops that unused parameter again rather than leave a
-- capability with zero real callers sitting in the schema -- simpler, and
-- one less signature to reason about. coach_cancel_trainee_invite is
-- therefore completely unchanged from 021_trainee_auth_and_roles.sql.)
--
-- =====================================================================
-- The bug
-- =====================================================================
-- coach_issue_trainee_invite (021_trainee_auth_and_roles.sql) rotates
-- trainees.invite_token unconditionally on every call, including a call
-- made purely to *resend* an email for an invite that is already pending
-- and still perfectly valid. A resend that fails to send (transient SMTP
-- error, rate limit, ...) would therefore permanently invalidate a
-- working invitation the trainee may still have been about to click --
-- the OLD token is destroyed by the rotation itself, before the new
-- email even attempts to send, regardless of whether that old token had
-- already been emailed out.
--
-- =====================================================================
-- The fix
-- =====================================================================
-- coach_get_or_issue_trainee_invite -- a new, idempotent alternative to
-- coach_issue_trainee_invite for exactly the case that was unsafe: "get a
-- token to email, issuing one only if actually needed." If a pending,
-- unexpired invite already exists, it is returned COMPLETELY UNCHANGED
-- (no write at all) instead of being rotated -- so a resend that goes on
-- to fail leaves nothing to roll back, and whatever was already
-- delivered for that token (on this attempt or an earlier one) stays
-- exactly as valid as it was. A token is only minted fresh when there is
-- genuinely nothing valid to reuse: no invite has ever been issued
-- ('none'), or the existing one has expired. The result additionally
-- reports `newly_issued` so a caller can tell which happened.
--
-- Same ownership/role/email-validity checks as coach_issue_trainee_invite,
-- and the same `for update` row lock, taken *before* branching on state --
-- a second concurrent call for the same trainee blocks until the first
-- transaction commits, then correctly observes the already-issued,
-- still-valid row and reuses it rather than racing to mint (and
-- overwrite) a second token.
--
-- coach_issue_trainee_invite itself is UNCHANGED and still exists -- it
-- remains available as the explicit "I want a genuinely new link, even
-- though the old one still works" action (e.g. a coach who suspects a
-- link leaked can cancel then re-issue, which is 'none' -> fresh token
-- under the new function too). The Edge Function's automatic
-- issue-and-email step no longer calls it, precisely because *automatic*
-- rotation on every call was the unsafe part.
--
-- =====================================================================
-- Why there is no rollback RPC
-- =====================================================================
-- It is tempting to also want a way for the Edge Function to cancel the
-- invite it just issued if the email then fails to send. That was in
-- fact this migration's original design (a coach_cancel_trainee_invite
-- variant scoped to the exact token just minted, so it could only ever
-- clear that caller's own token, never a different request's). It turned
-- out to still be unsafe, because reuse means more than one request can
-- legitimately share one token:
--
--   1. Request A issues token T fresh.
--   2. Request B (e.g. a double-clicked resend) reuses T via
--      coach_get_or_issue_trainee_invite -- and its send SUCCEEDS. T is
--      now a real, delivered invitation.
--   3. Request A's own send then fails. T still matches the row (B's
--      reuse never wrote anything), so a rollback scoped to "the token I
--      minted" cancels T anyway -- destroying the invitation B just
--      successfully delivered.
--
-- There is no token-level distinction between "the token a failed send
-- is entitled to cancel" and "the token a concurrent successful send
-- already relied on" -- so cancelling on a failed send is unsafe no
-- matter how precisely it is scoped. The Edge Function (see
-- supabase/functions/invite-trainee/handler.js) now never auto-cancels on
-- a failed send, under any circumstance: a failed send leaves the token
-- exactly as issued -- 'invited', unexpired, still claimable -- and
-- retrying (or the trainee clicking an already-delivered earlier copy of
-- the same link) is always a safe and sufficient recovery. Cancellation
-- remains available only through the coach's own explicit "בטל הזמנה"
-- action (TraineeInviteSection.vue -> coach_cancel_trainee_invite,
-- unchanged from 021), which a human, not an automatic retry, decides to
-- take.

begin;

create or replace function public.coach_get_or_issue_trainee_invite(p_trainee_id uuid)
returns table (invite_token uuid, invite_expires_at timestamptz, newly_issued boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid;
  v_expires timestamptz;
  v_row public.trainees%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may issue a trainee invite.';
  end if;

  -- Locks the row before any state check below, so a second concurrent
  -- call for the same trainee blocks here until this transaction commits
  -- (or rolls back) -- it can then only ever observe the final, already-
  -- resolved state, never race this one to also mint a token.
  select * into v_row
  from public.trainees
  where id = p_trainee_id and coach_id = auth.uid()
  for update;

  if not found then
    raise exception 'Trainee not found or not owned by the current coach.';
  end if;

  if v_row.invite_status = 'accepted' then
    raise exception 'This trainee already has a linked account -- unlink it before issuing a new invite.';
  end if;

  if v_row.email is null or trim(v_row.email) = '' then
    raise exception 'Trainee must have a valid email before an invite can be issued.';
  end if;

  if lower(trim(v_row.email)) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Trainee email is not a valid email address.';
  end if;

  -- Reuse path: a pending, unexpired invite already exists -- hand it
  -- back completely unchanged. This is the fix -- nothing is written, so
  -- a caller that goes on to fail delivering an email for this token has
  -- nothing to roll back, and any earlier delivery of this same token
  -- remains exactly as valid as it already was.
  if v_row.invite_status = 'invited' and v_row.invite_expires_at > now() then
    return query select v_row.invite_token, v_row.invite_expires_at, false;
    return;
  end if;

  -- Otherwise a fresh token is genuinely needed: covers both 'none' (no
  -- invite ever issued, or a previous one was cancelled/unlinked) and an
  -- 'invited' row whose invite_expires_at has already passed.
  v_token := gen_random_uuid();
  v_expires := now() + interval '7 days';

  update public.trainees
  set invite_token = v_token,
      invite_status = 'invited',
      invite_sent_at = now(),
      invite_expires_at = v_expires,
      invite_accepted_at = null
  where id = p_trainee_id
    and coach_id = auth.uid();

  return query select v_token, v_expires, true;
end;
$$;

revoke execute on function public.coach_get_or_issue_trainee_invite(uuid) from public;
revoke execute on function public.coach_get_or_issue_trainee_invite(uuid) from anon;
grant execute on function public.coach_get_or_issue_trainee_invite(uuid) to authenticated;

commit;
