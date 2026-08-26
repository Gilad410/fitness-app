-- Fix Trainee Exercise Video Access -- corrects a single defective RLS
-- policy from 027_exercise_instructional_videos.sql:
-- exercise_videos_select_own_trainee on storage.objects. 027 itself is
-- NOT modified (it already ran successfully) -- this is a new, additive,
-- corrective migration, same convention 022 used to correct a policy from
-- an already-applied 021 (see 022's own "Revision note" header).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 027_exercise_instructional_videos.sql. Wrapped
-- in a single transaction so it applies entirely or not at all. Safe to
-- rerun: the policy is preceded by `drop policy if exists`.
--
-- =====================================================================
-- The bug being fixed (confirmed by direct, live evidence -- not a
-- hypothesis)
-- =====================================================================
-- 027's exercise_videos_select_own_trainee joined public.trainees a
-- SECOND time after already resolving the caller's identity through
-- public.trainee_get_auth_context() (022):
--
--   from public.trainee_get_auth_context() ctx
--   join public.trainees t
--     on t.id = ctx.trainee_id
--    and t.coach_id = ctx.coach_id
--   join public.trainee_training_programs p
--     on p.trainee_id = t.id
--     ...
--
-- trainee_get_auth_context() is security definer and already resolves
-- ctx.trainee_id/ctx.coach_id safely, bypassing trainees' RLS internally.
-- But `join public.trainees t` is a PLAIN, non-security-definer reference
-- to public.trainees, evaluated under the CALLING trainee's own RLS. No
-- policy anywhere in this schema grants the trainee role any SELECT
-- access to public.trainees at all (021/022, deliberate -- trainees
-- carries the coach's private `notes` and invite-token columns). Verified
-- directly, live, as the affected trainee:
--   select * from public.trainees;  ->  0 rows, no error.
-- That single join therefore returns zero rows unconditionally for every
-- trainee, on every call, making the entire EXISTS(...) always false --
-- regardless of ctx/program/workout/exercise all being correct. This is
-- the exact RLS self-reference failure mode 022's own revision note
-- documents for a prior policy (021's original
-- trainee_notifications_select_own_trainee) -- 027's own header comment
-- even explicitly says a raw public.trainees subquery must be avoided
-- "for exactly [that] reason", while the policy body itself did it
-- anyway.
--
-- Every OTHER trainee-facing policy in this schema already avoids this:
-- 022's trainee_nutrition_logs_select_own_trainee / foods_select_own_trainee,
-- and -- the direct precedent, also on storage.objects --
-- 025's progress_photos_select_own_trainee, all call
-- trainee_get_auth_context() exactly once and compare its OUTPUT columns
-- (ctx.trainee_id / ctx.coach_id) directly against the target row/path,
-- never re-touching public.trainees afterward.
--
-- =====================================================================
-- The fix
-- =====================================================================
-- Drop the one defective policy and recreate it anchored directly on
-- ctx.trainee_id / ctx.coach_id -- exactly 025's proven convention --
-- instead of re-deriving those same values through a second, RLS-blocked
-- join to public.trainees. Every other check from 027 is preserved
-- byte-for-byte: public.is_trainee(), the program's status = 'active'
-- filter (matching public.trainee_get_active_training_program()'s own
-- scope), full coach_id re-verification at every level (program ->
-- workout -> exercise), and the exact
-- {coach_id}/{trainee_id}/{exercise_id}.{mp4|webm|mov} path regex.
--
-- The object name reference inside the EXISTS subquery is qualified as
-- `objects.name` (not bare `name`) for the same reason
-- 027_exercise_instructional_videos.sql's own corrected version already
-- documents: trainee_training_programs / trainee_program_workouts /
-- trainee_workout_exercises (all joined here) each have their own `name`
-- column (program/workout/exercise display name), so an unqualified
-- `name` inside this subquery would again raise
-- `ERROR: 42702: column reference "name" is ambiguous`. `objects.name`
-- unambiguously refers to the storage.objects row this policy is
-- evaluating -- CREATE POLICY ... ON storage.objects makes the table's
-- own bare relation name ("objects") its implicit correlation name, no
-- alias declaration needed.
--
-- =====================================================================
-- Nothing else changes
-- =====================================================================
-- No coach policy (exercise_videos_select_own / _insert_own / _update_own
-- / _delete_own, 027) is touched. No bucket setting, table, column,
-- constraint, trigger, RPC, or frontend file is touched. No existing row
-- is read, written, or otherwise affected -- this migration only replaces
-- one RLS policy's definition.

begin;

drop policy if exists exercise_videos_select_own_trainee on storage.objects;
create policy exercise_videos_select_own_trainee on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exercise-videos'
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
      where objects.name ~ (
        '^' || ctx.coach_id::text || '/' || ctx.trainee_id::text || '/' ||
        e.id::text || '\.(mp4|webm|mov)$'
      )
    )
  );

commit;
