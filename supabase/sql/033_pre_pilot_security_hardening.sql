-- Pre-Pilot Security Hardening (Stage 1) -- closes the two Medium findings
-- confirmed by the live pre-pilot security audit
-- (supabase/audits/pre_pilot_security_verification.sql, run against the
-- live project on 2026-08-30):
--
--   Finding 1: a trainee whose trainees.status is 'paused' or 'archived'
--   keeps full self-service portal access after their coach pauses/
--   archives them, because no trainee-facing function or policy ever
--   checked status -- only that an auth_user_id link exists. Confirmed
--   live: trainee_get_auth_context() does not mention status at all;
--   trainee_get_own_profile() returns status as a column but never
--   filters on it; trainee_get_own_starting_circumferences() does not
--   mention it either. 0 linked accounts are affected today (the only
--   linked trainee in this pilot is 'active'), so this is a
--   defense-in-depth fix ahead of scale, not a response to a live
--   incident.
--
--   Finding 2: live grant inspection (information_schema.role_routine_grants)
--   showed EXECUTE on 17 of this schema's 22 SECURITY DEFINER functions
--   still granted to the anon role, despite every one of those 17 having a
--   `revoke execute ... from public` in its original migration. Root
--   cause, confirmed by direct comparison against the 5 functions that
--   DID get an explicit `revoke ... from anon` (024/025) and show no anon
--   grant at all: in this Supabase project, revoking from the PUBLIC
--   pseudo-role does not remove a grant Supabase's own schema-level
--   default privileges already made directly to the named anon role at
--   function-creation time -- only an explicit `revoke ... from anon`
--   removes that. Every affected function already independently enforces
--   is_coach()/is_trainee() (auth.uid() is null for an anon-key-only
--   request, so every one of those checks already fails closed today) --
--   this migration removes the redundant privilege as defense in depth,
--   it does not fix a working exploit.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 032_optional_workout_name.sql. Wrapped in a
-- single transaction so it applies entirely or not at all. Safe to rerun:
-- every function below is CREATE OR REPLACE with the exact same
-- signature, return type, and grants it already had; every REVOKE/GRANT
-- is idempotent on its own (Postgres does not error when revoking a
-- privilege a role doesn't currently hold, or re-granting one it already
-- has).
--
-- =====================================================================
-- Scope discipline
-- =====================================================================
-- Does NOT touch: migrations 001-032 (nothing in them is altered), any
-- table, column, constraint, trigger, index, or Storage bucket
-- configuration, any coach-facing policy or function, any RLS policy
-- text (every trainee-facing policy already routes through one of the
-- four functions patched in Part A below, so fixing those four is
-- sufficient -- no policy needs its own qual/with_check rewritten), any
-- existing row of data or media, any auth.users row, and no frontend
-- file (that is explicitly Stage 2, not this migration).
--
-- =====================================================================
-- Part A -- design: why patching four functions is enough
-- =====================================================================
-- Every trainee-facing RLS policy and RPC added since 022 resolves "who
-- is this trainee" through exactly one of two paths:
--   (a) public.trainee_get_auth_context() (022) -- called directly by
--       trainee_nutrition_logs/_progress_logs/_circumference_logs/
--       _progress_photos' trainee SELECT policies, trainee_notifications'
--       trainee SELECT policy, the coach-side exercise-submission-videos
--       trainee SELECT/DELETE policies, every trainee_log_*/trainee_delete_*
--       RPC (nutrition/progress/circumference), trainee_mark_notification_read(),
--       and (transitively) trainee_can_view_exercise_video() (029),
--       trainee_can_submit_exercise_video() and
--       trainee_can_access_submission_video() (030) -- which are in turn
--       what the exercise-videos and exercise-submission-videos Storage
--       policies, and the exercise-submission-videos trainee
--       INSERT/UPDATE table policies, call.
--   (b) A direct `trainees t ... where t.auth_user_id = auth.uid() and
--       public.is_trainee()` query inside a SECURITY DEFINER function
--       body (safe there -- unlike inside a plain RLS policy, see 022's
--       own revision note -- because the function itself runs as the
--       table owner, bypassing trainees' RLS entirely for that read).
--       Exactly three functions do this independently of (a):
--       trainee_get_own_profile() (021), trainee_get_active_training_program()
--       (023/027), and trainee_get_own_starting_circumferences() (025).
-- No RLS policy anywhere checks auth_user_id directly -- every one of
-- them was already forced onto path (a) by the RLS-self-reference bug
-- history documented across 021/022/028/029 (a raw `trainees` subquery
-- inside a policy body silently returns zero rows for every real
-- trainee, since the trainee role has no direct SELECT policy on
-- trainees). That means adding `and t.status = 'active'` to
-- trainee_get_auth_context() alone already closes path (a) everywhere it
-- is used -- covering nutrition, progress, measurements/circumferences,
-- progress photos (table + Storage), notifications, instructional-video
-- access, and performance-video access (table + Storage) -- and the
-- remaining three functions on path (b) need the identical one-line
-- addition applied directly, since none of them call (a).
--
-- Confirmed exhaustive: every trainee_*/foods_*_trainee/progress_photos_*_trainee
-- RLS policy and every trainee-facing RPC in 021-032 was re-read while
-- preparing this migration; none resolve trainee identity any way other
-- than (a) or (b) above. There is no fifth path to patch.
--
-- =====================================================================
-- Part A -- behavior before and after
-- =====================================================================
--   Active trainee (status = 'active', linked): no change whatsoever --
--   `and t.status = 'active'` is satisfied exactly as before, every
--   function/policy returns exactly what it always did.
--   Paused or archived trainee (linked, existing Supabase Auth session):
--   before this migration, every one of the read/write paths listed
--   above kept working normally after their coach paused/archived them.
--   After this migration, trainee_get_auth_context() returns zero rows
--   for that account on its very next call -- every RLS policy anchored
--   on it (via an `exists (select 1 from trainee_get_auth_context() ctx
--   where ...)` clause) now denies the row, every RPC anchored on it
--   (via `select trainee_id, coach_id into v_trainee_id, v_coach_id from
--   trainee_get_auth_context()`) now sees v_trainee_id as null and raises
--   the exact same "No trainee profile is linked to this account."
--   error every RPC already raises for a genuinely unlinked account -- no
--   new error message, no code path change, just a state that was
--   already handled now being reached correctly. trainee_get_own_profile(),
--   trainee_get_own_starting_circumferences(), and
--   trainee_get_active_training_program() likewise return zero rows /
--   null instead of the trainee's data. This takes effect on that
--   account's very next request -- there is no session to revoke and
--   nothing to wait for, since every one of these re-checks status live,
--   every time, rather than caching it.
--   Coach: entirely unaffected. Every coach-facing policy and function
--   checks `coach_id = auth.uid() and public.is_coach()` (plus, where
--   applicable, an ownership-chain EXISTS) -- none of them reference
--   trainee status, and none of them are touched by this migration. A
--   coach's access to a paused or archived trainee's historical data
--   (progress, nutrition, photos, programs, submitted videos) is
--   completely unchanged.
--   Invitations / account-linking: unaffected. coach_issue_trainee_invite(),
--   coach_cancel_trainee_invite(), coach_unlink_trainee_account(), and the
--   auth.users trigger function link_trainee_on_email_confirmed() (021)
--   never call trainee_get_auth_context() or check trainee status --
--   they are untouched by Part A entirely. A freshly invited/linked
--   trainee's status is 'active' by default (001_trainees.sql:
--   `status text not null default 'active'`), so a normal invite-accept
--   flow is unaffected by the new filter.
--
-- =====================================================================
-- Part B -- design and scope
-- =====================================================================
-- The 17 function signatures below are exactly the ones the live audit's
-- role_routine_grants query showed with grantee = 'anon'. Each is
-- confirmed NOT legitimately needed before login: every one of them
-- either (i) is itself gated by is_coach()/is_trainee() internally
-- (auth.uid() is null pre-login, so the check already fails closed), or
-- (ii) is a `returns trigger` function (handle_deleted_trainee_auth_user,
-- link_trainee_on_email_confirmed) that Postgres refuses to invoke as a
-- plain function call at all ("trigger functions can only be called as
-- triggers"), regardless of any EXECUTE grant. Nothing in this schema's
-- actual pre-login flow -- coach sign-in/sign-up (LoginView, unauthenticated
-- Supabase Auth calls only), trainee sign-in (TraineeLoginView, same), or
-- trainee join-by-invite (TraineeJoinView -> auth.signUp() with the
-- invite token in raw_user_meta_data, still just a Supabase Auth call) --
-- ever calls a public.* RPC as an anonymous user. Revoking anon's EXECUTE
-- on all 17 therefore breaks no pre-login flow.
--
-- No function body changes business behavior in Part B -- only privilege
-- grants change for the 14 signatures that need no Part A fix. For the
-- other 3 signatures that overlap with Part A (trainee_get_auth_context,
-- trainee_get_own_profile, trainee_get_active_training_program), the
-- grant restatement immediately follows that function's CREATE OR
-- REPLACE in Part A, rather than being repeated in Part B.
--
-- Every REVOKE/GRANT below states the exact parameter-type signature
-- (matching pg_get_function_identity_arguments exactly) -- Postgres
-- identifies a function by name AND parameter types, not name alone, so
-- an imprecise signature would either fail to match (silent no-op,
-- confirmed harmless since REVOKE on a non-matching signature simply
-- does nothing, but would leave the real function unfixed) or, worse,
-- accidentally match a different overload. There are no overloaded
-- function names in this schema today (031 explicitly dropped
-- coach_mark_submission_reviewed's old single-argument overload before
-- creating the two-argument version), so every signature below is
-- unambiguous.
--
-- =====================================================================
-- Rerun safety
-- =====================================================================
-- Every function in Part A uses CREATE OR REPLACE with the exact prior
-- signature and return type -- safe to rerun, and CREATE OR REPLACE
-- preserves whatever grants already exist even without the explicit
-- restatement below (the restatement is included purely so the intended
-- end state is self-evident from reading this file alone, matching the
-- convention 022_trainee_nutrition_access.sql and
-- 031_trainee_submission_coach_note.sql already established). Every
-- REVOKE/GRANT in Part B is independently idempotent.

begin;

-- =====================================================================
-- PART A -- enforce trainees.status = 'active' at the four functions
-- that resolve "which trainee is this" from auth.uid()
-- =====================================================================

-- A1. public.trainee_get_auth_context() -- the central helper. Adding
-- `and t.status = 'active'` here is what makes every trainee_id/coach_id
-- lookup anchored on this function (see the design note above) return no
-- rows at all for a paused or archived trainee, without touching any of
-- the policies or RPCs that call it.
create or replace function public.trainee_get_auth_context()
returns table (trainee_id uuid, coach_id uuid)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.id, t.coach_id
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_auth_context() from public;
revoke execute on function public.trainee_get_auth_context() from anon;
grant execute on function public.trainee_get_auth_context() to authenticated;

-- A2. public.trainee_get_own_profile() -- resolves identity independently
-- of trainee_get_auth_context() (021), so needs the same filter applied
-- directly. Column list, order, and every other condition are
-- byte-for-byte unchanged from 021.
create or replace function public.trainee_get_own_profile()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  start_date date,
  goal text,
  starting_weight numeric,
  target_weight numeric,
  status text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.id, t.full_name, t.email, t.phone, t.start_date, t.goal,
         t.starting_weight, t.target_weight, t.status
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_profile() from public;
revoke execute on function public.trainee_get_own_profile() from anon;
grant execute on function public.trainee_get_own_profile() to authenticated;

-- A3. public.trainee_get_own_starting_circumferences() -- same
-- independent-identity-resolution shape as A2 (025). This one already
-- had `revoke ... from anon` in its original migration (confirmed clean
-- in the live audit) -- restated here only for self-evidence, not
-- because it was broken.
create or replace function public.trainee_get_own_starting_circumferences()
returns table (
  starting_abdomen_cm numeric,
  starting_neck_cm numeric,
  starting_right_arm_cm numeric,
  starting_left_arm_cm numeric,
  starting_right_leg_cm numeric,
  starting_left_leg_cm numeric
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    t.starting_abdomen_cm,
    t.starting_neck_cm,
    t.starting_right_arm_cm,
    t.starting_left_arm_cm,
    t.starting_right_leg_cm,
    t.starting_left_leg_cm
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_starting_circumferences() from public;
revoke execute on function public.trainee_get_own_starting_circumferences() from anon;
grant execute on function public.trainee_get_own_starting_circumferences() to authenticated;

-- A4. public.trainee_get_active_training_program() -- same independent
-- shape (023, replaced by 027 to add video fields). `p.status = 'active'`
-- (the PROGRAM's own status) is a different column on a different table
-- and is left completely unchanged -- `t.status = 'active'` (the
-- TRAINEE's own status) is the new, additional condition. Every field
-- returned, every join, and every ordering/limit clause is byte-for-byte
-- unchanged from 027.
create or replace function public.trainee_get_active_training_program()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'notes', p.notes,
    'status', p.status,
    'workouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'notes', w.notes,
          'display_order', w.display_order,
          'exercises', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', e.id,
                'name', e.name,
                'sets', e.sets,
                'reps', e.reps,
                'weight_kg', e.weight_kg,
                'rest_seconds', e.rest_seconds,
                'notes', e.notes,
                'display_order', e.display_order,
                'video_storage_path', e.video_storage_path,
                'video_original_name', e.video_original_name,
                'video_mime_type', e.video_mime_type
              ) order by e.display_order, e.created_at
            )
            from public.trainee_workout_exercises e
            where e.workout_id = w.id
          ), '[]'::jsonb)
        ) order by w.display_order, w.created_at
      )
      from public.trainee_program_workouts w
      where w.program_id = p.id
    ), '[]'::jsonb)
  )
  from public.trainee_training_programs p
  join public.trainees t on t.id = p.trainee_id
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and public.is_trainee()
    and p.coach_id = t.coach_id
    and p.status = 'active'
  order by p.created_at desc
  limit 1;
$$;

revoke execute on function public.trainee_get_active_training_program() from public;
revoke execute on function public.trainee_get_active_training_program() from anon;
grant execute on function public.trainee_get_active_training_program() to authenticated;

-- =====================================================================
-- PART B -- revoke anon EXECUTE on the remaining 14 of the 17
-- live-confirmed function signatures (the other 3 are A1/A2/A4 above)
-- =====================================================================
-- No CREATE OR REPLACE in this section -- none of these 14 need a
-- business-logic change; only their grants change. Every one already had
-- `revoke execute on function ... from public` in its original
-- migration -- restated below for self-evidence, not because it was
-- found broken (only the anon grant was).

-- Coach invite/unlink RPCs (021) -- coach-only (is_coach()), never
-- called pre-login.
revoke execute on function public.coach_cancel_trainee_invite(uuid) from public;
revoke execute on function public.coach_cancel_trainee_invite(uuid) from anon;
grant execute on function public.coach_cancel_trainee_invite(uuid) to authenticated;

revoke execute on function public.coach_issue_trainee_invite(uuid) from public;
revoke execute on function public.coach_issue_trainee_invite(uuid) from anon;
grant execute on function public.coach_issue_trainee_invite(uuid) to authenticated;

revoke execute on function public.coach_unlink_trainee_account(uuid) from public;
revoke execute on function public.coach_unlink_trainee_account(uuid) from anon;
grant execute on function public.coach_unlink_trainee_account(uuid) to authenticated;

-- Coach submission-review RPC (031's two-argument version -- the only
-- one that exists; 031 already dropped the old one-argument overload).
revoke execute on function public.coach_mark_submission_reviewed(uuid, text) from public;
revoke execute on function public.coach_mark_submission_reviewed(uuid, text) from anon;
grant execute on function public.coach_mark_submission_reviewed(uuid, text) to authenticated;

-- Role helpers (021) -- evaluated under the CALLING role's own privileges
-- whenever they appear inside an RLS policy expression (RLS quals run as
-- the querying role, not as this function's security-definer owner), so
-- `authenticated` genuinely needs direct EXECUTE for coach/trainee RLS
-- to keep working -- only the anon grant is removed.
revoke execute on function public.is_coach() from public;
revoke execute on function public.is_coach() from anon;
grant execute on function public.is_coach() to authenticated;

revoke execute on function public.is_trainee() from public;
revoke execute on function public.is_trainee() from anon;
grant execute on function public.is_trainee() to authenticated;

-- auth.users trigger functions (021) -- `returns trigger`, so Postgres
-- refuses to invoke either one as a plain function call regardless of
-- any grant ("trigger functions can only be called as triggers"); no
-- authenticated grant ever existed or is added here, since nothing ever
-- calls these directly.
revoke execute on function public.handle_deleted_trainee_auth_user() from public;
revoke execute on function public.handle_deleted_trainee_auth_user() from anon;

revoke execute on function public.link_trainee_on_email_confirmed() from public;
revoke execute on function public.link_trainee_on_email_confirmed() from anon;

-- Video-access helpers (029, 030) -- called from inside Storage/table RLS
-- policy expressions (same caller-privilege reasoning as is_coach()/
-- is_trainee() above), so `authenticated` keeps EXECUTE; each already
-- resolves identity via trainee_get_auth_context() (A1), so pausing/
-- archiving a trainee is enforced automatically the moment A1 takes
-- effect -- no change to either function's body.
revoke execute on function public.trainee_can_view_exercise_video(text) from public;
revoke execute on function public.trainee_can_view_exercise_video(text) from anon;
grant execute on function public.trainee_can_view_exercise_video(text) to authenticated;

revoke execute on function public.trainee_can_submit_exercise_video(uuid) from public;
revoke execute on function public.trainee_can_submit_exercise_video(uuid) from anon;
grant execute on function public.trainee_can_submit_exercise_video(uuid) to authenticated;

revoke execute on function public.trainee_can_access_submission_video(text) from public;
revoke execute on function public.trainee_can_access_submission_video(text) from anon;
grant execute on function public.trainee_can_access_submission_video(text) to authenticated;

-- Trainee-facing nutrition/notification RPCs (022) -- called directly by
-- the trainee frontend; each already resolves identity via
-- trainee_get_auth_context() (A1), so no body change is needed here
-- either -- only the anon grant is removed.
revoke execute on function public.trainee_delete_nutrition_entry(uuid) from public;
revoke execute on function public.trainee_delete_nutrition_entry(uuid) from anon;
grant execute on function public.trainee_delete_nutrition_entry(uuid) to authenticated;

revoke execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date) from public;
revoke execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date) from anon;
grant execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date) to authenticated;

revoke execute on function public.trainee_mark_notification_read(uuid) from public;
revoke execute on function public.trainee_mark_notification_read(uuid) from anon;
grant execute on function public.trainee_mark_notification_read(uuid) to authenticated;

commit;

-- =====================================================================
-- Optional manual verification (advisory only -- nothing below runs
-- automatically; re-run these read-only checks from
-- supabase/audits/pre_pilot_security_verification.sql, section G2 and B4,
-- after applying this migration)
-- =====================================================================
-- 1. Re-run audit script section G2 -- trainee_get_auth_context,
--    trainee_get_own_profile, and trainee_get_own_starting_circumferences
--    should now all show filters_on_active_status = true (previously
--    false for all three).
-- 2. Re-run audit script section B4 (or the 17-signature spot check from
--    the live audit report) -- no row should show grantee = 'anon' for
--    any of the 17 functions listed in Part B above or replaced in Part A.
-- 3. As the existing active, linked trainee account in this pilot: sign
--    in and confirm the dashboard, nutrition log, progress log, active
--    training program, and notifications all still work exactly as
--    before -- this migration must be a complete no-op for that account.
-- 4. Optional, reversible check (do not leave in this state): as the
--    coach, temporarily set that same trainee's status to 'paused', sign
--    in as the trainee again and confirm the app now behaves as if no
--    trainee profile is linked (matching the existing "unlinked account"
--    error paths, not a new error), then set status back to 'active' as
--    the coach and confirm the trainee's access returns immediately on
--    their next request -- no re-invite, no re-link, no data loss.
