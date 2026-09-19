-- Read-only post-migration verification for
-- 048_barcode_nutrition_basis_preferences.sql. Safe to run any time,
-- any number of times -- never writes anything.

select
  (select to_regclass('public.barcode_nutrition_basis_preferences') is not null) as table_exists,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'barcode_nutrition_basis_preferences') as column_count,
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'barcode_nutrition_basis_preferences') as rls_enabled,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'barcode_nutrition_basis_preferences') as policy_count,
  (select count(*) from pg_indexes
     where schemaname = 'public' and tablename = 'barcode_nutrition_basis_preferences'
       and indexname = 'barcode_nutrition_basis_preferences_user_barcode_idx') as unique_index_exists,
  (select count(*) from pg_constraint co join pg_class c on c.oid = co.conrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'barcode_nutrition_basis_preferences'
       and co.conname = 'barcode_nutrition_basis_preferences_basis_shape') as basis_shape_check_exists;

-- Expected: table_exists=true, column_count=8, rls_enabled=true,
-- policy_count=3, unique_index_exists=1, basis_shape_check_exists=1.
