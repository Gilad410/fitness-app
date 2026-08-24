-- Trainee Progress Access milestone -- lets a trainee read their own
-- weigh-in history (public.trainee_progress_logs, 002_progress_logs.sql /
-- 014_progress_logs_delete.sql) and self-report a new entry or delete a
-- mis-entered one, matching the self-correction behaviour already granted
-- for nutrition (022_trainee_nutrition_access.sql).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 023_trainee_training_access.sql. Wrapped in a
-- single transaction so it applies entirely or not at all. Safe to rerun:
-- every object below is created with `drop ... if exists` (policies) or
-- `create or replace` (functions) first, and revoke/grant are idempotent
-- on their own.
--
-- Purely additive and safe for existing data: no column, constraint,
-- trigger, coach-facing policy, or existing row is touched. Exactly one
-- new SELECT policy and two new functions are added; nothing else in the
-- schema changes.
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- trainee_progress_logs already has trainee_id AND coach_id directly on
-- every row (unlike trainee_program_workouts/trainee_workout_exercises in
-- 023, which have no trainee_id at all) -- so, exactly like
-- trainee_nutrition_logs in 022, a direct trainee-facing SELECT policy is
-- safe here, anchored on public.trainee_get_auth_context() (022) rather
-- than a raw subquery into public.trainees directly -- a plain
-- `exists (select 1 from public.trainees where ...)` written inside
-- another table's policy runs as the querying (trainee) role and is
-- itself subject to trainees' RLS, which grants the trainee role no row
-- access at all; that exact mistake was made and fixed twice already
-- (021's original trainee_notifications policy, 022's first draft) --
-- trainee_get_auth_context() is the one place that resolves "who is this
-- trainee" as the function owner, bypassing that problem entirely, and is
-- reused here unchanged, not redefined.
--
-- Reading: one new SELECT policy, requiring both trainee_id AND coach_id
-- to match the caller's resolved context (full row-consistency, same
-- posture as every trainee-facing policy since 022) -- a row with a
-- correct trainee_id but a corrupted/mismatched coach_id does not
-- qualify. No trainee-facing INSERT/UPDATE/DELETE policy is added on the
-- table at all -- RLS default-denies those outright; the only write paths
-- are the two RPCs below, so trainee_id/coach_id can never be supplied by
-- the client, only resolved server-side.
--
-- Writing (logging a new entry): trainee_log_progress_entry() takes only
-- weight/date/note -- never an id -- validates weight is a positive
-- number (mirrors the table's own `weight > 0` check, for a clean error
-- before the constraint), and inserts with trainee_id/coach_id resolved
-- exclusively from trainee_get_auth_context().
--
-- Deleting: trainee_delete_progress_entry() takes only a log id,
-- re-derives full ownership (trainee_id AND coach_id) the same way, and
-- deletes only if both match -- exactly the trainee_delete_nutrition_entry
-- shape from 022. No coach policy, column, or the existing "no UPDATE
-- policy, ever" rule (weigh-ins are append/delete only, corrections are
-- delete + re-add -- 014's own comment) is touched or altered.

begin;

-- =====================================================================
-- 1. Trainee read access: trainee_progress_logs (own history only)
-- =====================================================================
drop policy if exists trainee_progress_logs_select_own_trainee on public.trainee_progress_logs;
create policy trainee_progress_logs_select_own_trainee on public.trainee_progress_logs
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_progress_logs.trainee_id
        and ctx.coach_id = trainee_progress_logs.coach_id
    )
  );

-- =====================================================================
-- 2. trainee_log_progress_entry() -- the only way a trainee can create a
--    progress log row.
-- =====================================================================
-- security definer so the insert can succeed with no INSERT policy
-- granted to the trainee role at all; set search_path pins name
-- resolution to public/pg_temp so no caller-controlled search_path can
-- redirect an unqualified reference to a different object. Every
-- identifier in the body is schema-qualified regardless, as defense in
-- depth. No dynamic SQL anywhere in this function -- every value is bound
-- as a typed parameter or literal, never concatenated into a query
-- string, so there is no SQL-injection surface here.
create or replace function public.trainee_log_progress_entry(
  p_weight numeric,
  p_logged_at date default current_date,
  p_note text default null
)
returns public.trainee_progress_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_row public.trainee_progress_logs%rowtype;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may log their own progress entry.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null or v_coach_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  if p_weight is null or p_weight <= 0 then
    raise exception 'Weight must be a positive number.';
  end if;

  if p_logged_at is null then
    raise exception 'A log date is required.';
  end if;

  insert into public.trainee_progress_logs (trainee_id, coach_id, weight, note, logged_at)
  values (v_trainee_id, v_coach_id, p_weight, nullif(trim(p_note), ''), p_logged_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.trainee_log_progress_entry(numeric, date, text) from public;
revoke execute on function public.trainee_log_progress_entry(numeric, date, text) from anon;
grant execute on function public.trainee_log_progress_entry(numeric, date, text) to authenticated;

-- =====================================================================
-- 3. trainee_delete_progress_entry() -- the only way a trainee can
--    delete one of their own progress log rows.
-- =====================================================================
-- No DELETE policy is granted to the trainee role on trainee_progress_logs
-- at all -- this RPC is the sole path, and it requires full row
-- consistency (trainee_id AND coach_id both matching the caller's
-- resolved context) before deleting anything, so it can never touch
-- another trainee's row even if a client passed an id that isn't theirs.
create or replace function public.trainee_delete_progress_entry(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may delete their own progress entry.';
  end if;

  if p_log_id is null then
    raise exception 'A progress entry id is required.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null or v_coach_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  delete from public.trainee_progress_logs
  where id = p_log_id
    and trainee_id = v_trainee_id
    and coach_id = v_coach_id;

  if not found then
    raise exception 'Progress entry not found.';
  end if;
end;
$$;

revoke execute on function public.trainee_delete_progress_entry(uuid) from public;
revoke execute on function public.trainee_delete_progress_entry(uuid) from anon;
grant execute on function public.trainee_delete_progress_entry(uuid) to authenticated;

commit;
