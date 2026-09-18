-- Barcode-Sourced Nutrition Logging milestone (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 038_trainee_nutrition_log_retention.sql.
-- Independent of the food-catalog work (039-044, on a separate branch/
-- PR) -- numbered 045 specifically to avoid any filename collision with
-- that branch once both eventually merge; touches a completely
-- different part of the schema (trainee_nutrition_logs only) and has no
-- dependency on food_reference_catalog either way.
--
-- Purpose: let public.trainee_nutrition_logs log a barcode-scanned
-- packaged-food product (looked up against Open Food Facts, or typed in
-- manually when no match/nutrition data is found) directly, as a THIRD
-- source alongside the existing two:
--   * food_id + grams                              (unchanged, existing)
--   * restaurant_food_item_id + servings            (unchanged, existing -- 011)
--   * barcode + grams                                (new)
-- calories/protein keep being computed server-side by the same trigger,
-- now branching three ways instead of two. Exactly the same additive,
-- non-destructive shape 011_restaurant_nutrition_logs.sql used to add
-- the second source: no existing column changes meaning, no existing
-- row is touched, public.foods/public.food_reference_catalog/
-- public.restaurant_food_items are all untouched.
--
-- Deliberately does NOT create a new table or write into
-- public.foods/public.food_reference_catalog for a barcode product --
-- the calories/protein/name are snapshotted directly onto the log row
-- at scan time (the same "snapshot at log time, never retroactively
-- changes" philosophy 003_nutrition.sql's original comment already
-- states for the food_id path), so a barcode-sourced entry never
-- becomes part of any reusable catalog, satisfying the explicit
-- requirement that barcode products are not auto-added to the verified
-- food catalog.

begin;

-- 1. New columns. All nullable -- only meaningful together, enforced by
-- the exactly-one-source check constraint in step 2 (extended from
-- 011's two-way version to three-way).
alter table public.trainee_nutrition_logs
  add column if not exists barcode text;

alter table public.trainee_nutrition_logs
  add column if not exists barcode_source text;

alter table public.trainee_nutrition_logs
  add column if not exists barcode_product_name text;

alter table public.trainee_nutrition_logs
  add column if not exists barcode_calories_per_100g numeric(7, 2)
    check (barcode_calories_per_100g is null or barcode_calories_per_100g >= 0);

alter table public.trainee_nutrition_logs
  add column if not exists barcode_protein_per_100g numeric(6, 2)
    check (barcode_protein_per_100g is null or barcode_protein_per_100g >= 0);

-- 2. Replace the two-way exactly-one-source check (011) with a
-- three-way version. Every existing row has exactly one of
-- food_id/restaurant_food_item_id set and all barcode_* columns null
-- (just-added, default null), so it already satisfies one of the first
-- two branches below and this validates cleanly with no data changes.
alter table public.trainee_nutrition_logs
  drop constraint if exists trainee_nutrition_logs_source_check;

alter table public.trainee_nutrition_logs
  add constraint trainee_nutrition_logs_source_check check (
    (food_id is not null and restaurant_food_item_id is null and barcode is null
       and grams is not null and grams > 0 and servings is null
       and barcode_source is null and barcode_product_name is null
       and barcode_calories_per_100g is null and barcode_protein_per_100g is null)
    or
    (food_id is null and restaurant_food_item_id is not null and barcode is null
       and grams is null and servings is not null and servings > 0
       and barcode_source is null and barcode_product_name is null
       and barcode_calories_per_100g is null and barcode_protein_per_100g is null)
    or
    (food_id is null and restaurant_food_item_id is null and barcode is not null
       and grams is not null and grams > 0 and servings is null
       and barcode_source is not null and barcode_product_name is not null
       and barcode_calories_per_100g is not null)
      -- barcode_protein_per_100g intentionally NOT required not-null
      -- here -- an unknown-protein product is a legitimate, already-
      -- supported case throughout this feature (see
      -- nutritionLogsCore.js's dailyHasUnknownProtein), not an error.
  );

-- 3. Extend the calorie/protein trigger with a third branch. The
-- food_id and restaurant_food_item_id branches are byte-for-byte the
-- existing logic from 011_restaurant_nutrition_logs.sql -- unchanged
-- behavior for every existing regular-food or restaurant-item log.
create or replace function public.set_nutrition_log_calories()
returns trigger
language plpgsql
as $$
declare
  v_calories_per_100g numeric;
  v_protein_per_100g numeric;
  v_calories_per_serving numeric;
  v_protein_per_serving numeric;
begin
  if new.food_id is not null then
    new.servings = null;

    select calories_per_100g, protein_per_100g
      into v_calories_per_100g, v_protein_per_100g
      from public.foods
      where id = new.food_id;

    new.calories = round(v_calories_per_100g * new.grams / 100.0, 1);
    new.protein = case
      when v_protein_per_100g is null then null
      else round(v_protein_per_100g * new.grams / 100.0, 1)
    end;
  elsif new.restaurant_food_item_id is not null then
    new.servings = coalesce(new.servings, 1);

    select calories_per_serving, protein_per_serving
      into v_calories_per_serving, v_protein_per_serving
      from public.restaurant_food_items
      where id = new.restaurant_food_item_id;

    new.calories = round(v_calories_per_serving * new.servings, 1);
    new.protein = case
      when v_protein_per_serving is null then null
      else round(v_protein_per_serving * new.servings, 1)
    end;
  else
    -- Barcode-sourced path. Unlike the two branches above, there is no
    -- table to join to -- the per-100g values were already snapshotted
    -- onto NEW by the client at scan time (client-supplied, but the
    -- exact same formula is re-applied here server-side as the actual
    -- source of truth for the stored calories/protein, matching every
    -- other path in this trigger -- the client's own preview,
    -- barcodeCalculation.js, is a UI convenience only).
    new.servings = null;

    new.calories = round(new.barcode_calories_per_100g * new.grams / 100.0, 1);
    new.protein = case
      when new.barcode_protein_per_100g is null then null
      else round(new.barcode_protein_per_100g * new.grams / 100.0, 1)
    end;
  end if;

  return new;
end;
$$;

-- No change needed to the trigger's attachment
-- (trainee_nutrition_logs_set_calories, before insert, from
-- 003_nutrition.sql) -- same trigger, same function name, only the
-- function body is replaced.

-- No RLS policy changes needed: the existing coach_id = auth.uid()
-- policies (003_nutrition.sql) don't reference any of the new columns,
-- and a barcode-sourced row is inserted/selected/deleted through the
-- exact same policies as any other log row.

-- Safe-by-construction report (read-only, cannot abort this migration --
-- same "report, never raise" discipline as 039's leftover-nulls check):
-- confirms the three-way constraint accepted every existing row.
select count(*) as rows_failing_source_check
from public.trainee_nutrition_logs
where not (
  (food_id is not null and restaurant_food_item_id is null and barcode is null)
  or (food_id is null and restaurant_food_item_id is not null and barcode is null)
  or (food_id is null and restaurant_food_item_id is null and barcode is not null)
);

commit;
