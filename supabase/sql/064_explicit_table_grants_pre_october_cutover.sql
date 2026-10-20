-- Explicit table-level grants for every table that today relies entirely
-- on Postgres's project-wide default privileges -- requested by the
-- product owner after a Supabase notice: "new tables in public need
-- explicit grants from October 30, 2026."
--
-- WHY THIS MIGRATION EXISTS AT ALL. Per Supabase's own changelog
-- (github.com/orgs/supabase/discussions/45329): existing tables "keep
-- their current grants and stay reachable" through the October 30
-- cutover -- nothing here is required for today's app to keep working.
-- Every table this migration touches already works today purely through
-- Postgres's implicit default privileges (SELECT/INSERT/UPDATE/DELETE to
-- anon/authenticated/service_role, auto-granted the moment a new table
-- is created in this project's public schema).
-- This migration makes those same privileges EXPLICIT, as insurance: it
-- removes any dependency on an implicit, project-level setting that
-- could in principle be reset (by Supabase, or by a future "opt in to
-- the new default" toggle the project owner flips without realizing
-- these tables still lean on it) -- and, at the same time, follows the
-- exact least-privilege pattern the three most recent new-table
-- migrations already established (059_owner_global_and_trainee_personal_foods.sql,
-- 061_coach_seat_limits_and_privacy.sql, 062_workout_sessions.sql), which
-- this migration deliberately does NOT touch again.
--
-- HOW EACH TABLE'S GRANT WAS DECIDED -- EVIDENCE, NOT GUESSING. Every
-- verb granted below was verified against the actual frontend code (every
-- `supabase.from('<table>')` call site, across every .js/.vue file, cross-
-- checked against PostgREST embedded-relation selects too -- e.g.
-- NutritionPlanSection's PLAN_SELECT embeds trainee_nutrition_plan_meals
-- and trainee_nutrition_plan_meal_items as nested resources even though
-- neither is ever named in a literal `.from(...)` call, which still
-- requires SELECT on both). Three groups:
--
--   1. ACTIVELY READ AND WRITTEN BY THE APP -- granted exactly the verbs
--      (select/insert/update/delete) evidence showed the app actually
--      uses. Nothing wider, nothing narrower than today's real usage.
--   2. READ-ONLY REFERENCE/CATALOG DATA -- never written by the app
--      (populated by admin SQL/import scripts only, e.g. the food-catalog
--      import batches) -- granted SELECT only.
--   3. RPC-ONLY, NO DIRECT FRONTEND ACCESS AT ALL -- grepped the entire
--      frontend for any `.from('<table>')` reference and found none.
--      Matches the exact pattern 061/062 already use for their own new
--      RPC-only tables: no table-level grant to any client role at all,
--      not even SELECT -- every legitimate access already goes through a
--      SECURITY DEFINER RPC, which runs with the function owner's
--      privileges regardless of the caller's own table-level grants, so
--      this adds zero functional restriction.
--
-- In every case, `anon` is revoked entirely -- RLS already made it
-- functionally moot everywhere (every policy in this schema requires
-- is_coach()/is_trainee()/auth.uid(), all false/null for an unauthenticated
-- request), so this closes needlessly broad surface area without
-- changing what any real request can do. `public` is revoked too, which
-- is the same defense-in-depth idiom 059/061/062 already use.
--
-- WHY EVERY STATEMENT IS GUARDED BY to_regclass() -- LEARNED THE HARD
-- WAY. The first version of this migration assumed every table a
-- supabase/sql/*.sql file creates still exists in the live database.
-- Running it live immediately failed with `42P01: relation
-- "public.trainee_nutrition_plan_items" does not exist` -- this repo's
-- migration files are hand-applied, one at a time, over a long history
-- (no Supabase CLI/migration tracking), so a table a migration file
-- creates is not proof it is still there today; it may never have been
-- applied as written, or may have been dropped by some later, unrecorded
-- cleanup. Postgres rolled the ENTIRE transaction back on that single
-- failure (begin;/commit; makes the whole script one unit), so nothing
-- was actually changed in the database by that attempt -- but it also
-- meant the other 23 tables were never reached. Every statement below is
-- now wrapped so a table that turns out not to exist is skipped with a
-- NOTICE instead of aborting the whole migration -- the helper function
-- lives in pg_temp (session-local; it is not left behind in the schema
-- after this script finishes) and is the only new object this migration
-- creates.
--
-- trainee_nutrition_plan_items (035) is now CONFIRMED absent from this
-- project's live database (not merely "no frontend references", which
-- was this migration's original, weaker evidence) -- consistent with it
-- having been superseded by the meals/items split in
-- 037_nutrition_plan_meals_and_items.sql before ever being relied on.
--
-- A SECOND REAL BUG, ALSO FOUND BY RUNNING THIS LIVE. That same corrected
-- run completed without error, but a follow-up read of
-- information_schema.table_privileges showed every group 1/2 table still
-- carrying the FULL original implicit grant to authenticated (SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) -- the intended
-- narrowing never took effect. Root cause: the helper's REVOKE only
-- named `public, anon`, never `authenticated`, before granting the
-- narrower verb list -- and GRANT only ever ADDS a privilege, it never
-- removes one, so the already-broader implicit grant on authenticated
-- simply stayed in place underneath the new, narrower-looking grant.
-- Group 3 (RPC-only) tables were unaffected by this, and correctly
-- showed `(none)`, only because that branch already revoked from
-- authenticated too. Fixed by revoking from public, anon, AND
-- authenticated unconditionally, for every table, before any grant.
-- Nothing was ever functionally broken by this (the effective privilege
-- was wider than intended, never narrower, so every app code path still
-- worked) -- but the actual goal of this migration, explicit
-- least-privilege grants, was not met until this fix. Re-running this
-- corrected version is safe and idempotent: REVOKE ALL then GRANT the
-- intended verbs converges to the same end state regardless of what was
-- there before.
--
-- WHAT THIS MIGRATION DOES NOT DO: it does not touch any RLS policy, any
-- function in the public schema, any column, any row of data, or the
-- three tables already using explicit grants (trainee_custom_foods,
-- privacy_acceptances, trainee_workout_sessions/trainee_workout_set_logs).
-- It is GRANT/REVOKE statements only, plus the one session-local helper
-- function described above.

begin;

create or replace function pg_temp.explicit_grant_if_exists(p_table text, p_verbs text)
returns void
language plpgsql
as $fn$
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'Skipping %: no such table in this database.', p_table;
    return;
  end if;

  -- REVOKE from every client role FIRST, always -- including
  -- authenticated, even for groups 1/2 that grant it something back
  -- right after. GRANT only ever ADDS privileges, it never narrows an
  -- existing broader one; skipping this revoke for authenticated was
  -- the actual bug in this migration's first live run, confirmed by
  -- querying information_schema.table_privileges afterwards -- every
  -- table in groups 1/2 still carried the full original implicit grant
  -- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) because
  -- authenticated was never revoked, only added to.
  execute format('revoke all on public.%I from public, anon, authenticated', p_table);
  if p_verbs is not null then
    execute format('grant %s on public.%I to authenticated', p_verbs, p_table);
  end if;
end;
$fn$;

-- =====================================================================
-- 1. Actively read and written by the app -- exact verbs per table.
-- =====================================================================

select pg_temp.explicit_grant_if_exists('trainees', 'select, insert, update');

-- Immutable log entries -- add/remove only, never edited in place.
select pg_temp.explicit_grant_if_exists('trainee_progress_logs', 'select, insert, delete');

-- Coach's own food catalog -- soft-deleted via the archived_at column
-- (013_foods_archived_at.sql), never a real DELETE.
select pg_temp.explicit_grant_if_exists('foods', 'select, insert, update');

select pg_temp.explicit_grant_if_exists('trainee_nutrition_logs', 'select, insert, delete');
select pg_temp.explicit_grant_if_exists('trainee_circumference_logs', 'select, insert, delete');
select pg_temp.explicit_grant_if_exists('trainee_progress_photos', 'select, insert, delete');

-- Programs are deactivated via a status column, never deleted.
select pg_temp.explicit_grant_if_exists('trainee_training_programs', 'select, insert, update');

select pg_temp.explicit_grant_if_exists('trainee_program_workouts', 'select, insert, update, delete');
select pg_temp.explicit_grant_if_exists('trainee_workout_exercises', 'select, insert, update, delete');

-- Marking a notification read goes through trainee_mark_notification_read()
-- (a SECURITY DEFINER RPC, unaffected by this table's own grants) -- the
-- client never UPDATEs this table directly.
select pg_temp.explicit_grant_if_exists('trainee_notifications', 'select, insert');

select pg_temp.explicit_grant_if_exists('trainee_exercise_submission_videos', 'select, insert, update, delete');
select pg_temp.explicit_grant_if_exists('trainee_nutrition_plans', 'select, insert, update, delete');

-- SELECT is required here even though no frontend file ever writes
-- `.from('trainee_nutrition_plan_meals')... .select(...)` on its own:
-- NutritionPlanSection's PLAN_SELECT embeds this table (and, nested
-- inside it, trainee_nutrition_plan_meal_items) as a PostgREST embedded
-- resource when reading the parent trainee_nutrition_plans row.
select pg_temp.explicit_grant_if_exists('trainee_nutrition_plan_meals', 'select, insert, update, delete');
select pg_temp.explicit_grant_if_exists('trainee_nutrition_plan_meal_items', 'select, insert, update, delete');

-- upsert() needs both INSERT and UPDATE (it compiles to
-- INSERT ... ON CONFLICT DO UPDATE), in addition to the SELECT already
-- used to list the coach's saved products/preferences.
select pg_temp.explicit_grant_if_exists('coach_barcode_products', 'select, insert, update');
select pg_temp.explicit_grant_if_exists('barcode_nutrition_basis_preferences', 'select, insert, update');

-- =====================================================================
-- 2. Read-only reference/catalog data -- never written by the app.
-- =====================================================================

select pg_temp.explicit_grant_if_exists('food_reference_catalog', 'select');
select pg_temp.explicit_grant_if_exists('restaurant_food_items', 'select');
select pg_temp.explicit_grant_if_exists('exercise_reference_catalog', 'select');

-- Written only by server-side triggers/RPCs (021/056/057) -- the
-- frontend only ever reads its own role.
select pg_temp.explicit_grant_if_exists('user_roles', 'select');

-- =====================================================================
-- 3. RPC-only -- no direct frontend access found anywhere in the app.
-- Matches the exact "revoke all, RPC-only" pattern 061/062 already use
-- for their own new tables. p_verbs = null means "revoke from
-- authenticated too, grant nothing".
-- =====================================================================

select pg_temp.explicit_grant_if_exists('coaches', null);
select pg_temp.explicit_grant_if_exists('coach_status_history', null);
select pg_temp.explicit_grant_if_exists('coach_invitations', null);

-- Confirmed absent from this project's live database (see header) --
-- kept here, guarded, so this migration stays correct and self-
-- documenting if the table is ever recreated, and harmless (a single
-- NOTICE, nothing else) for as long as it remains gone.
select pg_temp.explicit_grant_if_exists('trainee_nutrition_plan_items', null);

commit;
