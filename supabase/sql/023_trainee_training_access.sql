-- Trainee Training Program Access milestone -- lets a trainee read their
-- own active training program (018_training_programs.sql: program ->
-- workouts -> exercises), in saved order, read-only.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 022_trainee_nutrition_access.sql. Wrapped in a
-- single transaction so it applies entirely or not at all.
--
-- Purely additive and safe for existing data: no column, constraint,
-- trigger, or existing policy/table is touched, and no existing row is
-- read, written, or otherwise affected. Exactly one new object is added.
--
-- =====================================================================
-- Design: one security-definer RPC, no new RLS policies
-- =====================================================================
-- trainee_training_programs HAS trainee_id/coach_id directly, so a plain
-- trainee-facing SELECT policy on it (anchored on
-- public.trainee_get_auth_context(), 022_trainee_nutrition_access.sql)
-- would be safe on its own. But trainee_program_workouts and
-- trainee_workout_exercises have NO trainee_id column at all -- their
-- coach-side policies (018) climb ownership by subquerying the parent
-- table under the CALLER's own privileges. Giving the trainee role a
-- workable policy at those two levels would mean either (a) a raw
-- subquery into trainee_training_programs, which only works if that table
-- also already has a trainee-facing policy in place -- coupling one new
-- policy's correctness to another's existence and to the fact that both
-- happen to line up, or (b) a second and third security-definer helper
-- function, one per level, each independently re-deriving ownership.
--
-- Both of those add real surface area to get exactly right, in a schema
-- where this project has already hit the same underlying failure mode
-- twice: a raw RLS policy subquery against a table with no matching
-- policy for the querying role silently returns zero rows, because RLS
-- applies to that subquery too (021's original trainee_notifications
-- policy against public.trainees; the first draft of 022's trainee
-- policies against the same table -- both corrected in 022_trainee_nutrition_access.sql).
--
-- Instead, this migration adds exactly one function,
-- trainee_get_active_training_program(), that does the ownership check
-- ONCE (trainees.auth_user_id = auth.uid(), joined to
-- trainee_training_programs, filtered to status = 'active') and then
-- reads trainee_program_workouts / trainee_workout_exercises directly as
-- the function owner (security definer bypasses RLS entirely for those
-- reads) -- not through any policy, so there is nothing for those reads
-- to depend on, no ordering concern between objects, and no way for this
-- to silently regress if a coach-side policy ever changes shape. No new
-- RLS policy of any kind is added by this migration, on any table.
--
-- The function returns one jsonb value, hand-built field by field
-- (jsonb_build_object / jsonb_agg) -- an explicit column allowlist, not
-- `select *`, so coach_id/trainee_id and anything not named below can
-- never leak through this path, now or if the underlying tables grow new
-- columns later. It contains a single read-only SQL SELECT -- no
-- INSERT/UPDATE/DELETE capability exists anywhere in it, so "read-only"
-- is a structural property of the function, not a policy someone could
-- misconfigure.
--
-- Notes included (per explicit approval): trainee_training_programs.notes,
-- trainee_program_workouts.notes, trainee_workout_exercises.notes --
-- instructional content for whoever runs the program, matching what the
-- coach's own WorkoutsSection.vue/ExercisesSection.vue already display.
-- trainees.notes (private coach commentary about the trainee, already
-- excluded from trainee_get_own_profile() by 021) is never referenced
-- anywhere in this file, and no other trainee's data is reachable: the
-- WHERE clause is anchored solely on the caller's own auth.uid().

begin;

-- =====================================================================
-- trainee_get_active_training_program() -- the only new object.
-- =====================================================================
-- Returns a single trainee's own current active program, nested with its
-- workouts and each workout's exercises, in saved (display_order) order --
-- or sql null if the caller has no linked trainee row, isn't a trainee,
-- or that trainee has no active program. If more than one program is
-- somehow marked 'active' for the same trainee (nothing in 018 prevents
-- that; it's a coach-side data-shape question, not something this
-- read-only migration changes), the most recently created one is
-- returned -- `limit 1` on a deterministic `order by created_at desc`.
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
                'display_order', e.display_order
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
    and public.is_trainee()
    -- Defense-in-depth full-row-consistency, same posture 022 applied
    -- throughout: p.trainee_id = t.id already uniquely identifies "my own
    -- program" on its own (t is resolved solely from auth.uid()), but
    -- this additionally guards against a data-integrity anomaly where a
    -- program's coach_id doesn't match its own trainee's coach_id.
    and p.coach_id = t.coach_id
    and p.status = 'active'
  order by p.created_at desc
  limit 1;
$$;

revoke execute on function public.trainee_get_active_training_program() from public;
grant execute on function public.trainee_get_active_training_program() to authenticated;

commit;
