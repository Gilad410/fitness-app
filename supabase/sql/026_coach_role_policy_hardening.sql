-- Coach Role Policy Hardening milestone -- adds an explicit
-- public.is_coach() check to every remaining coach-facing policy that was
-- missing it: the circumference-logs, progress-photos (table +
-- storage.objects), and training-programs/workouts/exercises families
-- (016_circumference_logs.sql / 017_progress_photos.sql /
-- 018_training_programs.sql).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 025_trainee_measurements_photos_access.sql.
-- Wrapped in a single transaction so it applies entirely or not at all.
-- Safe to rerun: every policy below is preceded by `drop policy if
-- exists`.
--
-- =====================================================================
-- Why this migration exists
-- =====================================================================
-- 021_trainee_auth_and_roles.sql's schema-wide audit (section 7) added an
-- explicit `and public.is_coach()` check to the coach policies on
-- trainees, foods, trainee_nutrition_logs, and trainee_progress_logs.
-- That audit's own text explains it left trainee_circumference_logs (016),
-- trainee_progress_photos + storage.objects (017), and
-- trainee_training_programs / trainee_program_workouts /
-- trainee_workout_exercises (018) untouched, reasoning that "a non-coach
-- can never create the trainees row these policies' EXISTS clauses depend
-- on" (since trainees_insert_own already requires is_coach()) -- true, but
-- only for CREATION. It does not cover REVOCATION: if a coach's role were
-- ever revoked (their public.user_roles row deleted or changed) while
-- their historical rows still carry their coach_id, every policy on these
-- six table families -- and the matching storage.objects policies -- would
-- still let that account read/write everything under that coach_id,
-- because none of them check is_coach() directly, only coach_id =
-- auth.uid() plus parent-row ownership.
--
-- There is no role-revocation feature anywhere in this app today -- this
-- migration closes the gap before any such feature is ever built, not in
-- response to a live incident or a reachable exploit.
--
-- =====================================================================
-- What changes, precisely
-- =====================================================================
-- Exactly one condition is added to every policy below: `and
-- public.is_coach()`, placed immediately after the existing `coach_id =
-- auth.uid()` check -- the exact same position 021 section 7 used for the
-- four policy families it already hardened. Every other condition (the
-- coach_id match itself, every parent-row ownership EXISTS clause, the
-- trainee_progress_photos storage_path prefix check, and every
-- storage.objects foldername/bucket_id check) is preserved byte-for-byte
-- from 016/017/018 -- nothing is removed, loosened, or reworded.
--
-- `to authenticated` is also added explicitly to every policy below.
-- 016/017/018 predate that convention (introduced in
-- 024_trainee_progress_access.sql / 025_trainee_measurements_photos_access.sql);
-- adding it now only narrows which role Postgres even evaluates the
-- policy for -- it cannot broaden access, since anon already fails
-- coach_id = auth.uid() (auth.uid() is null for anon) and would now also
-- fail is_coach() regardless.
--
-- Nothing else changes: no table, column, constraint, trigger, or function
-- is touched; the 'progress-photos' Storage bucket's own configuration
-- (private, size limit, MIME allowlist) is untouched; every trainee-facing
-- policy and RPC (021 section 8, 022, 023, 024, 025) is completely
-- unmodified; no frontend file, router entry, or database row is touched.
--
-- =====================================================================
-- Why a currently-valid coach's access is unchanged
-- =====================================================================
-- An authenticated coach has a row in public.user_roles with role =
-- 'coach' (021), so public.is_coach() (021, unmodified by this file)
-- evaluates to true for every request they make. Adding `and
-- public.is_coach()` to a policy a valid coach already satisfies is a
-- no-op for them: the AND can only ever remove access from someone the
-- original condition alone would have wrongly allowed -- it can never
-- remove access from a real coach acting on their own data.
--
-- =====================================================================
-- Why a revoked coach's access is now correctly removed
-- =====================================================================
-- If a coach's row in public.user_roles is ever deleted, or its role
-- changed away from 'coach', public.is_coach() immediately evaluates to
-- false for that account on every subsequent request -- regardless of
-- what coach_id value their historical rows still carry. Every policy
-- below now fails on that condition alone, before the EXISTS
-- ownership/parent-row check is even reached.

begin;

-- =====================================================================
-- 1. trainee_circumference_logs (016_circumference_logs.sql)
-- =====================================================================
drop policy if exists trainee_circumference_logs_select_own on public.trainee_circumference_logs;
create policy trainee_circumference_logs_select_own on public.trainee_circumference_logs
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_circumference_logs_insert_own on public.trainee_circumference_logs;
create policy trainee_circumference_logs_insert_own on public.trainee_circumference_logs
  for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_circumference_logs_delete_own on public.trainee_circumference_logs;
create policy trainee_circumference_logs_delete_own on public.trainee_circumference_logs
  for delete
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy exists on this table (append-only, 016) -- nothing to harden.

-- =====================================================================
-- 2. trainee_progress_photos (017_progress_photos.sql)
-- =====================================================================
drop policy if exists trainee_progress_photos_select_own on public.trainee_progress_photos;
create policy trainee_progress_photos_select_own on public.trainee_progress_photos
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- storage_path prefix check preserved exactly, unchanged, from 017.
drop policy if exists trainee_progress_photos_insert_own on public.trainee_progress_photos;
create policy trainee_progress_photos_insert_own on public.trainee_progress_photos
  for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
    and storage_path like (coach_id::text || '/' || trainee_id::text || '/%')
  );

drop policy if exists trainee_progress_photos_delete_own on public.trainee_progress_photos;
create policy trainee_progress_photos_delete_own on public.trainee_progress_photos
  for delete
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_progress_photos.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy exists on this table (delete + re-upload, 017) -- nothing to harden.

-- =====================================================================
-- 3. storage.objects, bucket 'progress-photos' -- coach policies (017)
-- =====================================================================
-- Bucket configuration (private, size limit, MIME allowlist) is untouched
-- by this file. (storage.foldername(name))[1] = auth.uid()::text and the
-- trainees ownership EXISTS clause are preserved exactly, unchanged, from
-- 017 -- only `bucket_id = 'progress-photos' and public.is_coach()` is
-- added ahead of them.
drop policy if exists progress_photos_select_own on storage.objects;
create policy progress_photos_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists progress_photos_insert_own on storage.objects;
create policy progress_photos_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists progress_photos_delete_own on storage.objects;
create policy progress_photos_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy on storage.objects (017) -- nothing to harden.

-- =====================================================================
-- 4. trainee_training_programs (018_training_programs.sql)
-- =====================================================================
drop policy if exists trainee_training_programs_select_own on public.trainee_training_programs;
create policy trainee_training_programs_select_own on public.trainee_training_programs
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_training_programs_insert_own on public.trainee_training_programs;
create policy trainee_training_programs_insert_own on public.trainee_training_programs
  for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_training_programs_update_own on public.trainee_training_programs;
create policy trainee_training_programs_update_own on public.trainee_training_programs
  for update
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_training_programs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No delete policy on this table (archived via status, 018) -- nothing to harden.

-- =====================================================================
-- 5. trainee_program_workouts (018_training_programs.sql)
-- =====================================================================
drop policy if exists trainee_program_workouts_select_own on public.trainee_program_workouts;
create policy trainee_program_workouts_select_own on public.trainee_program_workouts
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_program_workouts_insert_own on public.trainee_program_workouts;
create policy trainee_program_workouts_insert_own on public.trainee_program_workouts
  for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_program_workouts_update_own on public.trainee_program_workouts;
create policy trainee_program_workouts_update_own on public.trainee_program_workouts
  for update
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_program_workouts_delete_own on public.trainee_program_workouts;
create policy trainee_program_workouts_delete_own on public.trainee_program_workouts
  for delete
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_training_programs
      where trainee_training_programs.id = trainee_program_workouts.program_id
        and trainee_training_programs.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 6. trainee_workout_exercises (018_training_programs.sql)
-- =====================================================================
drop policy if exists trainee_workout_exercises_select_own on public.trainee_workout_exercises;
create policy trainee_workout_exercises_select_own on public.trainee_workout_exercises
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_workout_exercises_insert_own on public.trainee_workout_exercises;
create policy trainee_workout_exercises_insert_own on public.trainee_workout_exercises
  for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_workout_exercises_update_own on public.trainee_workout_exercises;
create policy trainee_workout_exercises_update_own on public.trainee_workout_exercises
  for update
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

drop policy if exists trainee_workout_exercises_delete_own on public.trainee_workout_exercises;
create policy trainee_workout_exercises_delete_own on public.trainee_workout_exercises
  for delete
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainee_program_workouts
      where trainee_program_workouts.id = trainee_workout_exercises.workout_id
        and trainee_program_workouts.coach_id = auth.uid()
    )
  );

commit;

-- =====================================================================
-- Optional manual verification (advisory only -- none of this runs
-- automatically; nothing below is executed by this file)
-- =====================================================================
-- 1. Valid coach, unchanged access: as the existing coach account, in the
--    app or the SQL editor, `select public.is_coach();` should return
--    true, and every read/write this migration touches (circumference
--    logs, progress photos + their files, training programs/workouts/
--    exercises) should keep working exactly as before.
-- 2. Revoked coach, access removed: there is no role-revocation feature
--    to exercise this through today. It can be checked directly in SQL,
--    as the project owner, but only if you explicitly want to: temporarily
--    `delete from public.user_roles where user_id = '<coach auth uid>' and
--    role = 'coach';`, confirm the affected policies now deny access for
--    that account, then restore it with `insert into public.user_roles
--    (user_id, role) values ('<coach auth uid>', 'coach');`. Do not run
--    this against the real coach account without deciding to -- it is a
--    real, if reversible, access change, not a read-only check.
