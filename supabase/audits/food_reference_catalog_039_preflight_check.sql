-- Food Reference Catalog Migration Preflight Check -- run this FIRST,
-- before 039_food_reference_catalog_metadata.sql, and share the results.
--
-- READ-ONLY. No writes, no transaction, nothing to roll back. Does not
-- reference category/basis/source_* at all, on purpose -- unlike an
-- earlier (broken) attempt at a preflight query, this one only ever
-- references columns that have existed since 004_food_reference_catalog.sql
-- (id, name, calories_per_100g, protein_per_100g), so it can never fail
-- with "column does not exist" regardless of whether 039 has ever been
-- run or partially run before.
--
-- Why this is needed: 039 has now failed three times against the live
-- database in ways this session's local copy of the migration history
-- (005/006/007/008) did not predict -- most recently because the live
-- table apparently holds rows outside the 349 those files account for.
-- Rather than guess a fourth time, this reports the real current state
-- directly.

-- 1. Does food_reference_catalog currently have any of the columns 039
--    would add? (Expected: no rows -- both prior failed attempts were
--    wrapped in begin;/commit; and should have rolled back completely,
--    including the ALTER TABLE. A non-empty result here means something
--    is NOT as expected and 039 needs to account for it before running.)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'food_reference_catalog'
order by ordinal_position;

-- 2. Exact current row count (expected: 349, per this repo's
--    005/006/007 migration history and migration 008's own comment).
select count(*) as current_row_count
from public.food_reference_catalog;

-- 3. The 20 newest rows by created_at -- helps spot whether the extra
--    rows behind result #2 not matching 349 were added recently (e.g.
--    by hand in the SQL Editor at some point) vs. having always been
--    part of the original seed.
select id, name, calories_per_100g, protein_per_100g, created_at
from public.food_reference_catalog
order by created_at desc, name
limit 20;
