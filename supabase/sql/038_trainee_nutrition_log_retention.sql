-- Food Diary 7-Day Retention -- automatically and permanently deletes
-- trainee_nutrition_logs rows once they are more than 7 days old, based
-- on the entry's own logged eating date (logged_at) and the Asia/Jerusalem
-- calendar -- not server wall-clock time, not the row's created_at.
--
-- Explicit product decision (task 1 of a 5-task list): permanent
-- deletion, not soft-delete/archival. This migration does NOT touch any
-- other table -- trainee_nutrition_plans/_meals/_meal_items, foods,
-- food_reference_catalog, restaurant_food_items, and every other table in
-- this schema are completely untouched, both by the schema change below
-- and by the scheduled cleanup job it installs.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 037_nutrition_plan_meals_and_items.sql.
-- Wrapped in a single transaction so the schema/policy/function changes
-- apply entirely or not at all. The scheduled job it installs (section 5)
-- is intentionally OUTSIDE that guarantee only in the sense that
-- `cron.schedule` itself is a data change in the cron extension's own
-- tables, not a DDL statement -- but it is still inside the same `begin`/
-- `commit` block below, so it rolls back together with everything else if
-- any earlier statement in this file fails.
--
-- =====================================================================
-- Retention rule, precisely (this is what "expire on the 17th" means)
-- =====================================================================
-- An entry logged_at = 2026-01-10 must no longer be visible, and must be
-- physically deleted, once "today" in Asia/Jerusalem reaches 2026-01-17
-- -- exactly 7 days after the day it was logged. Framed as a cutoff date:
--
--   retained  <=>  logged_at >= (today_in_Jerusalem - 6)
--   expired   <=>  logged_at <  (today_in_Jerusalem - 6)
--
-- Worked example: today_in_Jerusalem = 2026-01-17  =>  cutoff = 2026-01-11.
-- logged_at = 2026-01-10 is < cutoff  => expired/deleted. logged_at =
-- 2026-01-11 is >= cutoff => still retained (it will expire itself the
-- following day, 01-18). "Today in Asia/Jerusalem" is derived via
-- `now() at time zone 'Asia/Jerusalem'` -- a NAMED IANA zone, not a fixed
-- UTC+2/UTC+3 offset, so it automatically follows Israel's actual DST
-- transitions using Postgres's own tzdata (the same mechanism every other
-- `at time zone` call in a standard Postgres/Supabase install already
-- relies on) -- this file does not hardcode or reimplement DST rules
-- itself. Month/year rollovers need no special handling either: `date -
-- integer` in Postgres is ordinary calendar arithmetic, not
-- string/component manipulation, so it already crosses month and year
-- boundaries correctly (e.g. 2026-01-02 - 6 = 2025-12-27).
--
-- =====================================================================
-- How visibility AND physical deletion are both guaranteed (three
-- layers, deliberately not just one)
-- =====================================================================
-- Layer 1 -- RLS (section 2/3 below): the retention cutoff is added
-- directly to BOTH existing SELECT policies on trainee_nutrition_logs
-- (the coach policy from 021_trainee_auth_and_roles.sql, and the trainee
-- policy from 022_trainee_nutrition_access.sql) -- not just filtered
-- client-side. This is what makes the rule apply identically, and
-- automatically, to every current and future QUERY against this table --
-- enforced at the row level regardless of how the row is asked for, and
-- impossible to bypass client-side. This is also EXACTLY what makes
-- "expired entries are excluded from reads even if the scheduled cleanup
-- hasn't run yet" true FOR A FRESH FETCH: a row past its cutoff stops
-- being selectable the instant the calendar day turns over in Jerusalem,
-- independent of when the physical DELETE below next runs.
-- Layer 2 -- client-side reactive re-filtering (independent review
-- correction; NOT part of this SQL file -- see
-- src/features/nutrition/lib/nutritionRetentionClock.js /
-- nutritionLogsCore.js): RLS on its own only ever filters a NEW query. It
-- does nothing for a row a store already fetched and cached BEFORE it
-- expired -- a nutrition screen left open across the Jerusalem
-- calendar-day boundary would keep showing/totaling that row until the
-- next fetch, with no fetch necessarily ever happening again once the
-- data is already loaded. A shared, reactive "today's cutoff" clock
-- (started on mount, stopped on unmount, re-checked periodically and on
-- tab focus/visibility restoration) feeds directly into both the coach's
-- nutritionLogs.js store and the trainee's traineeNutrition.js store's
-- getters (dailyTotalFor/dailyProteinTotalFor/etc., and the visible-entry
-- lists both views derive from them), so cached data currently on screen
-- is also excluded once it ages out -- not just the next fetch's result.
-- Layer 3 -- scheduled physical deletion (section 4/5 below): a
-- security-definer function, invoked on a daily schedule by pg_cron,
-- actually deletes rows past the same cutoff -- because the task
-- requires permanent deletion (not just permanent invisibility), and
-- because a table that only ever grows, with RLS hiding the old rows,
-- would still keep charging storage and slowing every future query
-- against it forever.
-- Layers 1 and 3 are the actual enforcement -- the server is always the
-- final authority on what exists and what's returned. Layer 2 is a
-- client-side courtesy on top of them, correcting a UI staleness gap;
-- it changes no permission and enforces nothing on its own.
--
-- =====================================================================
-- Ownership/RLS preserved, not weakened
-- =====================================================================
-- Both policies below are recreated with every existing condition kept
-- byte-for-byte (coach_id = auth.uid() + public.is_coach() + the trainees
-- ownership EXISTS check for the coach policy; public.is_trainee() + the
-- trainee_get_auth_context() row-consistency EXISTS check for the trainee
-- policy) -- the retention cutoff is purely an ADDITIONAL `and` condition,
-- narrowing what's visible, never loosening who can see their own data.
-- INSERT/UPDATE/DELETE policies (and the trainee's own
-- trainee_log_nutrition_entry()/trainee_delete_nutrition_entry() RPCs,
-- 033) are completely untouched -- a coach or trainee can still delete a
-- STILL-VISIBLE mis-logged entry manually exactly as before; the only
-- change is that a row past the retention cutoff is no longer visible
-- (and will shortly be physically removed) at all.
--
-- =====================================================================
-- No privileged credential exposed to the browser
-- =====================================================================
-- The scheduled cleanup runs entirely inside Postgres via the pg_cron
-- extension (section 5) -- no Edge Function, no HTTP call, no
-- service-role key anywhere in this design. cleanup_expired_nutrition_logs()
-- (section 4) is explicitly revoked from public/anon/authenticated, so it
-- is unreachable through the PostgREST API or any browser session
-- regardless -- it only ever runs as the role pg_cron schedules it under
-- (the database owner, which already has full table access and bypasses
-- RLS the same way every migration in this file does when run from the
-- SQL Editor).

begin;

-- =====================================================================
-- 1. Retention cutoff helper -- the single source of truth both RLS
--    policies below and the cleanup function use, so the rule can never
--    drift between "what's visible" and "what gets deleted".
-- =====================================================================
-- `stable`, not `immutable`: its result depends on now() and changes
-- across calls made at different times (immutable would let Postgres
-- wrongly cache/inline a stale result).
create or replace function public.trainee_nutrition_log_retention_cutoff()
returns date
language sql
stable
as $$
  select ((now() at time zone 'Asia/Jerusalem')::date - 6);
$$;

-- Harmless to expose -- returns only today's Jerusalem-shifted calendar
-- date minus 6 days, no table access, nothing sensitive -- but there is
-- no legitimate reason for the browser to call it directly either, so it
-- is left at Postgres's default (usable only where referenced, i.e.
-- inside the policies/function below and by any future server-side SQL)
-- rather than explicitly granted to anon/authenticated.

-- =====================================================================
-- 2. Coach SELECT policy on trainee_nutrition_logs -- adds the cutoff to
--    the policy exactly as it stands today (021_trainee_auth_and_roles.sql,
--    unmodified since). Every other condition preserved byte-for-byte.
-- =====================================================================
drop policy trainee_nutrition_logs_select_own on public.trainee_nutrition_logs;
create policy trainee_nutrition_logs_select_own on public.trainee_nutrition_logs
  for select
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and logged_at >= public.trainee_nutrition_log_retention_cutoff()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_nutrition_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 3. Trainee SELECT policy on trainee_nutrition_logs -- adds the cutoff
--    to the policy exactly as it stands today
--    (022_trainee_nutrition_access.sql, unmodified since). Every other
--    condition preserved byte-for-byte.
-- =====================================================================
drop policy trainee_nutrition_logs_select_own_trainee on public.trainee_nutrition_logs;
create policy trainee_nutrition_logs_select_own_trainee on public.trainee_nutrition_logs
  for select
  using (
    public.is_trainee()
    and logged_at >= public.trainee_nutrition_log_retention_cutoff()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_nutrition_logs.trainee_id
        and ctx.coach_id = trainee_nutrition_logs.coach_id
    )
  );

-- =====================================================================
-- 4. cleanup_expired_nutrition_logs() -- the only thing that physically
--    deletes rows. Scoped to exactly this one table; touches nothing
--    else. Returns the number of rows deleted (surfaced in
--    cron.job_run_details' return_message after each scheduled run, and
--    useful for a manual, reviewable dry check -- see the notes after
--    COMMIT below).
-- =====================================================================
create or replace function public.cleanup_expired_nutrition_logs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_count integer;
begin
  delete from public.trainee_nutrition_logs
  where logged_at < public.trainee_nutrition_log_retention_cutoff();

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- Deliberately reachable by NOBODY through the API -- this is a
-- cron-only/dashboard-admin-only operation, never something a coach or
-- trainee session should be able to trigger on demand (a mass-delete of
-- diary history is not a feature either role has been given anywhere
-- else in this schema). Explicit revokes from all three roles, not just
-- `public` -- see 033_pre_pilot_security_hardening.sql's own finding
-- that revoking from PUBLIC alone does not reliably remove a
-- function-creation-time default grant already made directly to anon in
-- this project.
revoke execute on function public.cleanup_expired_nutrition_logs() from public;
revoke execute on function public.cleanup_expired_nutrition_logs() from anon;
revoke execute on function public.cleanup_expired_nutrition_logs() from authenticated;

-- =====================================================================
-- 5. Scheduled invocation -- pg_cron, Supabase's built-in Postgres
--    extension for exactly this kind of server-side scheduled job. No
--    Edge Function, no external scheduler, no HTTP call, no credential of
--    any kind involved.
-- =====================================================================
-- Idempotent to enable: a no-op if already enabled on this project.
create extension if not exists pg_cron;

-- Idempotent to (re)schedule: unschedules any existing job with this
-- exact name first, so re-running this migration file never creates a
-- second, duplicate daily job -- regardless of which pg_cron version is
-- installed (some versions upsert by job name on their own; this does
-- not rely on that). Guarded by an explicit `if exists` check against
-- cron.job, not a blanket `exception when others` -- so a genuine
-- failure inside cron.unschedule() (e.g. a permissions problem, or the
-- pg_cron extension itself being unavailable, see the note at the end of
-- this file) still surfaces as an error and aborts this transaction,
-- rather than being silently swallowed alongside the one truly expected
-- condition ("no job with this name exists yet").
do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'trainee-nutrition-logs-retention-cleanup'
  ) then
    perform cron.unschedule('trainee-nutrition-logs-retention-cleanup');
  end if;
end;
$$;

-- 01:00 UTC daily. Asia/Jerusalem is UTC+2 (winter/IST) or UTC+3
-- (summer/IDT) -- 01:00 UTC is therefore always 03:00 or 04:00 local
-- Jerusalem time, safely after local midnight year-round, so each day's
-- newly-expired rows are cleaned up promptly after that day turns over
-- locally (not, e.g., still mid-afternoon the previous Jerusalem day).
-- The exact run time is not itself part of the correctness guarantee,
-- though -- see the RLS layer above -- it only affects how promptly
-- storage is actually reclaimed after a row becomes invisible.
select cron.schedule(
  'trainee-nutrition-logs-retention-cleanup',
  '0 1 * * *',
  $$select public.cleanup_expired_nutrition_logs();$$
);

commit;

-- =====================================================================
-- Before you run this: read-only preview of the INITIAL cleanup's impact
-- (changes nothing; counts and a date range only -- no trainee_id,
-- coach_id, food/restaurant references, calories, or any other personal
-- or identifying data). Safe to run before OR after this migration is
-- applied -- it does not depend on anything this file creates.
-- =====================================================================
--   select
--     count(*) as would_be_deleted_count,
--     min(logged_at) as oldest_logged_at,
--     max(logged_at) as newest_logged_at_among_expired
--   from public.trainee_nutrition_logs
--   where logged_at < ((now() at time zone 'Asia/Jerusalem')::date - 6);
--
-- For context alongside it -- how many rows exist in total, and how many
-- would remain retained (also counts/dates only):
--
--   select
--     count(*) as total_rows,
--     count(*) filter (
--       where logged_at >= ((now() at time zone 'Asia/Jerusalem')::date - 6)
--     ) as would_remain_retained,
--     min(logged_at) as earliest_logged_at_overall,
--     max(logged_at) as latest_logged_at_overall
--   from public.trainee_nutrition_logs;
--
-- =====================================================================
-- After applying: how to verify the scheduled job itself (read-only)
-- =====================================================================
--   -- Confirms the job is registered, with the expected name/schedule/command:
--   select jobname, schedule, command, active from cron.job
--   where jobname = 'trainee-nutrition-logs-retention-cleanup';
--
--   -- After its first scheduled run (or a manual
--   -- `select public.cleanup_expired_nutrition_logs();` -- see below),
--   -- confirms it actually executed and how many rows it deleted:
--   select runid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   where jobid = (
--     select jobid from cron.job
--     where jobname = 'trainee-nutrition-logs-retention-cleanup'
--   )
--   order by start_time desc
--   limit 5;
--
-- =====================================================================
-- Manually running the initial cleanup (NOT run by this file --
-- deliberately left for the user to trigger explicitly once its impact
-- has been reviewed via the preview query above)
-- =====================================================================
--   select public.cleanup_expired_nutrition_logs();
-- Returns the number of rows it deleted. Running this manually once
-- (rather than waiting for the next 01:00 UTC scheduled run) is optional
-- -- the scheduled job will pick up the exact same rows on its own on its
-- next run either way, since the cutoff is computed fresh each time, not
-- stored.
--
-- =====================================================================
-- If pg_cron is not available on this project
-- =====================================================================
-- pg_cron is a standard Supabase Postgres extension, but if `create
-- extension if not exists pg_cron;` above fails (e.g. a project
-- configuration that restricts it), it can also be enabled first via the
-- Supabase Dashboard -> Database -> Extensions -> pg_cron toggle (or the
-- newer Dashboard -> Integrations -> Cron UI, which manages the same
-- underlying pg_cron jobs without needing raw SQL) before re-running this
-- file.
