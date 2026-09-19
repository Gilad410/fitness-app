-- Barcode Nutrition Basis Preferences milestone (DRAFT, NOT yet
-- applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL
-- Editor, after 047_trainee_barcode_nutrition_logging.sql (confirmed
-- applied).
--
-- WHY THIS IS A NEW TABLE, NOT A REUSE OF coach_barcode_products (046):
-- 046 solves a different problem (a product Open Food Facts found but
-- had NO usable nutrition data at all -- the coach types both figures
-- from scratch) and is scoped coach_id = auth.uid() only;
-- BarcodeFoodEntry.vue already deliberately never calls it on a
-- trainee's behalf (enableCoachCache: false there). This migration
-- solves a different problem: Open Food Facts DID return usable
-- as-sold calories, but neither Open Food Facts nor a coach/trainee's
-- previous scan told the app whether "as-sold" or "cooked, per the
-- physical package" is the basis that actually matches what gets
-- weighed for THIS specific barcode and THIS specific person -- and it
-- must work for a trainee exactly as it does for a coach, each
-- isolated from the other's saved choice. 046's schema has no `basis`
-- column and its RLS can never be satisfied by a trainee's own
-- auth.uid() -- reusing it would mean reinterpreting an already-applied
-- production table's coach_id as a generic user id, which is riskier
-- and less clear than an additive new table.
--
-- Purpose: remember, per signed-in user (coach OR trainee) and
-- barcode, which basis they picked last time (as_sold, or
-- cooked_package with the exact calories/protein they typed off the
-- package) -- so a repeat scan can pre-fill an explicit confirmation
-- ("use saved cooked/package values? / use dry/as-sold? / edit package
-- values?") instead of asking the coach/trainee to retype the same
-- package figures every time. Never used to skip asking -- see
-- barcodeNutritionBasis.js / BarcodeFoodEntry.vue: the confirmation is
-- always shown, regardless of which basis was saved last.
--
-- Cooked-package values are captured here ONLY as typed by that exact
-- user for that exact barcode -- never derived from any other source
-- (no generic/branded-catalog mapping, no conversion factor; see the
-- BASIS_COOKED_PACKAGE investigation this migration follows from).
-- Deliberately does NOT store product_name -- Open Food Facts' own
-- live lookup stays the source of truth for the displayed name on
-- every scan; this table only ever answers "which basis, and if
-- cooked, what numbers."

begin;

create table public.barcode_nutrition_basis_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  basis text not null check (basis in ('as_sold', 'cooked_package')),
  cooked_calories_per_100g numeric(7, 2)
    check (cooked_calories_per_100g is null or cooked_calories_per_100g >= 0),
  cooked_protein_per_100g numeric(6, 2)
    check (cooked_protein_per_100g is null or cooked_protein_per_100g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors the app's own rule exactly: cooked_package always carries
  -- BOTH real typed figures (protein is never left to resolve as
  -- "unknown" the way an unlabeled food's might); as_sold never stores
  -- a number at all, since Open Food Facts' own as-sold data is always
  -- read fresh and this table has nothing to add for that case.
  constraint barcode_nutrition_basis_preferences_basis_shape check (
    (basis = 'as_sold' and cooked_calories_per_100g is null and cooked_protein_per_100g is null)
    or
    (basis = 'cooked_package' and cooked_calories_per_100g is not null and cooked_protein_per_100g is not null)
  )
);

-- One saved preference per (user, barcode) -- re-choosing (or
-- re-editing cooked figures) for the same barcode updates the existing
-- row in place (see the store's upsert), same pattern as
-- coach_barcode_products_coach_barcode_idx (046).
create unique index barcode_nutrition_basis_preferences_user_barcode_idx
  on public.barcode_nutrition_basis_preferences (user_id, barcode);

alter table public.barcode_nutrition_basis_preferences enable row level security;

-- user_id = auth.uid() -- not coach_id -- is what makes this work
-- identically, and isolated, for a coach or a trainee session: each
-- person's own saved choice for a given barcode is a separate row,
-- invisible to anyone else, with no role-based branching needed in the
-- policy itself.
create policy barcode_nutrition_basis_preferences_select_own on public.barcode_nutrition_basis_preferences
  for select
  using (user_id = auth.uid());

create policy barcode_nutrition_basis_preferences_insert_own on public.barcode_nutrition_basis_preferences
  for insert
  with check (user_id = auth.uid());

create policy barcode_nutrition_basis_preferences_update_own on public.barcode_nutrition_basis_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy -- same reasoning as coach_barcode_products (046)
-- and public.foods (003_nutrition.sql): correct a mistake by updating
-- the row in place (the store's upsert already does this on
-- re-choosing/re-editing), not by deleting and recreating. Nothing
-- references this table by foreign key either way.

commit;
