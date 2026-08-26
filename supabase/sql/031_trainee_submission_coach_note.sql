-- Trainee Submission Coach Note milestone -- lets a coach attach an
-- optional note when reviewing a trainee's performance video
-- (030_trainee_exercise_submission_videos.sql), visible to the trainee
-- underneath their own video. Purely additive on top of 030: one new
-- column, an updated reset trigger, and a replaced RPC. Neither 030 nor
-- any earlier migration is modified.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 030_trainee_exercise_submission_videos.sql.
-- Wrapped in a single transaction so it applies entirely or not at all.
-- Safe to rerun: the column uses ADD COLUMN IF NOT EXISTS, the length
-- constraint is dropped-if-exists then re-added, the RPC's old signature
-- is dropped-if-exists before the new one is created, and the trigger
-- function is CREATE OR REPLACE (the trigger itself, from 030, is
-- untouched -- it already points at this function by name, so a new
-- function body takes effect without recreating the trigger).
--
-- =====================================================================
-- What changes, precisely
-- =====================================================================
--   1. trainee_exercise_submission_videos gains one nullable column,
--      coach_note text, capped at 1000 characters by a CHECK constraint.
--   2. reset_submission_review_on_replace() (030's BEFORE UPDATE trigger
--      function, unchanged trigger definition) now also clears coach_note
--      to null whenever storage_path genuinely changes -- a trainee
--      replacing their video resets BOTH reviewed_at and coach_note, so a
--      coach is never shown a stale note against a video they have not
--      actually reviewed yet.
--   3. coach_mark_submission_reviewed(uuid) (030) is replaced by
--      coach_mark_submission_reviewed(uuid, text default null) -- the old
--      single-argument overload is explicitly dropped first (see "Why the
--      old overload is dropped, not just replaced" below). The same RPC
--      now serves both "mark reviewed" (note omitted) and "update the
--      note later" (called again with a new note) -- both are the same
--      action: set reviewed_at = now() and coach_note = the trimmed note,
--      scoped to a submission this coach actually owns.
-- Nothing else -- no existing table, other column, other constraint,
-- other trigger, other function, policy, bucket, or frontend file is
-- touched. 027-029 (coach instructional video) and every other object
-- from 030 are completely unaffected.
--
-- =====================================================================
-- Why the old coach_mark_submission_reviewed(uuid) overload is dropped,
-- not just replaced
-- =====================================================================
-- Postgres identifies a function by name AND parameter signature, not by
-- name alone. CREATE OR REPLACE FUNCTION coach_mark_submission_reviewed(
-- uuid, text default null) would NOT replace the existing uuid-only
-- version -- it would create a second, overloaded function with the same
-- name. Calling it with a single argument would then be genuinely
-- ambiguous between "the uuid-only overload" and "the two-arg overload
-- with its default applied", and Postgres would reject the call outright
-- ("function ... is not unique"). Dropping the old overload first (DROP
-- FUNCTION IF EXISTS, rerun-safe) is what makes this an actual, clean
-- replacement rather than a second, conflicting function.
--
-- =====================================================================
-- Trainee access to coach_note -- read yes, write never (unchanged
-- posture, made explicit here)
-- =====================================================================
-- coach_note is readable by the trainee via the EXACT SAME existing SELECT
-- policy (030's trainee_exercise_submission_videos_select_own_trainee) --
-- RLS policies apply per ROW, not per column, so a trainee's own
-- submission row (already fully visible to them) simply gains one more
-- visible field, with no new policy needed for reading it.
--
-- Writing is a different story, and needed no new REVOKE to stay closed:
-- 030 already replaced the trainee role's blanket UPDATE privilege on
-- this table with a column-scoped grant naming only
-- (storage_path, original_name, mime_type, file_size_bytes, submitted_at).
-- A column added AFTER that grant was issued is NOT retroactively covered
-- by it -- Postgres column-level privileges are granted per column
-- explicitly, never implied for a column that didn't exist yet. So
-- coach_note (like reviewed_at before it) starts, and stays, completely
-- outside the trainee role's UPDATE privilege on this table by
-- construction, the moment it's added -- before this migration even
-- reaches its own permissions section. That section below re-states the
-- exact same grant from 030 anyway (unchanged, rerun-safe), purely so the
-- correct end state is self-evident from reading this file alone, not
-- something the reader has to infer from 030 plus Postgres grant
-- semantics.

begin;

-- =====================================================================
-- 1. coach_note column
-- =====================================================================
alter table public.trainee_exercise_submission_videos
  add column if not exists coach_note text;

alter table public.trainee_exercise_submission_videos
  drop constraint if exists trainee_exercise_submission_videos_coach_note_length;
alter table public.trainee_exercise_submission_videos
  add constraint trainee_exercise_submission_videos_coach_note_length
  check (coach_note is null or char_length(coach_note) <= 1000);

-- =====================================================================
-- 2. Reset trigger -- now clears coach_note too on a genuine replace
-- =====================================================================
-- Same function name as 030 (CREATE OR REPLACE); the trigger itself
-- (trainee_exercise_submission_videos_reset_review, before update, when
-- storage_path changes) is untouched -- it already calls this function by
-- name, so the new body takes effect immediately without recreating it.
-- Still fires only on a genuine replace (storage_path actually changing),
-- never on coach_mark_submission_reviewed() below (which never touches
-- storage_path), so the two write paths remain fully independent.
create or replace function public.reset_submission_review_on_replace()
returns trigger
language plpgsql
as $$
begin
  new.reviewed_at = null;
  new.coach_note = null;
  new.submitted_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 3. coach_mark_submission_reviewed(uuid, text default null)
-- =====================================================================
-- Old single-argument overload dropped first -- see the header note above
-- for why this must be an explicit drop, not just CREATE OR REPLACE.
drop function if exists public.coach_mark_submission_reviewed(uuid);

-- The one and only write path for both reviewed_at and coach_note.
-- Coach-only (is_coach()), and only ever touches a submission whose
-- coach_id already equals the caller -- no parent-chain re-verification
-- needed (coach_id is directly on the row, same as 030's original
-- version and every other coach-owned table's own-row check in this
-- schema). Never touches storage_path/original_name/mime_type/
-- file_size_bytes -- the trigger in section 2 only ever fires from a
-- genuine trainee replace, never from this RPC.
create or replace function public.coach_mark_submission_reviewed(
  p_submission_id uuid,
  p_coach_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may mark a trainee performance video as reviewed.';
  end if;

  -- Trim, then store a blank result as null rather than an empty string
  -- -- "no note" and "empty-string note" are the same thing to a coach,
  -- and should be the same thing in storage too.
  v_note := nullif(trim(coalesce(p_coach_note, '')), '');

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Coach note must be 1000 characters or fewer.';
  end if;

  update public.trainee_exercise_submission_videos
  set reviewed_at = now(),
      coach_note = v_note
  where id = p_submission_id
    and coach_id = auth.uid();

  if not found then
    raise exception 'Submission not found.';
  end if;
end;
$$;

revoke execute on function public.coach_mark_submission_reviewed(uuid, text) from public;
grant execute on function public.coach_mark_submission_reviewed(uuid, text) to authenticated;

-- =====================================================================
-- 4. Column-scoped UPDATE grant -- re-stated unchanged from 030, for
--    the reason explained in the header note above
-- =====================================================================
revoke update on public.trainee_exercise_submission_videos from authenticated;
grant update (storage_path, original_name, mime_type, file_size_bytes, submitted_at)
  on public.trainee_exercise_submission_videos to authenticated;

commit;
