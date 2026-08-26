-- Trainee Exercise Submission Videos milestone -- lets a trainee upload a
-- video of themselves performing an exercise, for their coach to review,
-- completely separate from the coach's own instructional video
-- (027_exercise_instructional_videos.sql / 028 / 029). Two different
-- videos can exist per exercise, in two different tables and two
-- different private Storage buckets, with no code path that can ever let
-- one overwrite, replace, or delete the other.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 029_fix_trainee_exercise_video_policy.sql.
-- Wrapped in a single transaction so it applies entirely or not at all.
-- Safe to rerun: every object below uses CREATE OR REPLACE / IF NOT
-- EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO UPDATE as appropriate.
--
-- =====================================================================
-- Complete separation from the coach's instructional video (027-029) --
-- confirmed, not just intended
-- =====================================================================
-- Nothing in this file touches trainee_workout_exercises.video_storage_path
-- / video_original_name / video_mime_type, the 'exercise-videos' bucket,
-- or any of the six exercise_videos_* policies (027) / the
-- exercise_videos_select_own_trainee policy (029, its final corrected
-- form). This migration creates ONLY new objects:
--   * a new table, trainee_exercise_submission_videos
--   * a new bucket, exercise-submission-videos
--   * two new SECURITY DEFINER functions
--   * one new RPC
--   * RLS policies scoped ONLY to the new table and the new bucket
-- A trainee is granted no INSERT/UPDATE/DELETE capability of any kind on
-- trainee_workout_exercises itself (so the coach's video_* columns stay
-- exactly as unreachable to a trainee as they already were), and no
-- policy anywhere in this file references the 'exercise-videos' bucket --
-- Storage policies are strictly bucket_id-scoped, so a policy written
-- against 'exercise-submission-videos' can never match a row belonging
-- to 'exercise-videos' regardless of any other condition. See the closing
-- confirmation at the end of this file for the explicit proof.
--
-- =====================================================================
-- One current video per (trainee, exercise) -- an upload/replace/delete
-- model, deliberately mirroring the coach's own instructional-video
-- design (027) rather than the append-only "history" convention used by
-- nutrition/progress/circumference logs
-- =====================================================================
-- unique (trainee_id, exercise_id) below means a trainee has at most one
-- performance video per exercise at any time; a second upload for the
-- same exercise is a REPLACE (UPDATE, same row) rather than a new row.
-- Replacing resets reviewed_at to null (via trigger, see section 2) so a
-- coach is never shown a stale "reviewed" state against a video they
-- have not actually seen yet.
--
-- =====================================================================
-- Path structure and the SECURITY DEFINER helper pattern (029)
-- =====================================================================
-- Every submission video is stored at exactly:
--   {coach_id}/{trainee_id}/{exercise_id}/{submission_id}.{ext}
-- (ext one of mp4/webm/mov). Because this path -- unlike
-- trainee_progress_photos' flat {coach_id}/{trainee_id}/{id}.{ext} shape
-- (017/025) -- encodes exercise_id, every trainee-facing Storage policy
-- on this bucket must, like 027/028/029's coach-video policies, verify
-- that segment against the real active-program -> workout -> exercise
-- ownership chain -- a table set no trainee-role query may ever touch
-- directly (023's deliberate design; confirmed live and at length in the
-- investigation preceding 028/029). Both new SECURITY DEFINER helpers
-- below exist for exactly this reason -- neither the table's RLS
-- policies nor the bucket's RLS policies ever join
-- trainee_training_programs / trainee_program_workouts /
-- trainee_workout_exercises / trainees directly; every such read happens
-- exclusively inside these two functions, running as the function OWNER,
-- bypassing those tables' RLS -- the exact mechanism
-- trainee_get_active_training_program() (023) and
-- trainee_can_view_exercise_video() (029) already use successfully.
--
-- =====================================================================
-- What this migration creates, precisely
-- =====================================================================
--   1. public.trainee_exercise_submission_videos -- new table.
--   2. A BEFORE UPDATE trigger that resets reviewed_at (and refreshes
--      submitted_at) whenever storage_path actually changes -- i.e. only
--      on a genuine replace, never on the coach's own mark-reviewed RPC
--      (which never touches storage_path).
--   3. public.trainee_can_submit_exercise_video(uuid) -- SECURITY DEFINER
--      helper for the table's own INSERT/UPDATE policies.
--   4. public.trainee_can_access_submission_video(text) -- SECURITY
--      DEFINER helper for every trainee-facing Storage policy on the new
--      bucket.
--   5. public.coach_mark_submission_reviewed(uuid) -- the one, narrow,
--      coach-only write path for reviewed_at.
--   6. The 'exercise-submission-videos' private Storage bucket.
--   7. Table RLS: 2 coach policies (select/delete), 3 trainee policies
--      (select/insert/update -- update column-restricted, see section 2).
--   8. Storage RLS: 2 coach policies (select/delete), 4 trainee policies
--      (select/insert/update/delete).
-- Nothing else -- no existing table, column, constraint, trigger,
-- function, policy, bucket, or frontend file is touched.

begin;

-- =====================================================================
-- 1. public.trainee_exercise_submission_videos
-- =====================================================================
create table if not exists public.trainee_exercise_submission_videos (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  -- on delete restrict (not cascade): a coach cannot delete an exercise
  -- out from under a trainee's already-submitted performance video --
  -- the video must be removed first. Same forward-looking convention
  -- 018_training_programs.sql's own header comment specifies for exactly
  -- this situation ("a future milestone [that] logs actual workout
  -- sessions against specific exercises... should use on delete restrict
  -- back to trainee_workout_exercises").
  exercise_id uuid not null references public.trainee_workout_exercises(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null check (char_length(trim(original_name)) > 0),
  -- Defense in depth alongside the bucket's own allowed_mime_types
  -- (section 6) -- deliberately stricter than 027's video_mime_type
  -- (which has no CHECK, matching 017's convention); added here because
  -- this migration's own explicit brief is strictness end to end.
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm', 'video/quicktime')),
  file_size_bytes integer not null check (file_size_bytes > 0),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- At most one CURRENT performance video per trainee per exercise --
  -- a second upload for the same pair is a replace (UPDATE), not a new
  -- row. Also serves as the lookup index for "this trainee's video for
  -- this exercise", the only access pattern this table needs.
  constraint trainee_exercise_submission_videos_one_per_exercise
    unique (trainee_id, exercise_id)
);

alter table public.trainee_exercise_submission_videos enable row level security;

-- =====================================================================
-- 2. Reset reviewed_at (and refresh submitted_at) on a genuine replace
-- =====================================================================
-- Fires only when storage_path actually changes -- i.e. only on a real
-- replace, never on public.coach_mark_submission_reviewed() below (which
-- only ever sets reviewed_at, never storage_path), so the two write
-- paths cannot interfere with each other. Combined with the column-scoped
-- UPDATE grant in section 7 (the trainee role's UPDATE grant excludes
-- reviewed_at entirely), a trainee's own replace can never itself set
-- reviewed_at to anything -- this trigger is what explicitly clears it.
create or replace function public.reset_submission_review_on_replace()
returns trigger
language plpgsql
as $$
begin
  new.reviewed_at = null;
  new.submitted_at = now();
  return new;
end;
$$;

drop trigger if exists trainee_exercise_submission_videos_reset_review
  on public.trainee_exercise_submission_videos;
create trigger trainee_exercise_submission_videos_reset_review
  before update on public.trainee_exercise_submission_videos
  for each row
  when (new.storage_path is distinct from old.storage_path)
  execute function public.reset_submission_review_on_replace();

-- =====================================================================
-- 3. public.trainee_can_submit_exercise_video(p_exercise_id uuid)
-- =====================================================================
-- Used by the table's own trainee INSERT/UPDATE policies (section 7).
-- Returns true only if the CALLING trainee's own currently ACTIVE
-- program contains this exact exercise, with coach_id consistent at
-- every level (program -> workout -> exercise) -- same shape as
-- 029's own trainee_can_view_exercise_video(), parameterized by
-- exercise_id directly instead of a Storage path (the table's own
-- exercise_id column is already a trusted uuid, no path parsing needed
-- here).
create or replace function public.trainee_can_submit_exercise_video(p_exercise_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p_exercise_id is not null
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
       and e.id = p_exercise_id
    );
$$;

revoke execute on function public.trainee_can_submit_exercise_video(uuid) from public;
grant execute on function public.trainee_can_submit_exercise_video(uuid) to authenticated;

-- =====================================================================
-- 4. public.trainee_can_access_submission_video(p_object_name text)
-- =====================================================================
-- Used by every trainee-facing Storage policy on the new bucket
-- (section 8). Validates the FULL required path shape --
-- {coach_id}/{trainee_id}/{exercise_id}/{submission_id}.{ext} -- against
-- the calling trainee's own real, active-program-owned exercise. The
-- fourth segment (submission_id) is checked for well-formedness (a
-- lowercase-hex UUID) but NOT required to already exist as a metadata
-- row -- Storage upload happens before the metadata insert (the same
-- unavoidable two-phase-upload shape 017/025 document at length), so at
-- INSERT time no matching row exists yet; ownership and active-program
-- membership are already fully established by the first three segments,
-- which is sufficient. One shared helper covers select/insert/update/
-- delete uniformly -- exactly 029's one-helper-per-policy-family shape,
-- generalized to four operations instead of one.
create or replace function public.trainee_can_access_submission_video(p_object_name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p_object_name is not null
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
        e.id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov)$'
      )
    );
$$;

revoke execute on function public.trainee_can_access_submission_video(text) from public;
grant execute on function public.trainee_can_access_submission_video(text) to authenticated;

-- =====================================================================
-- 5. public.coach_mark_submission_reviewed(p_submission_id uuid)
-- =====================================================================
-- The ONLY way reviewed_at is ever set. Coach-only, and only ever
-- touches a submission whose coach_id already equals the caller (no
-- parent-chain re-verification needed here -- coach_id is directly on
-- the row, same as every other coach-owned table's own-row check in this
-- schema). Never touches storage_path, so the trigger in section 2 never
-- fires from this path -- reviewed_at and the video reference itself are
-- fully independent write paths.
create or replace function public.coach_mark_submission_reviewed(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_coach() then
    raise exception 'Only a coach may mark a trainee performance video as reviewed.';
  end if;

  update public.trainee_exercise_submission_videos
  set reviewed_at = now()
  where id = p_submission_id
    and coach_id = auth.uid();

  if not found then
    raise exception 'Submission not found.';
  end if;
end;
$$;

revoke execute on function public.coach_mark_submission_reviewed(uuid) from public;
grant execute on function public.coach_mark_submission_reviewed(uuid) to authenticated;

-- =====================================================================
-- 6. Private Storage bucket: exercise-submission-videos
-- =====================================================================
-- Separate bucket id from 'exercise-videos' (027) -- a policy scoped to
-- one bucket_id can never match a row in the other, so this is a
-- structural guarantee, not just a naming convention. Same Free Plan
-- limit/allowlist as 027's bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-submission-videos',
  'exercise-submission-videos',
  false,
  52428800, -- 50 MB (Free Plan project-wide Storage upload ceiling, same as 027)
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 7. Table RLS: trainee_exercise_submission_videos
-- =====================================================================

-- ---- Coach: select + delete only. No coach insert/update policy of any
-- kind -- a coach never uploads or directly edits a trainee's own
-- performance video; their only write path to this table at all is the
-- narrow coach_mark_submission_reviewed() RPC above. Direct joins are
-- safe here: a coach already has full RLS-verified read access to the
-- entire program -> workout -> exercise -> trainee chain (018/026).
drop policy if exists trainee_exercise_submission_videos_select_own on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_select_own on public.trainee_exercise_submission_videos
  for select
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.id = trainee_exercise_submission_videos.exercise_id
        and e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and t.id = trainee_exercise_submission_videos.trainee_id
    )
  );

drop policy if exists trainee_exercise_submission_videos_delete_own on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_delete_own on public.trainee_exercise_submission_videos
  for delete
  to authenticated
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1
      from public.trainee_workout_exercises e
      join public.trainee_program_workouts w on w.id = e.workout_id
      join public.trainee_training_programs p on p.id = w.program_id
      join public.trainees t on t.id = p.trainee_id
      where e.id = trainee_exercise_submission_videos.exercise_id
        and e.coach_id = auth.uid()
        and w.coach_id = auth.uid()
        and p.coach_id = auth.uid()
        and t.coach_id = auth.uid()
        and t.id = trainee_exercise_submission_videos.trainee_id
    )
  );

-- ---- Trainee: select own, insert own (first upload), update own
-- (replace). No trainee delete-by-raw-DELETE is withheld here -- a
-- trainee IS allowed to delete their own submission (product
-- requirement), scoped the same way as select.
--
-- select / delete: the row already carries trainee_id/coach_id
-- (denormalized) -- compared directly against trainee_get_auth_context(),
-- no further join needed (022's proven simplest-possible pattern; once a
-- row exists it was already gatekept at insert time).
drop policy if exists trainee_exercise_submission_videos_select_own_trainee on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_select_own_trainee on public.trainee_exercise_submission_videos
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_exercise_submission_videos.trainee_id
        and ctx.coach_id = trainee_exercise_submission_videos.coach_id
    )
  );

drop policy if exists trainee_exercise_submission_videos_delete_own_trainee on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_delete_own_trainee on public.trainee_exercise_submission_videos
  for delete
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_exercise_submission_videos.trainee_id
        and ctx.coach_id = trainee_exercise_submission_videos.coach_id
    )
  );

-- insert / update: the deep active-program -> workout -> exercise check
-- is required here (a NEW claim about which exercise this row belongs
-- to), via the SECURITY DEFINER helper from section 3 -- never a direct
-- join. with check re-verifies trainee_id/coach_id match the caller's
-- own resolved context on every insert AND every update, so a replace
-- can never silently re-point a row at a different trainee/coach/exercise
-- either.
drop policy if exists trainee_exercise_submission_videos_insert_own_trainee on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_insert_own_trainee on public.trainee_exercise_submission_videos
  for insert
  to authenticated
  with check (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_exercise_submission_videos.trainee_id
        and ctx.coach_id = trainee_exercise_submission_videos.coach_id
    )
    and public.trainee_can_submit_exercise_video(trainee_exercise_submission_videos.exercise_id)
    and trainee_exercise_submission_videos.storage_path ~ (
      '^' || trainee_exercise_submission_videos.coach_id::text || '/' ||
      trainee_exercise_submission_videos.trainee_id::text || '/' ||
      trainee_exercise_submission_videos.exercise_id::text || '/' ||
      trainee_exercise_submission_videos.id::text || '\.(mp4|webm|mov)$'
    )
  );

drop policy if exists trainee_exercise_submission_videos_update_own_trainee on public.trainee_exercise_submission_videos;
create policy trainee_exercise_submission_videos_update_own_trainee on public.trainee_exercise_submission_videos
  for update
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_exercise_submission_videos.trainee_id
        and ctx.coach_id = trainee_exercise_submission_videos.coach_id
    )
  )
  with check (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_exercise_submission_videos.trainee_id
        and ctx.coach_id = trainee_exercise_submission_videos.coach_id
    )
    and public.trainee_can_submit_exercise_video(trainee_exercise_submission_videos.exercise_id)
    and trainee_exercise_submission_videos.storage_path ~ (
      '^' || trainee_exercise_submission_videos.coach_id::text || '/' ||
      trainee_exercise_submission_videos.trainee_id::text || '/' ||
      trainee_exercise_submission_videos.exercise_id::text || '/' ||
      trainee_exercise_submission_videos.id::text || '\.(mp4|webm|mov)$'
    )
  );

-- Column-scoped grants: RLS governs WHICH rows a role can touch; these
-- grants govern WHICH COLUMNS a plain UPDATE from that role may write,
-- independent of RLS. The trainee role's UPDATE grant deliberately
-- excludes reviewed_at (and id/coach_id/trainee_id/exercise_id) -- a
-- trainee's own replace can only ever touch the video-reference columns
-- themselves; reviewed_at can only ever be changed by
-- coach_mark_submission_reviewed() (section 5), which runs as the
-- function owner and is therefore unaffected by this grant. SELECT/
-- INSERT/DELETE remain row-level (RLS) only, matching every other table
-- in this schema -- only UPDATE needs a column-level restriction here,
-- because it is the one operation where "which columns changed" matters
-- for a security-relevant field (reviewed_at) that RLS's row-level
-- WITH CHECK cannot by itself distinguish.
-- SELECT/INSERT/DELETE are left untouched -- Supabase's default schema
-- privileges already grant these broadly to authenticated (the same
-- assumption every other table in this schema relies on; 021 is the one
-- precedent for this exact revoke-then-column-grant idiom, and it too
-- only ever touches UPDATE, never restating SELECT/INSERT/DELETE).
revoke update on public.trainee_exercise_submission_videos from authenticated;
grant update (storage_path, original_name, mime_type, file_size_bytes, submitted_at)
  on public.trainee_exercise_submission_videos to authenticated;

-- =====================================================================
-- 8. Storage RLS: bucket 'exercise-submission-videos'
-- =====================================================================

-- ---- Coach: select + delete only, same folder-prefix pattern as every
-- coach Storage policy already in this schema (017/026/027) -- direct
-- join to trainees is safe for a coach (they have real RLS SELECT access
-- to it).
drop policy if exists exercise_submission_videos_select_own on storage.objects;
create policy exercise_submission_videos_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exercise-submission-videos'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

drop policy if exists exercise_submission_videos_delete_own on storage.objects;
create policy exercise_submission_videos_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exercise-submission-videos'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.trainees
      where trainees.id::text = (storage.foldername(name))[2]
        and trainees.coach_id = auth.uid()
    )
  );

-- No coach insert/update policy on this bucket -- a coach never uploads
-- or replaces a trainee's own performance video.

-- ---- Trainee: select, insert, update (replace), delete -- all four
-- share the exact same SECURITY DEFINER helper from section 4, never a
-- direct join. This is the one place in this migration that mirrors
-- 029's shape most directly, generalized from one policy to four.
drop policy if exists exercise_submission_videos_select_own_trainee on storage.objects;
create policy exercise_submission_videos_select_own_trainee on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'exercise-submission-videos'
    and public.is_trainee()
    and public.trainee_can_access_submission_video(storage.objects.name)
  );

drop policy if exists exercise_submission_videos_insert_own_trainee on storage.objects;
create policy exercise_submission_videos_insert_own_trainee on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'exercise-submission-videos'
    and public.is_trainee()
    and public.trainee_can_access_submission_video(storage.objects.name)
  );

drop policy if exists exercise_submission_videos_update_own_trainee on storage.objects;
create policy exercise_submission_videos_update_own_trainee on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'exercise-submission-videos'
    and public.is_trainee()
    and public.trainee_can_access_submission_video(storage.objects.name)
  )
  with check (
    bucket_id = 'exercise-submission-videos'
    and public.is_trainee()
    and public.trainee_can_access_submission_video(storage.objects.name)
  );

drop policy if exists exercise_submission_videos_delete_own_trainee on storage.objects;
create policy exercise_submission_videos_delete_own_trainee on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'exercise-submission-videos'
    and public.is_trainee()
    and public.trainee_can_access_submission_video(storage.objects.name)
  );

commit;

-- =====================================================================
-- Explicit confirmation: a trainee can never touch the coach's
-- instructional video (verified by construction, restated here for
-- auditability)
-- =====================================================================
-- 1. No statement in this file references trainee_workout_exercises'
--    video_storage_path / video_original_name / video_mime_type columns,
--    for read or write, anywhere.
-- 2. No statement in this file references bucket_id = 'exercise-videos'
--    anywhere -- every Storage policy created or referenced here is
--    scoped to bucket_id = 'exercise-submission-videos' only, and
--    Postgres RLS policies are evaluated per-row against a row's actual
--    bucket_id, so a policy naming a different bucket_id can never match
--    an 'exercise-videos' object regardless of any other condition.
-- 3. No policy from 027 (exercise_videos_select_own / _insert_own /
--    _update_own / _delete_own) or 029 (exercise_videos_select_own_trainee)
--    is dropped, replaced, or altered by this file.
-- 4. A trainee's only write capability created anywhere in this file is
--    against trainee_exercise_submission_videos (a brand new table) and
--    the 'exercise-submission-videos' bucket (a brand new bucket) -- RLS
--    still default-denies everything not explicitly granted, and nothing
--    in this file grants a trainee role any INSERT/UPDATE/DELETE on
--    trainee_workout_exercises or on the 'exercise-videos' bucket, exactly
--    as before this migration ran.
