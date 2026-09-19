-- Coach Barcode Products (Approved Manual Nutrition Cache) milestone
-- (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL
-- Editor, after 045_trainee_nutrition_logs_barcode_source.sql
-- (confirmed applied). Independent of the food-catalog work (039-044,
-- separate branch/PR) -- next available number in this branch's own
-- sequence, past both that branch's range and 045.
--
-- Purpose: when a barcode-scanned product IS found on Open Food Facts
-- but carries no usable nutrition data under any field/unit variant
-- barcodeNutrientExtraction.js tries, the coach is asked to enter
-- calories/protein once and explicitly approve them. This table
-- remembers that approval so scanning the SAME barcode again never
-- asks twice -- the client checks it BEFORE calling Open Food Facts.
--
-- Scoped per-coach (mirrors public.foods, 003_nutrition.sql), keyed by
-- (coach_id, barcode). Deliberately a SEPARATE table from public.foods
-- and public.food_reference_catalog -- a barcode-approved value is
-- never auto-added to either, matching the explicit requirement
-- already honored by 045 ("never automatically add barcode products to
-- the verified food catalog"; this table isn't the verified catalog,
-- and public.foods stays untouched by barcode entries either way).
--
-- trainee_nutrition_logs does NOT reference this table by foreign key
-- -- a barcode-sourced log row still snapshots its own
-- barcode_calories_per_100g/barcode_protein_per_100g directly onto the
-- row (045, unchanged by this migration). This table is purely a
-- lookup CACHE the client consults before calling Open Food Facts, not
-- a join target for the log itself -- so even if a coach later edits
-- or a row here were ever removed, no historical log entry is
-- affected, same "snapshot at log time" guarantee 045 already gives
-- the food_id path.

begin;

create table if not exists public.coach_barcode_products (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  product_name text not null check (char_length(trim(product_name)) > 0),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(6, 2) check (protein_per_100g is null or protein_per_100g >= 0),
  created_at timestamptz not null default now()
);

-- One approved value per (coach, barcode) -- a coach re-scanning and
-- re-approving the same barcode should update the existing row (see
-- the store's upsert), not create a duplicate the lookup would then
-- have to disambiguate between.
create unique index if not exists coach_barcode_products_coach_barcode_idx
  on public.coach_barcode_products (coach_id, barcode);

alter table public.coach_barcode_products enable row level security;

create policy coach_barcode_products_select_own on public.coach_barcode_products
  for select
  using (coach_id = auth.uid());

create policy coach_barcode_products_insert_own on public.coach_barcode_products
  for insert
  with check (coach_id = auth.uid());

create policy coach_barcode_products_update_own on public.coach_barcode_products
  for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- No delete policy -- same reasoning as public.foods (003_nutrition.sql):
-- correct a mistake by updating the row in place (the store's upsert
-- already does this on a re-approve), not by deleting and recreating.
-- Nothing references this table by foreign key either way, so this is
-- a convention choice for consistency, not a data-integrity necessity
-- the way it is for public.foods.

commit;
