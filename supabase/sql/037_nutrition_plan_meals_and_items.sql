-- Nutrition Plan Meals & Items -- replaces 035's flat, free-text
-- trainee_nutrition_plan_items ("name" + "description") with a proper
-- meal structure whose items reference the SAME food sources, use the
-- SAME units, and compute calories/protein through the SAME formula as
-- the existing food log (public.trainee_nutrition_logs,
-- 003_nutrition.sql .. 011_restaurant_nutrition_logs.sql) -- per explicit
-- product decision: no separate food database, no duplicated nutrition
-- values, no different calculation method. Carbohydrates and fat are
-- deliberately NOT added anywhere by this migration -- the existing food
-- log has never tracked either, and the product decision for this
-- milestone was to match that exactly rather than introduce new macros
-- nothing else in the app shows.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 036_nutrition_plan_item_reorder.sql. Wrapped
-- in a single transaction so it applies entirely or not at all.
--
-- =====================================================================
-- THIS FILE PRESERVES EXISTING trainee_nutrition_plan_items DATA
-- (independent review correction -- an earlier revision of this file
-- dropped that table outright on the unverified assumption that it was
-- empty; 035/036 are confirmed already applied against the real
-- database, which this local environment cannot directly inspect, so
-- that assumption was wrong to make and has been removed. See section 4
-- below for the migration, and the "Before you run this" note at the very
-- end of this file for a read-only query to run first and see exactly
-- what exists today.)
-- =====================================================================
--
-- =====================================================================
-- Why this replaces (not just extends) 035's trainee_nutrition_plan_items
-- =====================================================================
-- That table's very shape (name text, description text -- no food
-- reference at all) cannot represent "N grams of an existing food" or
-- "N servings of a chain item" -- there is no column for it, so it cannot
-- simply gain new columns and keep meaning the same thing. Every existing
-- row is instead promoted into the new trainee_nutrition_plan_meals table
-- (section 4) -- a legacy row's name/description map naturally onto a
-- meal's own name/notes, which need no food reference at all either. No
-- food or nutrition value is invented for a legacy row: it becomes a meal
-- with zero food entries (an explicitly supported, clearly-labeled state
-- in the app -- see NutritionPlanSection.vue / TraineeNutritionPlanSection.vue),
-- not a fabricated food-based item.
--
-- This migration also drops 036's coach_swap_nutrition_plan_items() RPC,
-- which targeted the table being dropped, replacing it with two
-- analogous, equally atomic RPCs scoped to the new two-level structure
-- (section 6).
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- New shape: trainee_nutrition_plans (unchanged, 035) ->
-- trainee_nutrition_plan_meals (a named meal, e.g. "ארוחת בוקר" -- what
-- the milestone's original "ordered items with a name and description"
-- now means) -> trainee_nutrition_plan_meal_items (one food entry within
-- that meal -- what actually reuses the existing food log's sources/
-- units/math). Per-meal AND whole-plan totals are summed client-side from
-- each item's already-computed calories/protein (src/features/nutrition/lib/planTotals.js) --
-- no new SQL aggregate needed, same convention as
-- NutritionSection.vue's/TraineeNutritionView.vue's own daily totals.
--
-- A meal_item's shape is deliberately closely mirrored on
-- trainee_nutrition_logs (011): exactly one of (food_id + grams) or
-- (restaurant_food_item_id + servings), same CHECK shape, same
-- nullable-protein-propagates-as-unknown reasoning, same
-- archived-food handling (the coach's own picker UI filters archived
-- foods out client-side -- foodsStore.active, NutritionSection.vue --
-- the same convention the existing log already relies on instead of a
-- server-side check, since coach writes go through plain RLS-protected
-- table operations here, not a defensive security-definer RPC the way
-- trainee writes do).
--
-- The actual calculation is factored out into ONE new shared function,
-- public.compute_nutrition_amounts() (section 1), called by BOTH the
-- existing log trigger (refactored in section 2 to call it -- a pure,
-- behavior-preserving extraction with the exact same formula, not a
-- rewrite) and the new meal-item trigger (section 5). This is what
-- actually guarantees "identical calories/protein in both features"
-- stays true even as the app evolves, rather than merely being true
-- today because two copies of the same formula happen to still agree.
--
-- The meal-item trigger (section 5) ONLY recalculates when the food
-- source or quantity actually changed -- NOT on every UPDATE. An earlier
-- revision recalculated unconditionally, which meant reordering two items
-- (an UPDATE that only ever touches display_order) would silently
-- overwrite their stored calories/protein with whatever the referenced
-- food's CURRENT catalog values are, discarding the snapshot taken when
-- the item was actually added or last edited -- if a coach had changed a
-- food's calories_per_100g in between, a plain reorder would corrupt
-- unrelated items' historical nutrition numbers as a side effect. Fixed
-- by comparing NEW to OLD (via IS DISTINCT FROM, which handles NULLs
-- correctly, unlike <>/=) and only recomputing when food_id, grams,
-- restaurant_food_item_id, or servings themselves changed; otherwise the
-- trigger forces calories/protein back to OLD's values regardless of what
-- the UPDATE statement tried to set them to. That "regardless of what was
-- sent" clause is deliberate and doubles as the fix for a second,
-- related concern: it is also what stops a client from tampering with
-- calories/protein directly through an ordinary UPDATE (e.g. an UPDATE
-- that only changes display_order but also sneaks in a bogus `calories`
-- value) -- the trigger is the sole authority over these two columns in
-- both branches, never trusting client-supplied values for them either
-- way.

begin;

-- =====================================================================
-- 1. Shared calculation helper -- the SAME formula
--    set_nutrition_log_calories() already used, now callable from
--    anywhere that needs it.
-- =====================================================================
create or replace function public.compute_nutrition_amounts(
  p_food_id uuid,
  p_grams numeric,
  p_restaurant_food_item_id uuid,
  p_servings numeric
)
returns table (calories numeric, protein numeric)
language plpgsql
stable
as $$
declare
  v_calories_per_100g numeric;
  v_protein_per_100g numeric;
  v_calories_per_serving numeric;
  v_protein_per_serving numeric;
begin
  if p_food_id is not null then
    select f.calories_per_100g, f.protein_per_100g
      into v_calories_per_100g, v_protein_per_100g
      from public.foods f
      where f.id = p_food_id;

    return query select
      round(v_calories_per_100g * p_grams / 100.0, 1),
      (case when v_protein_per_100g is null then null else round(v_protein_per_100g * p_grams / 100.0, 1) end);
  else
    select r.calories_per_serving, r.protein_per_serving
      into v_calories_per_serving, v_protein_per_serving
      from public.restaurant_food_items r
      where r.id = p_restaurant_food_item_id;

    return query select
      round(v_calories_per_serving * p_servings, 1),
      (case when v_protein_per_serving is null then null else round(v_protein_per_serving * p_servings, 1) end);
  end if;
end;
$$;

-- =====================================================================
-- 2. Refactor the existing log trigger to call the shared helper.
--    Pure extraction -- byte-for-byte the same formula
--    011_restaurant_nutrition_logs.sql already ran, just no longer
--    inlined here. Zero behavior change for any existing or future
--    trainee_nutrition_logs row (this trigger only ever fires on INSERT --
--    the log table has no UPDATE policy at all, so the recalculate-on-
--    every-write concern section 5 addresses cannot occur here).
-- =====================================================================
create or replace function public.set_nutrition_log_calories()
returns trigger
language plpgsql
as $$
declare
  v_amounts record;
begin
  if new.food_id is not null then
    new.servings = null;
  else
    new.servings = coalesce(new.servings, 1);
  end if;

  select * into v_amounts
  from public.compute_nutrition_amounts(new.food_id, new.grams, new.restaurant_food_item_id, new.servings);

  new.calories = v_amounts.calories;
  new.protein = v_amounts.protein;

  return new;
end;
$$;
-- Trigger attachment (trainee_nutrition_logs_set_calories, before insert,
-- 003_nutrition.sql) is unchanged -- same trigger, same function name,
-- only the function body is replaced.

-- =====================================================================
-- 3. trainee_nutrition_plan_meals -- a named, ordered meal within a plan.
--    Created BEFORE section 4 touches the old table, so the migration
--    insert below has somewhere to copy rows into.
-- =====================================================================
create table public.trainee_nutrition_plan_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.trainee_nutrition_plans(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainee_nutrition_plan_meals_plan_id_idx
  on public.trainee_nutrition_plan_meals (plan_id, display_order);

create function public.set_nutrition_plan_meals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_nutrition_plan_meals_set_updated_at
  before update on public.trainee_nutrition_plan_meals
  for each row
  execute function public.set_nutrition_plan_meals_updated_at();

alter table public.trainee_nutrition_plan_meals enable row level security;

-- Coach policies climb to trainee_nutrition_plans (same shape as 035's
-- own plan policies) -- coach_id alone is never sufficient (a row's own
-- coach_id doesn't stop a coach pointing it at a plan that isn't theirs).
create policy trainee_nutrition_plan_meals_select_own on public.trainee_nutrition_plan_meals
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans p
      where p.id = trainee_nutrition_plan_meals.plan_id
        and p.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meals_insert_own on public.trainee_nutrition_plan_meals
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans p
      where p.id = trainee_nutrition_plan_meals.plan_id
        and p.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meals_update_own on public.trainee_nutrition_plan_meals
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans p
      where p.id = trainee_nutrition_plan_meals.plan_id
        and p.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans p
      where p.id = trainee_nutrition_plan_meals.plan_id
        and p.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meals_delete_own on public.trainee_nutrition_plan_meals
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans p
      where p.id = trainee_nutrition_plan_meals.plan_id
        and p.coach_id = auth.uid()
    )
  );

-- Trainee: read-only, own plan's meals only -- same trainee_get_auth_context()
-- pattern as 022/035 (a trainee has no SELECT policy on public.trainees
-- itself, so a direct subquery against it from inside another policy
-- would silently match zero rows -- see 022's documented RLS
-- self-reference bug).
create policy trainee_nutrition_plan_meals_select_own_trainee on public.trainee_nutrition_plan_meals
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1
      from public.trainee_nutrition_plans p
      join public.trainee_get_auth_context() ctx
        on ctx.trainee_id = p.trainee_id and ctx.coach_id = p.coach_id
      where p.id = trainee_nutrition_plan_meals.plan_id
    )
  );

-- =====================================================================
-- 4. Migrate existing trainee_nutrition_plan_items rows into meals, THEN
--    drop the old table -- see the file header for why a legacy row
--    becomes a meal (never a food-based meal item) and invents no food
--    or nutrition data.
-- =====================================================================
-- Explicit column list (not `select *`) on both sides, deliberately:
-- catches a schema mismatch as a loud error instead of silently
-- mis-mapping a column if either table's shape has drifted from what
-- this file assumes. Preserves: id (same row identity carried forward --
-- nothing else in the schema references a trainee_nutrition_plan_items id
-- as a foreign key, so reusing it is safe, not just convenient), plan_id
-- and coach_id (ownership, unchanged), name (unchanged), description ->
-- notes (same free text, new column name), display_order (unchanged --
-- a legacy plan's meal ordering is preserved exactly), and both
-- timestamps (created_at/updated_at are set explicitly here from the
-- historical values, which a plain INSERT allows even though the meals
-- table's own BEFORE UPDATE trigger would normally stamp updated_at on
-- any *future* update to the row -- this one-time insert is not itself
-- subject to that trigger, which only fires on UPDATE, not INSERT).
insert into public.trainee_nutrition_plan_meals
  (id, plan_id, coach_id, name, notes, display_order, created_at, updated_at)
select
  id, plan_id, coach_id, name, description, display_order, created_at, updated_at
from public.trainee_nutrition_plan_items;

-- Now safe to drop -- every row has already been copied into
-- trainee_nutrition_plan_meals above, in the same transaction, so this
-- can never run without the copy having already succeeded (COMMIT at the
-- end applies both together or neither).
drop function if exists public.coach_swap_nutrition_plan_items(uuid, uuid);
drop table public.trainee_nutrition_plan_items;

-- =====================================================================
-- 5. trainee_nutrition_plan_meal_items -- one food entry within a meal.
--    Shape mirrors trainee_nutrition_logs (011) closely: exactly one
--    source (food_id+grams, or restaurant_food_item_id+servings). Brand
--    new table -- no legacy data of this shape exists anywhere to
--    migrate (the old trainee_nutrition_plan_items had no food reference
--    at all, which is exactly why section 4 promotes it to a meal
--    instead).
-- =====================================================================
create table public.trainee_nutrition_plan_meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.trainee_nutrition_plan_meals(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,

  food_id uuid references public.foods(id) on delete restrict,
  grams numeric(6, 1) check (grams is null or grams > 0),

  restaurant_food_item_id uuid references public.restaurant_food_items(id) on delete restrict,
  servings numeric(4, 1) check (servings is null or servings > 0),

  -- Computed server-side (trigger, section 6) from the SAME
  -- compute_nutrition_amounts() helper the log uses -- never client-
  -- supplied, snapshotted at write time exactly like the log's own
  -- calories/protein. Unlike the log, this snapshot survives even a
  -- LATER edit that doesn't touch the food source/quantity (e.g.
  -- reordering) -- see section 6's trigger for exactly when it is and
  -- isn't recomputed.
  calories numeric(7, 1) not null check (calories >= 0),
  protein numeric(6, 1) check (protein is null or protein >= 0),

  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trainee_nutrition_plan_meal_items_source_check check (
    (food_id is not null and restaurant_food_item_id is null
      and grams is not null and grams > 0 and servings is null)
    or
    (food_id is null and restaurant_food_item_id is not null
      and grams is null and servings is not null and servings > 0)
  )
);

create index trainee_nutrition_plan_meal_items_meal_id_idx
  on public.trainee_nutrition_plan_meal_items (meal_id, display_order);

-- =====================================================================
-- 6. Meal-item calculation trigger -- fires on INSERT and UPDATE (unlike
--    the append-only log's insert-only trigger): plan items are live
--    content the coach edits in place (035's own design decision,
--    matching trainee_training_programs/trainee_program_workouts, 018),
--    so a quantity/food change must recompute calories/protein exactly
--    as an insert would, through the same shared helper.
--
--    Recomputes ONLY when the food source or quantity actually changed
--    (food_id, grams, restaurant_food_item_id, or servings -- compared
--    NEW to OLD via IS DISTINCT FROM, which -- unlike <>/= -- correctly
--    treats two NULLs as "not distinct" rather than making the whole
--    comparison NULL). Any other UPDATE (reordering: only display_order
--    changes; the coach editing the meal it belongs to does not touch
--    this table at all) instead forces calories/protein back to their
--    OLD values, regardless of what the UPDATE statement itself set them
--    to -- preserving the existing snapshot on a reorder, AND (the same
--    branch) preventing a client from tampering with these two columns
--    directly through an ordinary UPDATE, since neither branch ever
--    trusts a client-supplied calories/protein value.
-- =====================================================================
create or replace function public.set_nutrition_plan_meal_item_calories()
returns trigger
language plpgsql
as $$
declare
  v_amounts record;
  v_source_changed boolean;
begin
  if new.food_id is not null then
    new.servings = null;
  else
    new.servings = coalesce(new.servings, 1);
  end if;

  if tg_op = 'UPDATE' then
    v_source_changed := (
      new.food_id is distinct from old.food_id
      or new.grams is distinct from old.grams
      or new.restaurant_food_item_id is distinct from old.restaurant_food_item_id
      or new.servings is distinct from old.servings
    );
  else
    -- INSERT always computes fresh -- there is no OLD row to compare
    -- against or fall back to.
    v_source_changed := true;
  end if;

  if v_source_changed then
    select * into v_amounts
    from public.compute_nutrition_amounts(new.food_id, new.grams, new.restaurant_food_item_id, new.servings);
    new.calories = v_amounts.calories;
    new.protein = v_amounts.protein;
  else
    new.calories = old.calories;
    new.protein = old.protein;
  end if;

  new.updated_at = now();

  return new;
end;
$$;

create trigger trainee_nutrition_plan_meal_items_set_calories
  before insert or update on public.trainee_nutrition_plan_meal_items
  for each row
  execute function public.set_nutrition_plan_meal_item_calories();

alter table public.trainee_nutrition_plan_meal_items enable row level security;

-- Coach policies climb one level to trainee_nutrition_plan_meals only
-- (not all the way to trainee_nutrition_plans) -- that table's own
-- policies (section 3) already guarantee every meal row it holds is
-- legitimately owned, so re-verifying against it is sufficient (same
-- reasoning trainee_program_workouts' policies rely on, 018).
create policy trainee_nutrition_plan_meal_items_select_own on public.trainee_nutrition_plan_meal_items
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plan_meals m
      where m.id = trainee_nutrition_plan_meal_items.meal_id
        and m.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meal_items_insert_own on public.trainee_nutrition_plan_meal_items
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plan_meals m
      where m.id = trainee_nutrition_plan_meal_items.meal_id
        and m.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meal_items_update_own on public.trainee_nutrition_plan_meal_items
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plan_meals m
      where m.id = trainee_nutrition_plan_meal_items.meal_id
        and m.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plan_meals m
      where m.id = trainee_nutrition_plan_meal_items.meal_id
        and m.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_meal_items_delete_own on public.trainee_nutrition_plan_meal_items
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plan_meals m
      where m.id = trainee_nutrition_plan_meal_items.meal_id
        and m.coach_id = auth.uid()
    )
  );

-- Trainee: read-only, own plan's meal items only. Climbs meal_id ->
-- trainee_nutrition_plan_meals -> trainee_nutrition_plans -> the
-- caller's own resolved context, in one self-contained EXISTS (not
-- trusted transitively from section 3's policy, even though that one
-- already guarantees it -- this policy is correct on its own regardless
-- of how it's evaluated).
create policy trainee_nutrition_plan_meal_items_select_own_trainee on public.trainee_nutrition_plan_meal_items
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1
      from public.trainee_nutrition_plan_meals m
      join public.trainee_nutrition_plans p on p.id = m.plan_id
      join public.trainee_get_auth_context() ctx
        on ctx.trainee_id = p.trainee_id and ctx.coach_id = p.coach_id
      where m.id = trainee_nutrition_plan_meal_items.meal_id
    )
  );

-- =====================================================================
-- 7. Reorder RPCs -- one per level, same atomic-swap shape as 036's
--    (now-dropped) coach_swap_nutrition_plan_items(): a single
--    transaction per call, so a failure can never leave the database
--    partially swapped. coach_id is checked directly on each row (both
--    tables' own INSERT policies above already guarantee coach_id is
--    correct at creation time and it is never updated afterward -- same
--    reasoning 036 documented for the table this replaces). Only
--    display_order is ever set by either swap -- section 6's trigger is
--    what actually decides (correctly, now) that this alone must NOT
--    change calories/protein.
-- =====================================================================
create or replace function public.coach_swap_nutrition_plan_meals(
  p_meal_id_a uuid,
  p_meal_id_b uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.trainee_nutrition_plan_meals%rowtype;
  v_b public.trainee_nutrition_plan_meals%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may reorder nutrition plan meals.';
  end if;

  select * into v_a from public.trainee_nutrition_plan_meals
    where id = p_meal_id_a and coach_id = auth.uid() for update;
  if not found then
    raise exception 'Nutrition plan meal not found.';
  end if;

  select * into v_b from public.trainee_nutrition_plan_meals
    where id = p_meal_id_b and coach_id = auth.uid() for update;
  if not found then
    raise exception 'Nutrition plan meal not found.';
  end if;

  if v_a.plan_id <> v_b.plan_id then
    raise exception 'Both meals must belong to the same nutrition plan.';
  end if;

  update public.trainee_nutrition_plan_meals set display_order = v_b.display_order where id = v_a.id;
  update public.trainee_nutrition_plan_meals set display_order = v_a.display_order where id = v_b.id;
end;
$$;

revoke execute on function public.coach_swap_nutrition_plan_meals(uuid, uuid) from public;
revoke execute on function public.coach_swap_nutrition_plan_meals(uuid, uuid) from anon;
grant execute on function public.coach_swap_nutrition_plan_meals(uuid, uuid) to authenticated;

create or replace function public.coach_swap_nutrition_plan_meal_items(
  p_item_id_a uuid,
  p_item_id_b uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.trainee_nutrition_plan_meal_items%rowtype;
  v_b public.trainee_nutrition_plan_meal_items%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may reorder nutrition plan meal items.';
  end if;

  select * into v_a from public.trainee_nutrition_plan_meal_items
    where id = p_item_id_a and coach_id = auth.uid() for update;
  if not found then
    raise exception 'Nutrition plan meal item not found.';
  end if;

  select * into v_b from public.trainee_nutrition_plan_meal_items
    where id = p_item_id_b and coach_id = auth.uid() for update;
  if not found then
    raise exception 'Nutrition plan meal item not found.';
  end if;

  if v_a.meal_id <> v_b.meal_id then
    raise exception 'Both items must belong to the same meal.';
  end if;

  -- Only display_order is set here -- section 6's trigger reads OLD vs
  -- NEW on food_id/grams/restaurant_food_item_id/servings (all
  -- unchanged by this statement) and, finding no source change,
  -- preserves each row's existing calories/protein exactly rather than
  -- recomputing them.
  update public.trainee_nutrition_plan_meal_items set display_order = v_b.display_order where id = v_a.id;
  update public.trainee_nutrition_plan_meal_items set display_order = v_a.display_order where id = v_b.id;
end;
$$;

revoke execute on function public.coach_swap_nutrition_plan_meal_items(uuid, uuid) from public;
revoke execute on function public.coach_swap_nutrition_plan_meal_items(uuid, uuid) from anon;
grant execute on function public.coach_swap_nutrition_plan_meal_items(uuid, uuid) to authenticated;

commit;

-- =====================================================================
-- Before you run this: preview what section 4 will migrate
-- =====================================================================
-- Run this SELECT (read-only, changes nothing) in the SQL Editor BEFORE
-- applying the migration above, to see exactly what exists today and
-- confirm for yourself whether there is real plan data at stake:
--
--   select id, plan_id, coach_id, name, description, display_order,
--          created_at, updated_at
--   from public.trainee_nutrition_plan_items
--   order by plan_id, display_order;
--
-- Every row it returns will become one trainee_nutrition_plan_meals row
-- (same id, name, display_order; description becomes notes) with zero
-- food items under it, once this migration runs.
