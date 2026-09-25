-- Read-only preflight for
-- 049_food_reference_catalog_multi_source_infrastructure.sql. Safe to
-- run any time, any number of times -- never writes anything. Every
-- column referenced here predates 049 (exists since 004/039), so this
-- can never itself fail the way an early 039 preflight once did by
-- referencing a column only that migration's own ALTER TABLE creates.

select
  count(*) as current_total_rows,
  count(*) filter (where calories_per_100g is null) as rows_missing_calories,
  count(*) filter (where protein_per_100g is null) as rows_missing_protein,
  count(*) filter (where calories_per_100g > 900) as rows_that_would_violate_new_calorie_bound,
  count(*) filter (where protein_per_100g > 100) as rows_that_would_violate_new_protein_bound,
  max(calories_per_100g) as max_calories_per_100g,
  max(protein_per_100g) as max_protein_per_100g,
  count(*) filter (where source_name is not null) as rows_with_existing_039_source_name,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'food_reference_catalog'
       and exists (
         select 1 from information_schema.columns col
         where col.table_schema = 'public' and col.table_name = 'food_reference_catalog'
           and col.column_name = 'source'
       )
  ) as source_column_already_exists -- expect 0: 049 must not already be applied
from public.food_reference_catalog;

-- Expected, per the accompanying audit report (reconstructed from the
-- migration history, cross-checked against the existing, already-
-- passing tests in foodCatalogRealData.test.mjs) -- CORRECTED after a
-- real run of this exact query returned 505, not the 503 an earlier
-- draft assumed: the true live baseline is migration 040's state (039
-- corrections/backfill + 040 inserts), NOT 041's -- 041's file is
-- merged into git (PR #2) but has never actually been run against
-- Supabase. See "The 503 vs. 505 discrepancy" in
-- food_reference_catalog_multi_source_audit_2026-09-20.md for the full
-- investigation.
--   current_total_rows = 505 (confirmed by a real run of this query)
--   rows_missing_calories = 0, rows_missing_protein = 0 (both columns
--     are NOT NULL since 004/005 -- this just double-checks live data
--     matches that guarantee) -- confirmed
--   rows_that_would_violate_new_calorie_bound = 0 -- confirmed
--   rows_that_would_violate_new_protein_bound = 0
--   max_calories_per_100g = 900 (exactly, a pure-fat/oil row)
--   max_protein_per_100g ~= 31.7 (the pre-041 value; 041, once applied,
--     would correct one row's protein down to 31.02, still nowhere
--     near the 100 ceiling either way)
--   source_column_already_exists = 0
-- If any of these differ from THIS expectation, STOP and report the
-- actual result before running 049 -- do not proceed on an assumption.
