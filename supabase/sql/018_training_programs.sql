-- Training Programs milestone -- lets a coach build a structured training
-- program per trainee: a program contains multiple workouts, each workout
-- contains multiple exercises, both reorderable.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 017_progress_photos.sql.
--
-- Purely additive: three new tables, no existing table/column/policy is
-- touched. No existing data is affected.
--
-- Ownership model (three levels deep):
--   trainees (existing) -> trainee_training_programs -> trainee_program_workouts -> trainee_workout_exercises
-- Every table carries its own coach_id (denormalized, same convention as
-- every other coach-owned table in this schema) AND its RLS policies
-- re-verify ownership against the immediate parent row on every operation
-- -- coach_id alone is never sufficient, matching the documented reasoning
-- in 016_circumference_logs.sql / 017_progress_photos.sql: a row's own
-- coach_id doesn't stop a coach from pointing it at a *parent* row that
-- isn't actually theirs, since a foreign key only requires the parent to
-- exist, not that it's owned by the same coach. That gap is closed here at
-- every level, not just the top one.
--
-- Editable vs. append-only: unlike the trainee_progress_logs /
-- trainee_circumference_logs / trainee_nutrition_logs family (append-only
-- history, delete + re-add for corrections, no update policy), programs/
-- workouts/exercises are live structured content the coach edits in place
-- (rename, reorder, tweak sets/reps) -- so all three tables get real
-- update policies, matching the public.trainees / public.foods
-- convention instead of the logs convention.
--
-- Delete semantics differ by level, deliberately:
--   * trainee_training_programs: NO delete policy. A program is archived
--     via status = 'inactive', never hard-deleted -- same "protect
--     history, archive don't delete" convention as public.trainees
--     (status column) and public.foods (archived_at). This also means a
--     program can never vanish out from under its workouts/exercises.
--   * trainee_program_workouts / trainee_workout_exercises: DO have a
--     delete policy. The feature explicitly requires removing individual
--     workouts/exercises, and nothing else in the schema references them
--     (no execution/completion log exists yet), so a hard delete here is
--     safe today. If a future milestone logs actual workout sessions
--     against specific exercises, that new table should use
--     `on delete restrict` back to trainee_workout_exercises (the same
--     pattern trainee_nutrition_logs uses against foods) rather than
--     changing anything here.

-- =====================================================================
-- 1. trainee_training_programs -- one row per program.
-- =====================================================================
create table public.trainee_training_programs (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainee_training_programs_trainee_id_idx
  on public.trainee_training_programs (trainee_id, created_at desc);

create index trainee_training_programs_coach_id_idx
  on public.trainee_training_programs (coach_id);

-- updated_at trigger, same shape as public.set_trainees_updated_at
-- (001_trainees.sql) -- one function per table, matching that existing
-- per-table convention rather than introducing a shared/generic one.
create function public.set_training_programs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_training_programs_set_updated_at
  before update on public.trainee_training_programs
  for each row
  execute function public.set_training_programs_updated_at();

alter table public.trainee_training_programs enable row level security;

-- Every policy verifies coach_id = auth.uid() AND that trainee_id still
-- belongs to that same coach, closing the "coach_id alone" gap described
-- above (same shape as trainee_circumference_logs' policies).
create policy trainee_training_programs_select_own on public.trainee_training_programs
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_training_programs_insert_own on public.trainee_training_programs
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_training_programs_update_own on public.trainee_training_programs
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No delete policy -- see "Delete semantics differ by level" above.
-- Deactivate via status = 'inactive' instead.

-- =====================================================================
-- 2. trainee_program_workouts -- one row per workout within a program.
-- =====================================================================
create table public.trainee_program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.trainee_training_programs(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ordered lookup within a program is the only access pattern this table
-- needs; no separate coach_id index since workouts are always fetched
-- through a specific program, never listed across a whole coach directly.
create index trainee_program_workouts_program_id_idx
  on public.trainee_program_workouts (program_id, display_order);

create function public.set_program_workouts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_program_workouts_set_updated_at
  before update on public.trainee_program_workouts
  for each row
  execute function public.set_program_workouts_updated_at();

alter table public.trainee_program_workouts enable row level security;

-- Ownership check climbs one level: coach_id = auth.uid() AND the
-- referenced program is actually owned by that same coach. This does not
-- need to re-check trainees itself -- trainee_training_programs' own
-- policies already guarantee every row it holds is legitimately owned,
-- so verifying against it is sufficient and avoids a 3-way join here.
create policy trainee_program_workouts_select_own on public.trainee_program_workouts
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

create policy trainee_program_workouts_insert_own on public.trainee_program_workouts
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

create policy trainee_program_workouts_update_own on public.trainee_program_workouts
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

create policy trainee_program_workouts_delete_own on public.trainee_program_workouts
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 3. trainee_workout_exercises -- one row per exercise within a workout.
-- =====================================================================
create table public.trainee_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.trainee_program_workouts(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sets integer not null check (sets > 0),
  -- Free text, not an integer: coaches routinely prescribe ranges ("8-12"),
  -- failure-based reps ("עד כשל"), or time-based reps ("30 שניות") rather
  -- than a single fixed number. Still required and non-empty -- every
  -- exercise needs *some* rep prescription, just not a rigid numeric one.
  reps text not null check (char_length(trim(reps)) > 0),
  weight_kg numeric(6, 1) check (weight_kg is null or weight_kg > 0),
  rest_seconds integer check (rest_seconds is null or rest_seconds > 0),
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainee_workout_exercises_workout_id_idx
  on public.trainee_workout_exercises (workout_id, display_order);

create function public.set_workout_exercises_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_workout_exercises_set_updated_at
  before update on public.trainee_workout_exercises
  for each row
  execute function public.set_workout_exercises_updated_at();

alter table public.trainee_workout_exercises enable row level security;

-- Same one-level-up ownership check, against trainee_program_workouts.
create policy trainee_workout_exercises_select_own on public.trainee_workout_exercises
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

create policy trainee_workout_exercises_insert_own on public.trainee_workout_exercises
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

create policy trainee_workout_exercises_update_own on public.trainee_workout_exercises
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

create policy trainee_workout_exercises_delete_own on public.trainee_workout_exercises
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

-- No storage, no seed data, no changes to any existing table in this
-- migration.
