-- trainee_nutrition_logs / Migration 045 Preflight Check (READ-ONLY).
--
-- Run this in the Supabase SQL Editor BEFORE 045
-- (045_trainee_nutrition_logs_barcode_source.sql). No writes, no
-- transaction needed, safe to run any number of times. Schema-agnostic
-- (only references columns/objects that predate 045), so it can never
-- fail regardless of whether 045 has already run.
--
-- Purpose: independently confirm, before touching the table, that (a)
-- none of the 5 column names 045 is about to add already exist under a
-- different meaning, and (b) every existing row already satisfies
-- exactly one of the two current sources -- the assumption 045's own
-- ADD CONSTRAINT relies on to apply cleanly with zero data changes.

-- 1. Current columns on trainee_nutrition_logs -- confirm none of
-- barcode / barcode_source / barcode_product_name /
-- barcode_calories_per_100g / barcode_protein_per_100g already exist.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trainee_nutrition_logs'
order by ordinal_position;

-- 2. Confirm the constraint 045 is about to drop-and-replace actually
-- exists under the expected name (from 011_restaurant_nutrition_logs.sql).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.trainee_nutrition_logs'::regclass
  and contype = 'c';

-- 3. Row-level check: every existing row must satisfy exactly one of
-- the two current sources. Expected: total_rows = food_id_rows +
-- restaurant_item_rows, and neither_source_rows = 0. If
-- neither_source_rows is anything but 0, STOP -- do not run 045 --
-- and report back before proceeding; it would mean 011's own
-- constraint already has an unexpected gap, unrelated to this change.
select
  count(*) as total_rows,
  count(*) filter (where food_id is not null) as food_id_rows,
  count(*) filter (where restaurant_food_item_id is not null) as restaurant_item_rows,
  count(*) filter (where food_id is null and restaurant_food_item_id is null) as neither_source_rows
from public.trainee_nutrition_logs;

-- 4. Confirm the trigger function 045 is about to replace exists under
-- the expected name (from 003_nutrition.sql, extended by 011).
select proname
from pg_proc
where proname = 'set_nutrition_log_calories';
