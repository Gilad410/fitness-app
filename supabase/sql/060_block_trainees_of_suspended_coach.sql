-- Block a suspended coach's trainees from their own self-service portal,
-- and restore their access automatically the moment the coach is
-- reactivated -- requested directly by the product owner after
-- confirming (by reading 056_owner_coach_administration.sql and
-- clearCoachDataCaches.js's own comment) that suspending a coach today
-- leaves every one of their trainees completely unaffected. That was a
-- deliberate choice at the time 056 shipped (clearCoachDataCaches.js:
-- "a suspended coach's trainees must keep their own access ... completely
-- unaffected"), made before the owner/coach-suspension feature had a
-- concrete trainee-facing requirement attached to it. This migration
-- supersedes that choice: it was correct for its own milestone, not for
-- this one.
--
-- WHERE THIS BELONGS, AND WHY IT IS FOUR FUNCTIONS, NOT ONE. The first
-- draft of this migration touched only public.trainee_get_auth_context()
-- (021/033), on the (correct, but incomplete) understanding that it is
-- "the one function virtually every trainee-facing RLS policy and RPC is
-- built on top of" (033's own words). A full audit of every
-- security-definer function that independently resolves
-- `t.auth_user_id = auth.uid()` against public.trainees -- rather than
-- calling trainee_get_auth_context() -- found three more that 033 itself
-- had to special-case for the exact same reason when it added the
-- trainee's own `t.status = 'active'` check (033's comments on A2/A3/A4
-- say so explicitly: "resolves identity independently of
-- trainee_get_auth_context()..., so needs the same filter applied
-- directly"). Left unpatched, these three would have kept serving a
-- suspended coach's trainee their profile, starting measurements, and
-- entire active training program (workouts, exercises, instructional
-- video paths) even after this migration shipped -- a real gap, not a
-- theoretical one, since trainee_get_active_training_program() backs the
-- trainee's own training screen directly.
--
--   1. trainee_get_auth_context()               (021/033) -- the central
--      helper; every RLS POLICY (nutrition/progress/circumference/
--      photos/notifications/plans/custom-foods/storage objects) and every
--      other RPC in the schema resolves identity through this one, so
--      fixing it alone already covers all of those transitively.
--   2. trainee_get_own_profile()                 (021/033)
--   3. trainee_get_own_starting_circumferences()  (025/033)
--   4. trainee_get_active_training_program()      (023/027/033)
--
-- Confirmed by grepping every supabase/sql/*.sql file in this repo for
-- `auth_user_id = auth.uid()` and cross-checking, for each hit, which
-- migration holds that function's LAST `create or replace` (so a
-- superseded body, e.g. 021's original trainee_get_own_profile() before
-- 033 replaced it, is correctly ignored): no fifth function remains.
-- trainee_mark_notification_read() looked like a candidate (it has this
-- same shape in 021) but its live body was replaced by 022 to call
-- trainee_get_auth_context() instead -- already covered by function 1.
--
-- WHY A JOIN, NOT A WRITE. None of the four touches trainees.status (the
-- per-trainee active/paused/archived field a coach sets individually,
-- e.g. 033's Finding 1). Suspending a coach must not silently overwrite
-- or lose which of their trainees were already paused/archived on their
-- own merits -- and reactivating the coach must restore exactly the set
-- of trainees who were 'active' before the suspension, no more and no
-- less. A stateless join on the coach's current access_status gives
-- both for free: block the instant access_status leaves 'active', un-
-- block the instant it returns to 'active', with nothing to reconcile
-- either way.
--
-- SYMMETRY WITH is_coach(). Matches public.is_coach()'s own condition
-- (056) exactly -- an equality check against 'active', not merely
-- excluding the 'suspended' value -- so a coach set to 'pending'
-- (owner_set_coach_status accepts it as a target status, even though
-- today's OwnerCoachesView.vue UI only offers active/suspended) blocks
-- their trainees too, not just an explicit suspension.
--
-- WHAT THIS DOES NOT CHANGE. public.coaches has no SELECT policy granted
-- to the trainee role (056 section 2: owner-only), but all four functions
-- below are SECURITY DEFINER and none selects a column from
-- public.coaches, so this adds a server-side existence/status check
-- only -- nothing new is exposed to the trainee. Every column list,
-- join, filter, and ordering clause below is otherwise byte-for-byte
-- unchanged from each function's current (033) body. The client-side
-- router guard (src/router/index.js) and its stale-while-revalidate
-- cache (src/lib/accessCheckCache.js) are both unchanged: they already
-- re-run trainee_get_auth_context() on every trainee-route navigation
-- and already treat "no rows" as "sign the trainee out", so a suspended
-- coach's trainee is signed out on their very next navigation (within
-- the cache's existing freshness window) with no frontend change needed
-- -- and real data access (every RLS-guarded table/RPC) is blocked
-- immediately regardless of that client-side cache, since Postgres
-- itself re-evaluates every one of these functions on every request.
--
-- KNOWN, DELIBERATELY UNCHANGED EDGE CASE. A trainee who clicks an
-- already-issued invite link for a coach suspended in the meantime can
-- still complete email confirmation and get linked --
-- link_trainee_on_email_confirmed() (021) validates the invite token
-- against public.trainees only and does not check the coach's
-- access_status. They are then immediately blocked by all four functions
-- below on their very first real screen, same as any other trainee of
-- that coach -- not a security gap, only a UX rough edge (a brand-new
-- "welcome" flow that dead-ends immediately). Left alone here, as
-- requested, to keep this change scoped to the suspension behavior only
-- and not touch the existing invite-acceptance flow.

begin;

-- 1. The central helper -- every RLS policy and every other RPC in the
-- schema resolves identity through this one (see header above).
create or replace function public.trainee_get_auth_context()
returns table (trainee_id uuid, coach_id uuid)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.id, t.coach_id
  from public.trainees t
  join public.coaches c on c.user_id = t.coach_id
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and c.access_status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_auth_context() from public;
revoke execute on function public.trainee_get_auth_context() from anon;
grant execute on function public.trainee_get_auth_context() to authenticated;

-- 2. Own profile (name/email/phone/goal/weights/status) -- backs the
-- trainee home screen and measurements screen. Column list, order, and
-- every other condition unchanged from 033.
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
  join public.coaches c on c.user_id = t.coach_id
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and c.access_status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_profile() from public;
revoke execute on function public.trainee_get_own_profile() from anon;
grant execute on function public.trainee_get_own_profile() to authenticated;

-- 3. Own starting circumferences -- backs the measurements screen.
-- Column list, order, and every other condition unchanged from 033.
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
  join public.coaches c on c.user_id = t.coach_id
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and c.access_status = 'active'
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_starting_circumferences() from public;
revoke execute on function public.trainee_get_own_starting_circumferences() from anon;
grant execute on function public.trainee_get_own_starting_circumferences() to authenticated;

-- 4. Active training program (workouts, exercises, instructional video
-- paths) -- backs the trainee's own training screen directly. Every
-- field returned, every join, and every ordering/limit clause is
-- byte-for-byte unchanged from 033 except the one added join/condition
-- below (p.status = 'active', the PROGRAM's own status, is a different
-- column on a different table and is left untouched).
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
  join public.coaches c on c.user_id = t.coach_id
  where t.auth_user_id = auth.uid()
    and t.status = 'active'
    and c.access_status = 'active'
    and public.is_trainee()
    and p.coach_id = t.coach_id
    and p.status = 'active'
  order by p.created_at desc
  limit 1;
$$;

revoke execute on function public.trainee_get_active_training_program() from public;
revoke execute on function public.trainee_get_active_training_program() from anon;
grant execute on function public.trainee_get_active_training_program() to authenticated;

-- Every signature is unchanged from 033 -- no caller anywhere in the
-- schema (RLS policy, RPC, or frontend code) needs to change.

commit;
