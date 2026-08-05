-- Restaurant / Food-Chain Menu Items milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 008_food_reference_catalog_verified_corrections.sql.
--
-- Purpose: a NEW, completely separate reference table for restaurant/
-- food-chain menu items (e.g. McDonald's, Aroma). This is intentionally
-- independent from public.food_reference_catalog:
--   * food_reference_catalog holds GENERIC foods, with nutrition per 100g.
--   * restaurant_food_items (this table) holds actual MENU ITEMS, with
--     nutrition per the real-world serving as sold — never per 100g.
-- This migration does not touch food_reference_catalog in any way (no
-- alter/update/delete/truncate) and does not insert any menu data yet —
-- structure only.

create table public.restaurant_food_items (
  id uuid primary key default gen_random_uuid(),

  -- e.g. 'מקדונלד''ס', 'ארומה'. Kept as its own column (rather than baked
  -- into item_name) so the UI can filter/group by chain; the searchable
  -- display name is composed later as `item_name || ' (' || chain_name || ')'`.
  chain_name text not null check (char_length(trim(chain_name)) > 0),

  -- e.g. 'ביג מק', 'נאגטס עוף', 'כריך טונה'. Deliberately does NOT include
  -- the size/serving — that lives in serving_description so the same dish
  -- can have multiple rows (see below).
  item_name text not null check (char_length(trim(item_name)) > 0),

  -- Preserves serving/size info, e.g. '4 יחידות', '6 יחידות', 'קטן',
  -- 'בינוני', 'גדול'. Required (not just optional metadata) because it is
  -- part of what makes a menu entry unique: the same item_name at the same
  -- chain legitimately has multiple rows when nutrition differs by size,
  -- and this column is what tells those rows apart. Items with only one
  -- fixed serving still get a short description (e.g. 'מנה רגילה') rather
  -- than being left blank, so uniqueness stays meaningful and consistent.
  serving_description text not null check (char_length(trim(serving_description)) > 0),

  -- Nutrition for the ACTUAL menu item/serving described above — NOT per
  -- 100g. Calories are required for a menu item to be usable; protein is
  -- often published, but not always, by official sources.
  calories_per_serving numeric(7, 1) not null check (calories_per_serving >= 0),
  protein_per_serving numeric(6, 1) check (protein_per_serving is null or protein_per_serving >= 0),

  -- Provenance, so every value can later be traced back to where it came
  -- from (official chain site, nutrition PDF, etc.). All optional at the
  -- DB level since not every historical entry may have full sourcing, but
  -- the app should always populate these when adding new items.
  source_url text check (source_url is null or char_length(trim(source_url)) > 0),
  source_name text check (source_name is null or char_length(trim(source_name)) > 0),
  source_checked_at timestamptz,

  created_at timestamptz not null default now()
);

-- Duplicate protection: the same chain + item + serving/size should only
-- exist once. Case-insensitive (lower()) so 'Big Mac' and 'big mac' can't
-- both slip in, matching the existing food_reference_catalog_name_idx
-- convention. Different serving/size rows (e.g. '4 יחידות' vs '6 יחידות')
-- are intentionally NOT collapsed by this constraint since they represent
-- genuinely different menu entries with different nutrition.
create unique index restaurant_food_items_chain_item_serving_idx
  on public.restaurant_food_items (lower(chain_name), lower(item_name), lower(serving_description));

-- Supports filtering/browsing by chain (e.g. "show me everything from
-- McDonald's") without a full scan.
create index restaurant_food_items_chain_name_idx
  on public.restaurant_food_items (lower(chain_name));

alter table public.restaurant_food_items enable row level security;

-- Shared reference data, same access model as food_reference_catalog: any
-- logged-in coach may read it, nobody writes to it from the app (seed/
-- maintain it directly via the SQL Editor).
create policy restaurant_food_items_select_authenticated on public.restaurant_food_items
  for select
  using (auth.uid() is not null);

-- No data is inserted here. McDonald's / Aroma / other chain menu items
-- are added in a later migration once this structure is approved.
