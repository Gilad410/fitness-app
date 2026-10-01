-- Isolated test-database schema, mirroring public.food_reference_catalog's
-- ACTUAL current shape (migrations 004, 005, 039, 049) as closely as
-- SQLite's type system allows. This is NOT the real Postgres engine
-- (unavailable in this sandbox -- no psql/docker/supabase CLI) -- it is
-- a best-effort approximation used to exercise the same constraints
-- (bounds, uniqueness, not-null) this table actually enforces, not a
-- substitute for a real pre-production Postgres validation.
create table food_reference_catalog (
  id text primary key default (lower(hex(randomblob(16)))),
  name text not null check (length(trim(name)) > 0),
  calories_per_100g real not null check (calories_per_100g >= 0 and calories_per_100g <= 900),
  protein_per_100g real not null default 0 check (protein_per_100g >= 0 and protein_per_100g <= 100),
  created_at text not null default (datetime('now')),
  source text,
  external_id text,
  barcode text,
  name_he text,
  name_en text,
  brand text,
  preparation_state text,
  verification_status text default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review', 'rejected')),
  last_verified_at text,
  category text,
  source_name text,
  source_id text,
  source_url text,
  source_checked_at text
);

create unique index food_reference_catalog_name_idx on food_reference_catalog (lower(name));
create unique index food_reference_catalog_source_external_id_idx on food_reference_catalog (source, external_id) where external_id is not null;
create unique index food_reference_catalog_barcode_idx on food_reference_catalog (barcode) where barcode is not null;
