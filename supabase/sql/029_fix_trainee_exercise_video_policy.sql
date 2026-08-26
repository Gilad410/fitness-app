-- Fix Trainee Exercise Video Policy (take 2) -- 027 and 028 both denied a
-- trainee access to their own instructional video, for the same
-- underlying reason: their storage.objects SELECT policy queried
-- trainee-owned tables DIRECTLY from inside an RLS policy body, which
-- runs under the CALLING trainee's own (default-deny) privileges, not as
-- the table owner. Neither 027 nor 028 is modified (both already ran) --
-- this is a new, additive, corrective migration, same convention 022 and
-- 028 already used to correct a policy from an earlier, already-applied
-- migration.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 028_fix_trainee_exercise_video_access.sql.
-- Wrapped in a single transaction so it applies entirely or not at all.
-- Safe to rerun: the function uses CREATE OR REPLACE and the policy is
-- preceded by `drop policy if exists`.
--
-- =====================================================================
-- Why 027 and 028 both failed (confirmed by direct, live evidence)
-- =====================================================================
-- 027's policy joined public.trainees directly inside its EXISTS(...).
-- 028 removed that join, anchoring identity on
-- public.trainee_get_auth_context() instead -- correct as far as it
-- went -- but 028's EXISTS(...) still joined public.trainee_training_programs,
-- public.trainee_program_workouts, and public.trainee_workout_exercises
-- directly. Live, authenticated queries as the affected trainee proved
-- ALL FOUR tables (trainees, trainee_training_programs,
-- trainee_program_workouts, trainee_workout_exercises) return zero rows
-- for the trainee role on a plain SELECT -- not an error, a silent empty
-- result, because RLS default-denies access to every one of them for a
-- trainee (023_trainee_training_access.sql's own header comment confirms
-- this is deliberate: "No new RLS policy of any kind is added by this
-- migration, on any table" -- trainee_get_active_training_program() is
-- the ONLY sanctioned trainee read path for this data, precisely to avoid
-- needing "a second and third security-definer helper function" -- which
-- is exactly what 027/028 tried to substitute with plain joins instead).
-- So 028's EXISTS(...) chain still collapsed to zero rows at its very
-- first join (trainee_training_programs), for the identical structural
-- reason as 027 -- a different table, the same class of bug.
--
-- =====================================================================
-- The fix: one SECURITY DEFINER boolean helper, no direct table access
-- from the policy at all
-- =====================================================================
-- public.trainee_can_view_exercise_video(p_object_name text) performs
-- the ENTIRE ownership/path check itself, as a security definer function
-- -- so its internal reads of trainee_training_programs/
-- trainee_program_workouts/trainee_workout_exercises run as the function
-- OWNER (bypassing RLS for those three reads, same mechanism
-- trainee_get_active_training_program() (023/027) already relies on
-- successfully for these exact same tables), never as the calling
-- trainee. The storage.objects policy itself is reduced to three plain
-- boolean checks and one function call -- it never queries any table
-- directly again, so this specific failure mode is now structurally
-- impossible for this policy, not just fixed for today's data.
--
-- =====================================================================
-- What changes, precisely
-- =====================================================================
--   1. public.trainee_can_view_exercise_video(text) -- new function.
--   2. exercise_videos_select_own_trainee on storage.objects -- replaced
--      (same policy name, third revision) to call the new function
--      instead of joining any table directly.
-- Nothing else: no coach policy (exercise_videos_select_own / _insert_own
-- / _update_own / _delete_own, 027) is touched; no bucket setting, table,
-- column, constraint, trigger, existing RPC, or frontend file is touched;
-- no existing row is read, written, or otherwise affected.

begin;

-- =====================================================================
-- 1. public.trainee_can_view_exercise_video(p_object_name text)
-- =====================================================================
-- Returns true only if p_object_name is EXACTLY the Storage path of an
-- instructional video attached to a real exercise, inside a real workout,
-- inside the CALLING trainee's own CURRENTLY ACTIVE program, owned end to
-- end by one consistent coach -- false for every other input, including
-- null, a malformed path, a path for someone else's video, or a path for
-- an exercise whose program is no longer active. Never raises -- a
-- boolean SQL function with no exception path leaks nothing about *why*
-- a given input failed, by construction (not by convention).
--
-- security definer: this function's own reads of
-- trainee_training_programs/trainee_program_workouts/
-- trainee_workout_exercises run as the function owner, bypassing those
-- tables' RLS (which grants the trainee role no direct access at all --
-- see the header note above). This is the ONLY place in this policy that
-- ever touches those tables; the calling trainee's own privileges never
-- matter for those three reads, exactly like
-- trainee_get_active_training_program() (023/027).
--
-- Identity is obtained EXCLUSIVELY through
-- public.trainee_get_auth_context() (022) -- itself security definer,
-- anchored solely on auth.uid() -- never a raw subquery into
-- public.trainees, and never a parameter (a caller cannot pass in whose
-- video to check; only p_object_name, the thing being tested, is ever
-- accepted).
create or replace function public.trainee_can_view_exercise_video(p_object_name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    -- Reject null/empty input outright -- never let a null path reach
    -- the regex below (a null comparison would simply evaluate to
    -- unknown/false anyway, but this makes the rejection explicit).
    p_object_name is not null
    and p_object_name <> ''
    and public.is_trainee()
    and exists (
      select 1
      from public.trainee_get_auth_context() ctx
      join public.trainee_training_programs p
        on p.trainee_id = ctx.trainee_id
       and p.coach_id = ctx.coach_id
       and p.status = 'active'
      join public.trainee_program_workouts w
        on w.program_id = p.id
       and w.coach_id = p.coach_id
      join public.trainee_workout_exercises e
        on e.workout_id = w.id
       and e.coach_id = w.coach_id
      where p_object_name ~ (
        '^' || ctx.coach_id::text || '/' || ctx.trainee_id::text || '/' ||
        e.id::text || '\.(mp4|webm|mov)$'
      )
    );
$$;

-- No direct table SELECT grant is added anywhere by this migration --
-- trainee access to trainee_training_programs / trainee_program_workouts
-- / trainee_workout_exercises remains exactly what it was before this
-- file: none, other than through this function (and
-- trainee_get_active_training_program(), unchanged). Execute is narrowed
-- to authenticated only, matching every other trainee-facing helper in
-- this schema (is_coach/is_trainee, 021; trainee_get_auth_context, 022).
revoke execute on function public.trainee_can_view_exercise_video(text) from public;
grant execute on function public.trainee_can_view_exercise_video(text) to authenticated;

-- =====================================================================
-- 2. exercise_videos_select_own_trainee on storage.objects -- replaced
-- =====================================================================
-- Reduced to three plain checks plus one function call -- no join, no
-- direct table reference of any kind, so this policy cannot suffer the
-- 027/028 failure mode again regardless of how the underlying tables'
-- own RLS is ever configured in the future. storage.objects.name is
-- fully schema-qualified (not bare `name`) both to read unambiguously as
-- "the object row this policy is evaluating" and to avoid any repeat of
-- the earlier `ERROR: 42702: column reference "name" is ambiguous`
-- (027's original bug, in a different part of the same policy).
drop policy if exists exercise_videos_select_own_trainee on storage.objects;
create policy exercise_videos_select_own_trainee on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and public.is_trainee()
    and public.trainee_can_view_exercise_video(storage.objects.name)
  );

commit;
