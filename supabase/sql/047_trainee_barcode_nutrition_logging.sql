-- Trainee-Side Barcode Nutrition Logging milestone (DRAFT, NOT yet
-- applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 045_trainee_nutrition_logs_barcode_source.sql and
-- 046_coach_barcode_products.sql (both confirmed applied).
--
-- WHY THIS MIGRATION IS REQUIRED (not optional/bypassable client-side):
-- A trainee has NO direct INSERT access to public.trainee_nutrition_logs
-- at all -- the table's only INSERT policy
-- (trainee_nutrition_logs_insert_own, 003_nutrition.sql) is
-- `with check (coach_id = auth.uid())`, which can only ever be satisfied
-- by a COACH's own auth.uid(), never a trainee's. The trainee's entire
-- write path is public.trainee_log_nutrition_entry() -- a `security
-- definer` RPC (022_trainee_nutrition_access.sql) that validates,
-- resolves trainee_id/coach_id itself, and inserts on the trainee's
-- behalf. That RPC currently accepts exactly three sources (food_id,
-- reference_food_id, restaurant_food_item_id) and has no barcode
-- parameters at all -- so there is no existing, RLS-compliant path for
-- a trainee to log a barcode-sourced entry without this function being
-- extended. Confirmed by reading 003 (the only INSERT policy) and 022
-- (the RPC's current signature and body) directly before drafting this.
--
-- Purpose: extend trainee_log_nutrition_entry() with the same barcode
-- source 045 already added to the COACH's direct-insert path, as a
-- FOURTH option alongside the existing three. Additive only -- every
-- existing call (food_id/reference_food_id/restaurant_food_item_id,
-- from the trainee's regular add-food form) is byte-for-byte unchanged
-- below; the new parameters all default to null and are validated only
-- when p_barcode is supplied. calories/protein continue to be computed
-- by the SAME trigger (set_nutrition_log_calories(), 045) regardless of
-- which path inserted the row -- no trigger changes needed here.
--
-- Note: `create or replace function` matches by exact parameter-type
-- signature, so adding new parameters would otherwise leave the OLD
-- 6-parameter function sitting alongside a new one rather than actually
-- replacing it -- the explicit DROP below avoids that.

begin;

drop function if exists public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date);

create function public.trainee_log_nutrition_entry(
  p_food_id uuid default null,
  p_reference_food_id uuid default null,
  p_restaurant_food_item_id uuid default null,
  p_grams numeric default null,
  p_servings numeric default null,
  p_logged_at date default current_date,
  p_barcode text default null,
  p_barcode_source text default null,
  p_barcode_product_name text default null,
  p_barcode_calories_per_100g numeric default null,
  p_barcode_protein_per_100g numeric default null
)
returns public.trainee_nutrition_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_food_id uuid;
  v_food_archived_at timestamptz;
  v_ref_name text;
  v_ref_calories numeric;
  v_ref_protein numeric;
  v_source_count int;
  v_row public.trainee_nutrition_logs%rowtype;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may log their own nutrition entry.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  if p_logged_at is null then
    raise exception 'A log date is required.';
  end if;

  v_source_count := (case when p_food_id is not null then 1 else 0 end)
    + (case when p_reference_food_id is not null then 1 else 0 end)
    + (case when p_restaurant_food_item_id is not null then 1 else 0 end)
    + (case when p_barcode is not null then 1 else 0 end);

  if v_source_count <> 1 then
    raise exception 'Exactly one of food, reference food, restaurant item, or barcode must be provided.';
  end if;

  -- ---- Barcode-sourced (new): values already resolved client-side (an
  -- Open Food Facts lookup, or a manual entry when none was found) --
  -- snapshotted directly onto the row, exactly like the coach's own
  -- direct-insert path (nutritionLogs.js) already does for a barcode
  -- entry. No coach_barcode_products "approve and remember" cache
  -- involved here at all -- that table's RLS is coach_id = auth.uid()
  -- only (046_coach_barcode_products.sql) and stays exactly that way;
  -- this RPC never reads or writes it, so a trainee's barcode scan
  -- always goes to Open Food Facts (or manual entry) fresh, same as any
  -- barcode Open Food Facts itself has no cached answer for.
  if p_barcode is not null then
    if p_grams is null or p_grams <= 0 then
      raise exception 'Grams must be a positive number.';
    end if;
    if p_barcode_source is null or p_barcode_product_name is null or p_barcode_calories_per_100g is null then
      raise exception 'Barcode product details are incomplete.';
    end if;
    if p_barcode_calories_per_100g < 0 then
      raise exception 'Calories must not be negative.';
    end if;
    if p_barcode_protein_per_100g is not null and p_barcode_protein_per_100g < 0 then
      raise exception 'Protein must not be negative.';
    end if;

    insert into public.trainee_nutrition_logs (
      trainee_id, coach_id, barcode, barcode_source, barcode_product_name,
      barcode_calories_per_100g, barcode_protein_per_100g, grams, logged_at
    )
    values (
      v_trainee_id, v_coach_id, p_barcode, p_barcode_source, p_barcode_product_name,
      p_barcode_calories_per_100g, p_barcode_protein_per_100g, p_grams, p_logged_at
    )
    returning * into v_row;

    return v_row;
  end if;

  -- ---- Restaurant/chain item: servings-based, no `foods` row involved.
  -- Byte-for-byte unchanged from 022_trainee_nutrition_access.sql.
  if p_restaurant_food_item_id is not null then
    if p_servings is null or p_servings <= 0 then
      raise exception 'Servings must be a positive number.';
    end if;

    if not exists (
      select 1 from public.restaurant_food_items where id = p_restaurant_food_item_id
    ) then
      raise exception 'Restaurant item not found.';
    end if;

    insert into public.trainee_nutrition_logs (trainee_id, coach_id, restaurant_food_item_id, servings, logged_at)
    values (v_trainee_id, v_coach_id, p_restaurant_food_item_id, p_servings, p_logged_at)
    returning * into v_row;

    return v_row;
  end if;

  -- ---- Everything else is grams-based against public.foods.
  -- Byte-for-byte unchanged from 022_trainee_nutrition_access.sql.
  if p_grams is null or p_grams <= 0 then
    raise exception 'Grams must be a positive number.';
  end if;

  if p_food_id is not null then
    select id, archived_at into v_food_id, v_food_archived_at
    from public.foods
    where id = p_food_id and coach_id = v_coach_id;

    if v_food_id is null then
      raise exception 'Food not found.';
    end if;

    if v_food_archived_at is not null then
      raise exception 'This food is no longer available for new entries.';
    end if;
  else
    select name, calories_per_100g, protein_per_100g
      into v_ref_name, v_ref_calories, v_ref_protein
    from public.food_reference_catalog
    where id = p_reference_food_id;

    if not found then
      raise exception 'Reference food not found.';
    end if;

    insert into public.foods (coach_id, name, calories_per_100g, protein_per_100g)
    values (v_coach_id, v_ref_name, v_ref_calories, v_ref_protein)
    on conflict (coach_id, (lower(name))) do nothing
    returning id into v_food_id;

    if v_food_id is null then
      select id, archived_at into v_food_id, v_food_archived_at
      from public.foods
      where coach_id = v_coach_id and lower(name) = lower(v_ref_name);

      if v_food_id is null or v_food_archived_at is not null then
        raise exception 'This food is currently unavailable. Please contact your coach.';
      end if;
    end if;
  end if;

  insert into public.trainee_nutrition_logs (trainee_id, coach_id, food_id, grams, logged_at)
  values (v_trainee_id, v_coach_id, v_food_id, p_grams, p_logged_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.trainee_log_nutrition_entry(
  uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric
) from public;
revoke execute on function public.trainee_log_nutrition_entry(
  uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric
) from anon;
grant execute on function public.trainee_log_nutrition_entry(
  uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric
) to authenticated;

-- No RLS policy changes -- the RPC is `security definer` and inserts
-- exactly as it always has; no new policy on trainee_nutrition_logs or
-- coach_barcode_products is added or needed. No new columns either --
-- 045 already added every barcode_* column this insert uses.

-- Safe-by-construction report (read-only, cannot abort this migration):
-- confirms the function was replaced with the new 11-parameter
-- signature and the old 6-parameter overload is gone.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'trainee_log_nutrition_entry';

commit;
