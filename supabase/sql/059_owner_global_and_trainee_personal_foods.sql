-- Owner-managed global foods and trainee-private reusable foods.
begin;

create table public.trainee_custom_foods (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  calories_per_100g numeric(6, 1) not null check (calories_per_100g > 0 and calories_per_100g <= 900),
  protein_per_100g numeric(6, 1) not null check (protein_per_100g >= 0 and protein_per_100g <= 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index trainee_custom_foods_trainee_name_idx
  on public.trainee_custom_foods (trainee_id, lower(name));

create index trainee_custom_foods_trainee_active_idx
  on public.trainee_custom_foods (trainee_id, archived_at);

create function public.set_trainee_custom_food_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_custom_foods_set_updated_at
  before update on public.trainee_custom_foods
  for each row execute function public.set_trainee_custom_food_updated_at();

alter table public.trainee_custom_foods enable row level security;

create policy trainee_custom_foods_select_own on public.trainee_custom_foods
  for select using (
    exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_custom_foods.trainee_id
    )
  );

create policy trainee_custom_foods_select_coach on public.trainee_custom_foods
  for select using (
    public.is_coach() and exists (
      select 1 from public.trainees t
      where t.id = trainee_custom_foods.trainee_id
        and t.coach_id = auth.uid()
    )
  );

create policy trainee_custom_foods_insert_own on public.trainee_custom_foods
  for insert with check (
    exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_custom_foods.trainee_id
    )
  );

create policy trainee_custom_foods_update_own on public.trainee_custom_foods
  for update using (
    exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_custom_foods.trainee_id
    )
  ) with check (
    exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_custom_foods.trainee_id
    )
  );

revoke all on table public.trainee_custom_foods from anon;
grant select, insert, update on table public.trainee_custom_foods to authenticated;

alter table public.trainee_nutrition_logs
  add column trainee_custom_food_id uuid references public.trainee_custom_foods(id) on delete restrict;

alter table public.trainee_nutrition_logs
  drop constraint if exists trainee_nutrition_logs_source_check;

alter table public.trainee_nutrition_logs
  add constraint trainee_nutrition_logs_source_check check (
    (food_id is not null and restaurant_food_item_id is null and barcode is null and trainee_custom_food_id is null
       and grams is not null and grams > 0 and servings is null
       and barcode_source is null and barcode_product_name is null
       and barcode_calories_per_100g is null and barcode_protein_per_100g is null)
    or
    (food_id is null and restaurant_food_item_id is not null and barcode is null and trainee_custom_food_id is null
       and grams is null and servings is not null and servings > 0
       and barcode_source is null and barcode_product_name is null
       and barcode_calories_per_100g is null and barcode_protein_per_100g is null)
    or
    (food_id is null and restaurant_food_item_id is null and barcode is not null and trainee_custom_food_id is null
       and grams is not null and grams > 0 and servings is null
       and barcode_source is not null and barcode_product_name is not null
       and barcode_calories_per_100g is not null)
    or
    (food_id is null and restaurant_food_item_id is null and barcode is null and trainee_custom_food_id is not null
       and grams is not null and grams > 0 and servings is null
       and barcode_source is null and barcode_product_name is null
       and barcode_calories_per_100g is null and barcode_protein_per_100g is null)
  );

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
    select calories_per_100g, protein_per_100g into v_calories_per_100g, v_protein_per_100g
    from public.foods where id = new.food_id;
    new.calories = round(v_calories_per_100g * new.grams / 100.0, 1);
    new.protein = case when v_protein_per_100g is null then null else round(v_protein_per_100g * new.grams / 100.0, 1) end;
  elsif new.trainee_custom_food_id is not null then
    new.servings = null;
    select calories_per_100g, protein_per_100g into v_calories_per_100g, v_protein_per_100g
    from public.trainee_custom_foods where id = new.trainee_custom_food_id;
    new.calories = round(v_calories_per_100g * new.grams / 100.0, 1);
    new.protein = round(v_protein_per_100g * new.grams / 100.0, 1);
  elsif new.restaurant_food_item_id is not null then
    new.servings = coalesce(new.servings, 1);
    select calories_per_serving, protein_per_serving into v_calories_per_serving, v_protein_per_serving
    from public.restaurant_food_items where id = new.restaurant_food_item_id;
    new.calories = round(v_calories_per_serving * new.servings, 1);
    new.protein = case when v_protein_per_serving is null then null else round(v_protein_per_serving * new.servings, 1) end;
  else
    new.servings = null;
    new.calories = round(new.barcode_calories_per_100g * new.grams / 100.0, 1);
    new.protein = case when new.barcode_protein_per_100g is null then null else round(new.barcode_protein_per_100g * new.grams / 100.0, 1) end;
  end if;
  return new;
end;
$$;

drop function if exists public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric);

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
  p_barcode_protein_per_100g numeric default null,
  p_trainee_custom_food_id uuid default null
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
  if not public.is_trainee() then raise exception 'Only a trainee may log their own nutrition entry.'; end if;
  select trainee_id, coach_id into v_trainee_id, v_coach_id from public.trainee_get_auth_context();
  if v_trainee_id is null then raise exception 'No trainee profile is linked to this account.'; end if;
  if p_logged_at is null then raise exception 'A log date is required.'; end if;

  v_source_count := (case when p_food_id is not null then 1 else 0 end)
    + (case when p_reference_food_id is not null then 1 else 0 end)
    + (case when p_restaurant_food_item_id is not null then 1 else 0 end)
    + (case when p_barcode is not null then 1 else 0 end)
    + (case when p_trainee_custom_food_id is not null then 1 else 0 end);
  if v_source_count <> 1 then
    raise exception 'Exactly one nutrition source must be provided.';
  end if;

  if p_grams is not null and p_grams <= 0 then raise exception 'Grams must be a positive number.'; end if;

  if p_trainee_custom_food_id is not null then
    if p_grams is null then raise exception 'Grams must be a positive number.'; end if;
    if not exists (
      select 1 from public.trainee_custom_foods
      where id = p_trainee_custom_food_id and trainee_id = v_trainee_id and archived_at is null
    ) then raise exception 'Personal food not found.'; end if;
    insert into public.trainee_nutrition_logs (trainee_id, coach_id, trainee_custom_food_id, grams, logged_at)
    values (v_trainee_id, v_coach_id, p_trainee_custom_food_id, p_grams, p_logged_at)
    returning * into v_row;
    return v_row;
  end if;

  if p_barcode is not null then
    if p_grams is null then raise exception 'Grams must be a positive number.'; end if;
    if p_barcode_source is null or p_barcode_product_name is null or p_barcode_calories_per_100g is null then
      raise exception 'Barcode product details are incomplete.';
    end if;
    if p_barcode_calories_per_100g < 0 then raise exception 'Calories must not be negative.'; end if;
    if p_barcode_protein_per_100g is not null and p_barcode_protein_per_100g < 0 then raise exception 'Protein must not be negative.'; end if;
    insert into public.trainee_nutrition_logs (
      trainee_id, coach_id, barcode, barcode_source, barcode_product_name,
      barcode_calories_per_100g, barcode_protein_per_100g, grams, logged_at
    ) values (
      v_trainee_id, v_coach_id, p_barcode, p_barcode_source, p_barcode_product_name,
      p_barcode_calories_per_100g, p_barcode_protein_per_100g, p_grams, p_logged_at
    ) returning * into v_row;
    return v_row;
  end if;

  if p_restaurant_food_item_id is not null then
    if p_servings is null or p_servings <= 0 then raise exception 'Servings must be a positive number.'; end if;
    if not exists (select 1 from public.restaurant_food_items where id = p_restaurant_food_item_id) then
      raise exception 'Restaurant item not found.';
    end if;
    insert into public.trainee_nutrition_logs (trainee_id, coach_id, restaurant_food_item_id, servings, logged_at)
    values (v_trainee_id, v_coach_id, p_restaurant_food_item_id, p_servings, p_logged_at)
    returning * into v_row;
    return v_row;
  end if;

  if p_grams is null then raise exception 'Grams must be a positive number.'; end if;
  if p_food_id is not null then
    select id, archived_at into v_food_id, v_food_archived_at from public.foods
    where id = p_food_id and coach_id = v_coach_id;
    if v_food_id is null then raise exception 'Food not found.'; end if;
    if v_food_archived_at is not null then raise exception 'This food is no longer available for new entries.'; end if;
  else
    select name, calories_per_100g, protein_per_100g into v_ref_name, v_ref_calories, v_ref_protein
    from public.food_reference_catalog where id = p_reference_food_id;
    if not found then raise exception 'Reference food not found.'; end if;
    insert into public.foods (coach_id, name, calories_per_100g, protein_per_100g)
    values (v_coach_id, v_ref_name, v_ref_calories, v_ref_protein)
    on conflict (coach_id, (lower(name))) do nothing returning id into v_food_id;
    if v_food_id is null then
      select id, archived_at into v_food_id, v_food_archived_at from public.foods
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

revoke execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric, uuid) from public, anon;
grant execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date, text, text, text, numeric, numeric, uuid) to authenticated;

create function public.owner_create_reference_food(
  p_name text,
  p_calories_per_100g numeric,
  p_protein_per_100g numeric
)
returns public.food_reference_catalog
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(p_name);
  v_row public.food_reference_catalog%rowtype;
begin
  if not public.is_owner() then raise exception 'Only the owner may add foods to the global catalog.'; end if;
  if v_name = '' then raise exception 'A food name is required.'; end if;
  if p_calories_per_100g is null or p_calories_per_100g <= 0 or p_calories_per_100g > 900 then
    raise exception 'Calories must be between 0 and 900.';
  end if;
  if p_protein_per_100g is null or p_protein_per_100g < 0 or p_protein_per_100g > 100 then
    raise exception 'Protein must be between 0 and 100.';
  end if;
  if exists (select 1 from public.food_reference_catalog where lower(name) = lower(v_name)) then
    raise exception 'A food with this name already exists.';
  end if;
  insert into public.food_reference_catalog (
    name, name_he, calories_per_100g, protein_per_100g, source, verification_status
  ) values (
    v_name, v_name, p_calories_per_100g, p_protein_per_100g, 'owner_manual', 'unverified'
  ) returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.owner_create_reference_food(text, numeric, numeric) from public, anon;
grant execute on function public.owner_create_reference_food(text, numeric, numeric) to authenticated;

commit;
