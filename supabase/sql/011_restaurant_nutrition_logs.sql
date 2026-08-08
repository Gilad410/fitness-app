-- Restaurant-Item Nutrition Logging milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 010_restaurant_food_items_aroma_seed.sql.
--
-- Purpose: let public.trainee_nutrition_logs log a restaurant/food-chain
-- menu item (public.restaurant_food_items) directly, as a fixed serving
-- (optionally scaled by a servings count such as 0.5 or 2), alongside the
-- existing grams-based public.foods flow -- without touching foods at all
-- and without inventing a fake grams value for a serving that was never
-- measured in grams.
--
-- Design: a log row now references EXACTLY ONE food source:
--   * food_id + grams                              (unchanged, existing)
--   * restaurant_food_item_id + servings (defaults to 1)      (new)
-- calories/protein keep being computed server-side by the same trigger,
-- now branching on which source is set.
--
-- This migration is purely additive:
--   * food_id and grams become nullable (were NOT NULL), but every
--     EXISTING row already has both set, so no existing row changes
--     meaning or fails the new validation (see step 4).
--   * no existing data is updated, deleted, or backfilled.
--   * public.foods and public.restaurant_food_items are untouched.
--
-- Generic across chains: nothing here is Aroma-specific -- adding
-- McDonald's (or any other chain) later needs zero further schema change,
-- since a log row only ever points at a restaurant_food_items.id.

-- 1. Relax food_id/grams to nullable so a log row can instead point at a
-- restaurant item. NOT NULL is replaced by the table-level check added in
-- step 4, which is stricter (exactly-one-source), never looser.
alter table public.trainee_nutrition_logs
  alter column food_id drop not null;

alter table public.trainee_nutrition_logs
  alter column grams drop not null;

-- Drop the old standalone "grams > 0" column check (auto-named by
-- Postgres from the inline check in 003_nutrition.sql) -- it's superseded
-- by the combined check in step 4. Safe even if the name differs from the
-- Postgres default: a bare "grams > 0" check already passes on a NULL
-- grams value under standard SQL check semantics, so leaving it in place
-- would not block a restaurant-item row either way.
alter table public.trainee_nutrition_logs
  drop constraint if exists trainee_nutrition_logs_grams_check;

-- 2. New pointer to a restaurant menu item. on delete restrict matches
-- food_id's existing behavior: a menu item can't be deleted out from
-- under logged history.
alter table public.trainee_nutrition_logs
  add column restaurant_food_item_id uuid references public.restaurant_food_items(id) on delete restrict;

-- 3. How many servings of that menu item were logged (e.g. 0.5, 1, 2).
-- Only meaningful alongside restaurant_food_item_id. The trigger (step 5)
-- always normalizes this column -- NULL for grams-based rows, a real
-- number (defaulting to 1 when not supplied) for restaurant-based rows --
-- so the stored value is always explicit, never an implied default.
alter table public.trainee_nutrition_logs
  add column servings numeric(4, 1) check (servings is null or servings > 0);

-- 4. Enforce "exactly one source, with only the fields that make sense
-- for that source set". Existing rows all have food_id/grams set and
-- restaurant_food_item_id/servings null (just-added columns default to
-- null), so every existing row already satisfies the first branch below
-- and this ADD CONSTRAINT validates cleanly with no data changes.
alter table public.trainee_nutrition_logs
  add constraint trainee_nutrition_logs_source_check check (
    (food_id is not null and restaurant_food_item_id is null
       and grams is not null and grams > 0 and servings is null)
    or
    (food_id is null and restaurant_food_item_id is not null
       and grams is null and servings is not null and servings > 0)
  );

-- 5. Extend the calorie/protein trigger to branch on source. The food_id
-- branch is byte-for-byte the existing logic from 003_nutrition.sql,
-- extended for protein in 005_food_reference_protein_and_expansion.sql --
-- unchanged behavior for every existing/regular-food log.
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
    -- Grams-based path (regular foods) -- unchanged from before this
    -- migration. servings has no meaning here, so it's scrubbed to null
    -- regardless of what was passed in.
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
  else
    -- Serving-based path (restaurant items). servings defaults to 1 when
    -- not supplied, and the normalized value is what actually gets
    -- stored -- so history always shows the real quantity logged.
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
  end if;

  return new;
end;
$$;

-- No change needed to the trigger's attachment
-- (trainee_nutrition_logs_set_calories, before insert, from
-- 003_nutrition.sql) -- same trigger, same function name, only the
-- function body is replaced.

-- No RLS policy changes needed: trainee_nutrition_logs' existing
-- coach_id = auth.uid() policies (003_nutrition.sql) don't reference
-- food_id/grams/restaurant_food_item_id, and restaurant_food_items already
-- grants select to any authenticated user (009_restaurant_food_items.sql),
-- matching how the food_id branch already reads public.foods under the
-- same invoker-rights model.
