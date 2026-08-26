-- Exercise Instructional Videos milestone -- lets a coach attach one
-- instructional video to an exercise (public.trainee_workout_exercises),
-- privately stored, and lets the owning trainee view it read-only.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 026_coach_role_policy_hardening.sql. Wrapped in
-- a single transaction so it applies entirely or not at all. Every
-- statement below is written to be safely rerunnable (see "Rerun safety"
-- at the end of this header) in case this file is executed more than once.
--
-- =====================================================================
-- What this migration does, precisely
-- =====================================================================
--   1. Adds three nullable columns to the existing
--      public.trainee_workout_exercises table: video_storage_path,
--      video_original_name, video_mime_type. No default, no NOT NULL --
--      every existing row already has all three as null, which is a
--      fully valid "no video attached" state. Nothing else about that
--      table (its columns, checks, triggers, indexes, or its four
--      existing coach RLS policies from 018_training_programs.sql) is
--      touched.
--   2. Adds one CHECK constraint requiring the three new columns to be
--      either all null or all set together -- a partially-filled video
--      reference (e.g. a path with no mime type) can never be stored.
--   3. Creates one new private Storage bucket, 'exercise-videos', with a
--      50 MB per-file limit and an allowlist of three browser-playable
--      video MIME types.
--   4. Adds five new storage.objects RLS policies scoped to that bucket
--      only (four coach, one trainee) -- see "Storage RLS design" below.
--      No existing storage.objects policy (progress-photos' six, from
--      017/025/026) is touched; Postgres evaluates bucket-scoped policies
--      independently, so this cannot affect any other bucket.
--   5. Replaces public.trainee_get_active_training_program() (023) to
--      also return the three new fields per exercise, alongside every
--      field it already returned, with the same signature, grants, and
--      authorization checks -- see "RPC change" below.
--
-- Purely additive otherwise: no other table, column, constraint, trigger,
-- function, or policy anywhere in the schema is touched. No existing row
-- (in trainee_workout_exercises or anywhere else) is read, written, or
-- otherwise affected by running this file.
--
-- =====================================================================
-- Path structure and why it is never trusted by itself
-- =====================================================================
-- Every video object is stored at exactly:
--   {coach_id}/{trainee_id}/{trainee_workout_exercises.id}.{ext}
-- ext is one of mp4 / webm / mov, matching the bucket's allowed MIME
-- types (video/mp4, video/webm, video/quicktime respectively).
--
-- This looks like the same folder-prefix convention progress-photos uses
-- (017/025: {coach_id}/{trainee_id}/{photo_id}.{ext}), but the ownership
-- check below goes one step further than that precedent. Progress photos
-- have their own metadata table, so verifying "this coach owns this
-- trainee" at the storage layer is sufficient -- the separate
-- trainee_progress_photos RLS independently governs which metadata rows
-- exist. An exercise video has no separate metadata table: the "row" it
-- belongs to is trainee_workout_exercises itself, addressed directly by
-- id in the filename. So every policy below does NOT stop at "segment 1
-- is a real coach and segment 2 is one of their real trainees" -- it
-- additionally requires a REAL trainee_workout_exercises row to exist
-- whose id equals the filename (sans extension), and whose full
-- ownership chain (exercise -> workout -> program -> trainee) resolves,
-- independently at every level, to those exact same two path segments.
-- A path segment is therefore never trusted as an input to a lookup; it
-- is only ever compared against a value the policy independently derived
-- from the real relational chain. This mirrors -- and goes one level
-- deeper than -- the "re-verify ownership at every level, not just the
-- top" posture 018_training_programs.sql itself documents for the
-- coach_id columns on trainee_program_workouts / trainee_workout_exercises.
--
-- =====================================================================
-- Column-name ambiguity: why every policy below writes `objects.name`,
-- not bare `name`
-- =====================================================================
-- Every ownership EXISTS subquery below joins trainee_workout_exercises
-- (e), trainee_program_workouts (w), and trainee_training_programs (p) --
-- and unlike the trainees table (which has a `full_name` column, never
-- `name`), all three of those DO have their own `name` text column
-- (018_training_programs.sql: the exercise's/workout's/program's own
-- display name). Progress-photos' equivalent policies (017/025) never hit
-- this, because their EXISTS subquery only ever joins `public.trainees`.
-- Here, a bare `name` inside the subquery is ambiguous among e.name /
-- w.name / p.name (all three are in scope in the very same subquery,
-- regardless of the outer storage.objects row) -- this is exactly the
-- `ERROR: 42702: column reference "name" is ambiguous` a first version of
-- this migration raised when actually run. The column that was always
-- intended is the OUTER row being tested by the policy -- the Storage
-- object's own path (`storage.objects.name`) -- never any of
-- e.name/w.name/p.name. Every occurrence below is qualified as
-- `objects.name`: inside a `CREATE POLICY ... ON storage.objects`
-- expression, the policy's own table is addressable by its bare relation
-- name (`objects`), the same way a plain query could write
-- `select objects.name from storage.objects`; no alias needs to be
-- declared for this to work, and no other table in any of these
-- subqueries is named `objects`, so it is unambiguous.
--
-- =====================================================================
-- Storage RLS design
-- =====================================================================
-- Coach (four policies, mirroring 017/026's bucket-scoped shape, `to
-- authenticated`, `public.is_coach()` required on every one -- an
-- inactive/revoked coach loses access immediately, same posture as
-- 026_coach_role_policy_hardening.sql):
--   * exercise_videos_select_own   -- read (needed to generate a signed
--     URL to preview what was uploaded).
--   * exercise_videos_insert_own   -- upload a new video.
--   * exercise_videos_update_own   -- replace an existing video in place.
--     This deliberately DIFFERS from the "delete + re-upload, no update
--     policy" convention every other file/log table in this schema uses
--     (003/016/017/018) -- requirement 6 explicitly asks for "upload,
--     read, REPLACE and delete" as independent coach capabilities, so an
--     UPDATE policy is added to support Supabase Storage's upsert-based
--     overwrite directly, rather than forcing a delete-then-reupload
--     round trip through the frontend for a same-path replace.
--   * exercise_videos_delete_own   -- remove a video.
-- Every one of the four re-derives coach_id/trainee_id/exercise_id from
-- trainee_workout_exercises/trainee_program_workouts/
-- trainee_training_programs/trainees as the actual owning chain (not from
-- the path), then checks the object name against the path that chain
-- implies -- see "Path structure" above.
--
-- Trainee (one policy, read-only):
--   * exercise_videos_select_own_trainee -- a trainee may read (and so
--     generate a signed URL for) a video only if it is attached to an
--     exercise inside a workout inside their own CURRENTLY ACTIVE
--     training program (status = 'active') -- deliberately matching
--     public.trainee_get_active_training_program()'s own scope exactly
--     (023: `p.status = 'active'`), so a trainee's storage read access is
--     never broader than what the app's own RPC would ever tell them
--     about. Ownership is resolved via public.trainee_get_auth_context()
--     (022), the same security-definer helper every other trainee-facing
--     policy/RPC in this schema uses -- never a raw subquery into
--     public.trainees directly (022's own revision note documents in
--     detail why that shape silently returns zero rows for a real
--     trainee).
-- No trainee INSERT, UPDATE, or DELETE policy exists on this bucket at
-- all -- RLS defaults to deny, so a trainee can never upload, replace, or
-- remove an instructional video, structurally (not just by omission from
-- the UI).
--
-- Nobody else: with only these five bucket-scoped policies, a coach can
-- never reach a video under a different coach_id (every coach policy's
-- EXISTS requires e/w/p/t.coach_id = auth.uid() at every level), and a
-- trainee can never reach a video belonging to a different trainee or a
-- different coach (trainee_get_auth_context() resolves solely from the
-- caller's own auth.uid(), and the EXISTS chain re-derives ownership from
-- that resolved identity only).
--
-- =====================================================================
-- RPC change
-- =====================================================================
-- public.trainee_get_active_training_program() (023) is CREATE OR
-- REPLACEd with the exact same signature (no arguments), return type
-- (jsonb), security definer, search_path, and authorization logic
-- (unchanged: trainees.auth_user_id = auth.uid(), public.is_trainee(),
-- p.coach_id = t.coach_id, p.status = 'active', ordered/limited exactly
-- as before). The ONLY change is three additional keys inside each
-- exercise's jsonb_build_object -- 'video_storage_path',
-- 'video_original_name', 'video_mime_type' -- alongside every field it
-- already returned. This is required: 023's function hand-builds an
-- explicit column allowlist rather than `select *`, so the three new
-- columns would otherwise be silently invisible to every trainee even
-- after this migration runs (the same class of gap already documented in
-- 023's own header comment about why this RPC exists at all). A video
-- with no signed URL is generated client-side from video_storage_path
-- returned here, gated by exercise_videos_select_own_trainee above --
-- this RPC itself never returns a URL, only the private path.
--
-- =====================================================================
-- Backward compatibility
-- =====================================================================
-- Every existing trainee_workout_exercises row keeps its exact current
-- values for every existing column; the three new columns default to
-- null on every one of them, which the new CHECK constraint explicitly
-- allows. Every existing coach policy on trainee_training_programs /
-- trainee_program_workouts / trainee_workout_exercises (018) is
-- unmodified, so create/edit/reorder/delete for programs, workouts, and
-- exercises keeps working exactly as before, with or without a video.
-- Every existing progress-photos storage policy (017/025/026) is
-- unmodified and unaffected -- this migration only adds policies scoped
-- to `bucket_id = 'exercise-videos'`, a bucket that does not exist before
-- this file runs. trainee_get_active_training_program()'s existing
-- fields, shape, and null-handling ('no active program' -> sql null,
-- empty workouts/exercises -> '[]'::jsonb) are byte-for-byte preserved --
-- an old frontend build that doesn't yet read the three new keys keeps
-- working unchanged, since it simply ignores JSON keys it doesn't ask for.
--
-- =====================================================================
-- Project-level Storage upload-size dependency
-- =====================================================================
-- The `file_size_limit` set on the 'exercise-videos' bucket below is a
-- PER-BUCKET ceiling. Supabase also enforces a project-wide maximum
-- upload size (Dashboard -> Settings -> Storage), and a bucket-level
-- limit can never exceed that project ceiling. This project is on the
-- Free Plan, which fixes that project-wide limit at 50 MB (confirmed in
-- the Dashboard) -- so the bucket limit below is set to exactly 50 MB,
-- matching it precisely rather than setting a higher bucket value that
-- the project ceiling would silently clamp anyway. This repository has
-- no local Supabase project config file to read that value from (every
-- migration here is applied manually via the SQL Editor, per this
-- project's existing workflow); if the project is ever upgraded off the
-- Free Plan and a larger global limit becomes available, the bucket
-- limit here would need a follow-up migration to raise it -- this file
-- does not attempt to anticipate that.
--
-- =====================================================================
-- Rerun safety
-- =====================================================================
-- * The three ADD COLUMN statements use IF NOT EXISTS.
-- * The CHECK constraint is dropped-if-exists then re-added (ADD
--   CONSTRAINT has no IF NOT EXISTS form in Postgres) -- same idiom
--   011_restaurant_nutrition_logs.sql already uses for a constraint.
-- * The bucket insert uses ON CONFLICT (id) DO UPDATE, so rerunning this
--   file re-asserts the intended public/limit/mime-type configuration
--   rather than erroring on a duplicate key.
-- * Every storage.objects and every function-replace statement is
--   preceded by DROP POLICY IF EXISTS / uses CREATE OR REPLACE FUNCTION,
--   matching every prior migration's convention in this schema
--   (018, 021, 022, 023, 025, 026 all rely on the same two patterns).

begin;

-- =====================================================================
-- 1. Three new nullable columns on trainee_workout_exercises
-- =====================================================================
alter table public.trainee_workout_exercises
  add column if not exists video_storage_path text,
  add column if not exists video_original_name text,
  add column if not exists video_mime_type text;

-- All-or-nothing consistency: a video reference is either fully present
-- or fully absent, never partially filled in. drop-if-exists then add,
-- same rerun-safety idiom 011_restaurant_nutrition_logs.sql already uses
-- for a table CHECK constraint (ADD CONSTRAINT has no IF NOT EXISTS form
-- in Postgres).
alter table public.trainee_workout_exercises
  drop constraint if exists trainee_workout_exercises_video_fields_consistent;

alter table public.trainee_workout_exercises
  add constraint trainee_workout_exercises_video_fields_consistent
  check (
    (video_storage_path is null and video_original_name is null and video_mime_type is null)
    or
    (video_storage_path is not null and video_original_name is not null and video_mime_type is not null)
  );

-- =====================================================================
-- 2. Private Storage bucket: exercise-videos
-- =====================================================================
-- public = false: every video is only ever reachable through a
-- short-lived signed URL generated for an authorized caller, never a
-- public URL -- same posture as 'progress-photos' (017).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos',
  'exercise-videos',
  false,
  52428800, -- 50 MB (Free Plan project-wide Storage upload ceiling)
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 3. storage.objects RLS -- coach: select / insert / update / delete,
--    scoped to bucket_id = 'exercise-videos' only.
-- =====================================================================
-- Every policy re-derives the full ownership chain
-- (trainee_workout_exercises -> trainee_program_workouts ->
-- trainee_training_programs -> trainees, each level's own coach_id
-- re-checked against auth.uid() independently, matching 018's own
-- "re-verify at every level" convention) and only then checks that the
-- object name matches the exact path that chain implies. The path itself
-- is never trusted as a lookup key -- see the header comment above.

drop policy if exists exercise_videos_select_own on storage.objects;
create policy exercise_videos_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and objects.name ~ (
          '^' || auth.uid()::text || '/' || t.id::text || '/' ||
          e.id::text || '\.(mp4|webm|mov)$'
        )
    )
  );

drop policy if exists exercise_videos_insert_own on storage.objects;
create policy exercise_videos_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'exercise-videos'
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and objects.name ~ (
          '^' || auth.uid()::text || '/' || t.id::text || '/' ||
          e.id::text || '\.(mp4|webm|mov)$'
        )
    )
  );

-- Supports Supabase Storage's upsert-based "replace" (upload with
-- upsert: true against an existing path performs an UPDATE, not an
-- INSERT) -- see the header comment on why this table gets an UPDATE
-- policy unlike every append-only-style file/log table elsewhere in this
-- schema.
drop policy if exists exercise_videos_update_own on storage.objects;
create policy exercise_videos_update_own on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and objects.name ~ (
          '^' || auth.uid()::text || '/' || t.id::text || '/' ||
          e.id::text || '\.(mp4|webm|mov)$'
        )
    )
  )
  with check (
    bucket_id = 'exercise-videos'
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and objects.name ~ (
          '^' || auth.uid()::text || '/' || t.id::text || '/' ||
          e.id::text || '\.(mp4|webm|mov)$'
        )
    )
  );

drop policy if exists exercise_videos_delete_own on storage.objects;
create policy exercise_videos_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exercise-videos'
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and objects.name ~ (
          '^' || auth.uid()::text || '/' || t.id::text || '/' ||
          e.id::text || '\.(mp4|webm|mov)$'
        )
    )
  );

-- =====================================================================
-- 4. storage.objects RLS -- trainee: select only, scoped to their own
--    CURRENTLY ACTIVE program.
-- =====================================================================
-- No insert/update/delete policy for the trainee role on this bucket at
-- all -- RLS defaults to deny, so a trainee structurally cannot upload,
-- replace, or remove an instructional video, regardless of what any
-- frontend build does or doesn't render.
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
      join public.trainees t
        on t.id = ctx.trainee_id
       and t.coach_id = ctx.coach_id
      join public.trainee_training_programs p
        on p.trainee_id = t.id
       and p.coach_id = t.coach_id
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

-- =====================================================================
-- 5. trainee_get_active_training_program() -- add the three video
--    fields to each exercise; everything else byte-for-byte unchanged
--    from 023_trainee_training_access.sql.
-- =====================================================================
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
    and public.is_trainee()
    and p.coach_id = t.coach_id
    and p.status = 'active'
  order by p.created_at desc
  limit 1;
$$;

revoke execute on function public.trainee_get_active_training_program() from public;
grant execute on function public.trainee_get_active_training_program() to authenticated;

commit;
