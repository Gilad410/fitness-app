-- coach_barcode_products / Migration 046 Post-Migration Verification
-- (READ-ONLY).
--
-- Run this in the Supabase SQL Editor AFTER 046
-- (046_coach_barcode_products.sql) has been applied. No writes, no
-- transaction needed, safe to run any number of times. One combined
-- query, one result row -- table existence, columns, RLS, policies,
-- and the unique (coach_id, barcode) index all in a single pass.
--
-- Expected result (one row):
--   table_exists                          = true
--   column_count                          = 7
--   column_names                          = {barcode,calories_per_100g,coach_id,created_at,id,product_name,protein_per_100g}
--     (array_agg is ordered by ordinal_position, so the actual column
--     order in the row will be id, coach_id, barcode, product_name,
--     calories_per_100g, protein_per_100g, created_at -- alphabetized
--     here only because this comment can't show ordinal order)
--   rls_enabled                           = true
--   policy_count                          = 3
--   policy_names                          = {coach_barcode_products_insert_own,coach_barcode_products_select_own,coach_barcode_products_update_own}
--   unique_coach_barcode_index_exists     = true

with table_exists as (
  select count(*) > 0 as table_exists
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'coach_barcode_products'
),
columns_check as (
  select
    count(*) as column_count,
    array_agg(column_name order by ordinal_position) as column_names
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'coach_barcode_products'
),
rls_check as (
  select coalesce(bool_or(cls.relrowsecurity), false) as rls_enabled
  from pg_class cls
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname = 'coach_barcode_products'
),
policies_check as (
  select
    count(*) as policy_count,
    array_agg(policyname order by policyname) as policy_names
  from pg_policies
  where schemaname = 'public'
    and tablename = 'coach_barcode_products'
),
index_check as (
  select count(*) > 0 as unique_coach_barcode_index_exists
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'coach_barcode_products'
    and indexname = 'coach_barcode_products_coach_barcode_idx'
)
select
  table_exists.table_exists,
  columns_check.column_count,
  columns_check.column_names,
  rls_check.rls_enabled,
  policies_check.policy_count,
  policies_check.policy_names,
  index_check.unique_coach_barcode_index_exists
from table_exists, columns_check, rls_check, policies_check, index_check;
