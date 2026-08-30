-- =============================================================================
-- Pre-Pilot Security & Permissions Verification (READ-ONLY)
-- =============================================================================
-- Purpose: live-database companion to the repository-based security audit.
-- Every statement below is a plain SELECT (or a read-only pg_catalog /
-- information_schema query) -- nothing here inserts, updates, deletes,
-- alters, creates, drops, grants, revokes, opens a transaction, calls a
-- data-modifying function, or builds/executes dynamic SQL. It is safe to
-- paste this entire file into the Supabase Dashboard -> SQL Editor and run
-- it as one script, and safe to re-run at any time -- it changes nothing.
--
-- How to use: run the whole file, then read each section's result set in
-- order. Section headers below map 1:1 to the audit report's structure.
-- Where a query is intended to be compared against a specific expected
-- value (e.g. "should be true", "should list exactly these three rows"),
-- that expectation is written directly above the query as a comment.
--
-- Privilege note: every query here only reads catalog metadata
-- (pg_catalog / information_schema) or application data your own project
-- already owns. Run as the default Supabase SQL Editor role (which
-- connects as a superuser-equivalent role on your own project) -- no
-- special elevation is required. One sub-section (B, table ACLs via
-- aclexplode) is included as a cross-check specifically because the
-- simpler information_schema views can under-report grants that come from
-- schema-level default privileges rather than a per-table GRANT; both are
-- included so the two can be compared.
--
-- Privacy note: no query in this file selects trainee email, phone,
-- coach/trainee names, notes, invite tokens, or any auth.users column
-- other than trigger wiring (auth.users itself is never read from).
-- Section F/G intentionally return only ids, statuses, booleans, and
-- counts -- never a name, email, or token.
-- =============================================================================


-- =============================================================================
-- SECTION A -- Row Level Security: enablement + full policy listing
-- =============================================================================

-- A1. RLS enabled/forced, every table in the public (application) schema.
-- Expect: relrowsecurity = true for every table listed in the audit's
-- ownership map (trainees, trainee_progress_logs, trainee_nutrition_logs,
-- foods, trainee_circumference_logs, trainee_progress_photos,
-- trainee_training_programs, trainee_program_workouts,
-- trainee_workout_exercises, trainee_notifications,
-- trainee_exercise_submission_videos, food_reference_catalog,
-- restaurant_food_items, exercise_reference_catalog, user_roles).
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced_on_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- A2. Every RLS policy on every public-schema table -- name, command,
-- roles it applies to, USING expression, WITH CHECK expression. Compare
-- row-by-row against the audit report's RLS matrix (section 2).
select
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- A3. Every RLS policy on storage.objects (all buckets) -- same shape as
-- A2, isolated here because storage policies are the ones most often
-- affected by the folder-path regex bugs discussed in the audit (findings
-- around migrations 027-029).
select
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;


-- =============================================================================
-- SECTION B -- Grants: tables, columns, and RPC execute privileges
-- =============================================================================

-- B1. Table-level grants to anon / authenticated / public, standard view.
-- Expect: broad default grants are normal in Supabase (RLS is the real
-- gate) -- the point of this query is to see the raw list, not to expect
-- it to be narrow.
select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- B2. Column-level grants to anon / authenticated / public. Expect to see
-- the narrowed UPDATE column lists from migrations 021 (trainees:
-- full_name, email, phone, notes, start_date, goal, starting_weight,
-- target_weight, status, starting_*_cm -- NOT auth_user_id/invite_*) and
-- 030 (trainee_exercise_submission_videos: storage_path, original_name,
-- mime_type, file_size_bytes, submitted_at -- NOT reviewed_at/coach_note).
select
  table_schema,
  table_name,
  column_name,
  grantee,
  privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, column_name;

-- B3. Cross-check on B1: raw ACLs straight from pg_class, exploded to one
-- row per (table, grantee, privilege). This can surface anything B1 might
-- under-report if privileges were assigned in a way information_schema's
-- "currently enabled role" framing doesn't fully reflect. A null acl_entry
-- for a table means it has no explicit ACL beyond the owner's implicit
-- full rights (or relies purely on schema-level default privileges, which
-- neither this query nor B1 can see -- if a table here shows no rows at
-- all but B1 also shows nothing for it, cross-check in the Dashboard).
select
  c.relname as table_name,
  (aclexplode(c.relacl)).grantee::regrole::text as grantee,
  (aclexplode(c.relacl)).privilege_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relacl is not null
order by table_name, grantee;

-- B4. RPC (function) execute grants to anon / authenticated / public.
-- Expect: NO row anywhere with grantee = 'anon' for any trainee_*/coach_*
-- function -- every RPC in 021-031 explicitly revokes from public and
-- grants only to authenticated.
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by routine_name, grantee;


-- =============================================================================
-- SECTION C -- Functions and RPCs: signatures, SECURITY DEFINER, search_path
-- =============================================================================

-- C1. Every function in the public schema -- signature, whether it is
-- SECURITY DEFINER, and its configured settings (search_path shows up
-- inside proconfig, e.g. {search_path=public,pg_temp}). Expect: every
-- SECURITY DEFINER function shows a proconfig entry pinning search_path --
-- none should be security definer with a null/empty proconfig.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as is_security_definer,
  p.proconfig as configured_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- C2. Full source of every security-relevant function named in the audit
-- report, for direct inspection of its role/ownership checks (and, for
-- Finding F1, whether it filters on trainees.status anywhere). Read the
-- "full_definition" column for each row.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'is_coach',
    'is_trainee',
    'trainee_get_auth_context',
    'trainee_get_own_profile',
    'trainee_get_own_starting_circumferences',
    'trainee_get_active_training_program',
    'trainee_can_view_exercise_video',
    'trainee_can_submit_exercise_video',
    'trainee_can_access_submission_video',
    'coach_mark_submission_reviewed',
    'coach_issue_trainee_invite',
    'coach_cancel_trainee_invite',
    'coach_unlink_trainee_account',
    'trainee_log_nutrition_entry',
    'trainee_delete_nutrition_entry',
    'trainee_log_progress_entry',
    'trainee_delete_progress_entry',
    'trainee_log_circumference_entry',
    'trainee_delete_circumference_entry',
    'trainee_mark_notification_read',
    'link_trainee_on_email_confirmed',
    'handle_deleted_trainee_auth_user'
  ])
order by p.proname;


-- =============================================================================
-- SECTION D -- Migration 021 protections: functions, policies, triggers
-- =============================================================================

-- D1. Confirm the six invite/identity columns from 021 exist on trainees.
-- Expect: exactly 6 rows.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trainees'
  and column_name in (
    'auth_user_id', 'invite_token', 'invite_status',
    'invite_sent_at', 'invite_expires_at', 'invite_accepted_at'
  )
order by column_name;

-- D2. Confirm the invite-state consistency CHECK constraint from 021
-- exists, and read its exact definition.
select
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname = 'trainees'
  and conname = 'trainees_invite_state_consistent';

-- D3. Confirm the three auth.users triggers from 021 exist AND are
-- enabled. tgenabled meaning: 'O' = enabled (normal/"origin"), 'D' =
-- disabled, 'R' = enabled only for replication, 'A' = always enabled.
-- Expect: exactly 3 rows, every one showing 'O'.
select
  tgname as trigger_name,
  case tgenabled
    when 'O' then 'enabled'
    when 'D' then 'DISABLED'
    when 'R' then 'enabled (replica only)'
    when 'A' then 'enabled (always)'
    else tgenabled::text
  end as trigger_status,
  tgrelid::regclass::text as table_name
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and tgname in (
    'on_auth_user_created_link_trainee',
    'on_auth_user_confirmed_link_trainee',
    'on_auth_user_deleted_unlink_trainee'
  )
order by tgname;

-- D4. Confirm public.user_roles exists, has RLS enabled, and its one
-- expected SELECT policy.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_roles';

select
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression
from pg_policies
where schemaname = 'public' and tablename = 'user_roles';


-- =============================================================================
-- SECTION E -- Storage: bucket configuration and policies
-- =============================================================================

-- E1. Bucket configuration for all three private buckets used by the app.
-- Expect: public = false for all three; file_size_limit/allowed_mime_types
-- matching the audit report's table (progress-photos: 8388608 bytes,
-- jpeg/png/webp; exercise-videos and exercise-submission-videos: 52428800
-- bytes, mp4/webm/quicktime).
select
  id as bucket_id,
  name as bucket_name,
  public as is_public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('progress-photos', 'exercise-videos', 'exercise-submission-videos')
order by id;

-- E2. Every storage.objects policy scoped to the progress-photos bucket
-- (coach + trainee read/upload/replace/delete). Expect: no UPDATE policy
-- for either role (delete + re-upload convention).
select
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (qual ilike '%progress-photos%' or with_check ilike '%progress-photos%')
order by policyname;

-- E3. Every storage.objects policy scoped to the exercise-videos bucket
-- (coach instructional video: select/insert/update/delete; trainee:
-- select only). Expect: zero INSERT/UPDATE/DELETE rows for any policy
-- whose using/with_check implies the trainee role.
select
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike 'exercise_videos_%'
order by policyname;

-- E4. Every storage.objects policy scoped to the
-- exercise-submission-videos bucket (trainee: select/insert/update/
-- delete; coach: select/delete only). Expect: no coach INSERT/UPDATE row.
select
  policyname as policy_name,
  cmd as command,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike 'exercise_submission_videos_%'
order by policyname;


-- =============================================================================
-- SECTION F -- Account and role sanity (counts only -- no PII)
-- =============================================================================

-- F1. Accounts per role. Expect: every real coach and every onboarded
-- trainee appears exactly once (user_id is the table's primary key, so a
-- duplicate role per account is already structurally impossible).
select
  role,
  count(*) as account_count
from public.user_roles
group by role
order by role;

-- F2. Trainees grouped by status, regardless of whether they have a
-- linked login yet.
select
  status,
  count(*) as trainee_count
from public.trainees
group by status
order by status;

-- F3. Only trainees that HAVE a linked login (auth_user_id is not null),
-- grouped by status. This is the population Finding F1 is about.
select
  status,
  count(*) as linked_trainee_count
from public.trainees
where auth_user_id is not null
group by status
order by status;

-- F4. Single number: how many linked trainees are currently paused or
-- archived -- i.e. how many accounts Finding F1 potentially affects today.
select
  count(*) as linked_paused_or_archived_count
from public.trainees
where auth_user_id is not null
  and status in ('paused', 'archived');


-- =============================================================================
-- SECTION G -- Finding F1: does a paused/archived trainee retain access?
-- =============================================================================
-- This section only gathers metadata to let you manually decide who to
-- test with, and lets you read the relevant function bodies directly (see
-- C2 above). It does NOT change any trainee's status and does NOT
-- impersonate any user -- the only way to actually confirm live behavior
-- is to sign in through the app itself as a real linked trainee whose
-- status is not 'active' (if one exists in F4's count) and observe
-- whether the dashboard/logging still works, exactly as the audit
-- report's verification plan describes.

-- G1. Non-PII identification of linked trainees whose status is not
-- 'active' -- id, status, and account-linked flag only (no name, email,
-- phone, or notes). Use one of these trainee ids only to recognize which
-- coach-side record corresponds to whichever account you choose to test
-- with in the app -- never to look up or expose that trainee's personal
-- details from this script.
select
  id as trainee_id,
  status,
  (auth_user_id is not null) as has_linked_account,
  created_at
from public.trainees
where auth_user_id is not null
  and status <> 'active'
order by status, created_at;

-- G2. Direct textual check: does the live trainee_get_auth_context()
-- definition filter on status anywhere? (Complements C2 -- this narrows
-- straight to a yes/no on the one function almost everything else in the
-- schema is anchored on.) is_status_checked = true would mean Finding F1
-- is already fixed live even if the repository copy you reviewed doesn't
-- show it (e.g. a hotfix was applied directly in the SQL Editor).
select
  p.proname as function_name,
  (pg_get_functiondef(p.oid) ilike '%status%') as mentions_status_anywhere,
  (pg_get_functiondef(p.oid) ilike '%status = ''active''%') as filters_on_active_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'trainee_get_auth_context',
    'trainee_get_own_profile',
    'trainee_get_own_starting_circumferences'
  )
order by p.proname;

-- =============================================================================
-- End of script -- no statement above modifies any data, schema, role,
-- grant, or session state.
-- =============================================================================
