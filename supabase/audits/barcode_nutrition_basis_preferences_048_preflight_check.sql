-- Read-only preflight for 048_barcode_nutrition_basis_preferences.sql.
-- Safe to run any time, any number of times -- never writes anything,
-- and every column/table/function referenced here has existed since
-- migrations already confirmed applied (003, 021, 045, 047), so this
-- cannot itself fail the way an early 039 preflight once did by
-- referencing a column only that migration's own ALTER TABLE would
-- have created. Run this BEFORE 048.

select
  -- Expect 0: the table must not already exist under this name.
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'barcode_nutrition_basis_preferences') as existing_table_count,
  -- Expect true: auth.users is reachable (the new table's user_id FK target).
  (select to_regclass('auth.users') is not null) as auth_users_exists,
  -- Expect true: this migration runs strictly after 047 -- checked by
  -- argument COUNT (11 params: the original 6 plus 047's 5 barcode
  -- params), not an exact signature-text match, so this cannot itself
  -- report a false negative over incidental formatting differences.
  (select bool_or(p.pronargs = 11) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'trainee_log_nutrition_entry'
  ) as trainee_barcode_rpc_047_applied,
  -- Expect true: coach_barcode_products (046) exists, confirming the
  -- prior barcode-cache migration this one follows and deliberately
  -- does not reuse.
  (select to_regclass('public.coach_barcode_products') is not null) as coach_barcode_products_table_exists;
