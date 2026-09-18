-- coach_barcode_products / Migration 046 Preflight Check (READ-ONLY).
--
-- Run this in the Supabase SQL Editor BEFORE 046
-- (046_coach_barcode_products.sql). No writes, no transaction needed,
-- safe to run any number of times. Schema-agnostic (only WHERE-matches
-- against information_schema/pg_catalog/pg_policies, never a
-- ::regclass cast on coach_barcode_products itself -- a cast on a
-- non-existent relation errors instead of returning zero rows, which
-- would defeat the point), so it can never fail regardless of whether
-- 046 has already run.
--
-- Purpose: directly confirm whether public.coach_barcode_products
-- exists at all -- this is the diagnosed root cause of "approval not
-- remembered" (a barcode-approval save silently failing because the
-- table doesn't exist yet, non-blocking by design so the coach's
-- actual food log still saved, but the cache write never happened).

-- 1. Does the table exist at all? Expected right now: 0 rows (the
-- table does not exist yet -- this is the root cause). After 046 is
-- applied: 1 row.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'coach_barcode_products';

-- 2. If it exists, what does its actual column set look like -- catches
-- a partially-applied or hand-edited version diverging from the
-- migration file. Expected after 046: id, coach_id, barcode,
-- product_name, calories_per_100g, protein_per_100g, created_at.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coach_barcode_products'
order by ordinal_position;

-- 3. If it exists, is the unique (coach_id, barcode) index present --
-- this is what makes the store's upsert(..., {onConflict:
-- 'coach_id,barcode'}) work correctly rather than erroring or silently
-- duplicating.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'coach_barcode_products';

-- 4. If it exists, is row level security actually enabled -- a plain
-- WHERE match, not a ::regclass cast, so this returns zero rows (not
-- an error) when the table doesn't exist yet.
select cls.relrowsecurity
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and cls.relname = 'coach_barcode_products';

-- 5. If it exists, are the 3 expected policies present (select/insert/
-- update, each scoped to coach_id = auth.uid()). Uses the pg_policies
-- VIEW (schemaname/tablename/policyname/cmd/qual/with_check are its
-- real, documented, stable column names since Postgres 9.5) rather
-- than the raw pg_policy catalog table -- that table's actual columns
-- are polname/polcmd/polqual/polwithcheck, not the friendlier names an
-- earlier version of this query wrongly assumed (ERROR 42703: column
-- pol.cmd does not exist). A plain WHERE filter on this view, same as
-- every other query here, so it returns zero rows -- not an error --
-- when the table doesn't exist yet.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'coach_barcode_products';
