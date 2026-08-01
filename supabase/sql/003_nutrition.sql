-- Nutrition Tracking milestone — per-trainee food logging with calorie totals.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql and 002_progress_logs.sql.

-- Coach-owned food catalog. Each coach builds up their own list of foods
-- with a known calorie value per 100g, reused across all their trainees.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  calories_per_100g numeric(6, 1) not null check (calories_per_100g > 0),
  created_at timestamptz not null default now()
);

create unique index foods_coach_id_name_idx
  on public.foods (coach_id, lower(name));

alter table public.foods enable row level security;

create policy foods_select_own on public.foods
  for select
  using (coach_id = auth.uid());

create policy foods_insert_own on public.foods
  for insert
  with check (coach_id = auth.uid());

create policy foods_update_own on public.foods
  for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- No delete policy: nutrition logs reference foods by id, so a food must
-- stay available even if the coach stops using it going forward.

-- Per-trainee food log entries. `calories` is computed automatically from
-- the referenced food's calories_per_100g and the logged grams, so it's
-- always internally consistent and snapshots the value at log time (later
-- edits to a food's calories_per_100g do not retroactively change history).
create table public.trainee_nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete restrict,
  grams numeric(6, 1) not null check (grams > 0),
  calories numeric(7, 1) not null check (calories >= 0),
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index trainee_nutrition_logs_trainee_id_idx
  on public.trainee_nutrition_logs (trainee_id, logged_at desc);

create function public.set_nutrition_log_calories()
returns trigger
language plpgsql
as $$
declare
  kcal_per_100g numeric;
begin
  select calories_per_100g into kcal_per_100g
  from public.foods
  where id = new.food_id;

  new.calories = round(kcal_per_100g * new.grams / 100.0, 1);
  return new;
end;
$$;

create trigger trainee_nutrition_logs_set_calories
  before insert on public.trainee_nutrition_logs
  for each row
  execute function public.set_nutrition_log_calories();

alter table public.trainee_nutrition_logs enable row level security;

create policy trainee_nutrition_logs_select_own on public.trainee_nutrition_logs
  for select
  using (coach_id = auth.uid());

create policy trainee_nutrition_logs_insert_own on public.trainee_nutrition_logs
  for insert
  with check (coach_id = auth.uid());

create policy trainee_nutrition_logs_delete_own on public.trainee_nutrition_logs
  for delete
  using (coach_id = auth.uid());

-- No update policy: a mis-logged entry is deleted and re-logged rather
-- than edited in place, so the calorie trigger only ever needs to run
-- on insert.
