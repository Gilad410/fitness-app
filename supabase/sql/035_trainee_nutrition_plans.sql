-- Trainee Nutrition Plans milestone -- lets a coach build a simple,
-- editable nutrition menu/plan (title + notes + ordered meal/item list)
-- for a specific trainee, and lets that trainee read their own assigned
-- plan (read-only). Deliberately separate from, and does not touch,
-- public.foods / public.trainee_nutrition_logs (003_nutrition.sql,
-- 022_trainee_nutrition_access.sql) -- the existing food log keeps working
-- exactly as it does today; this is a second, independent nutrition
-- concept (a prescribed menu) living in its own tables.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 034_safe_trainee_invite_retry.sql. Wrapped in
-- a single transaction so it applies entirely or not at all. Purely
-- additive: two new tables, no existing table/column/policy/function is
-- touched, no existing row is affected.
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- Ownership model (two levels, same shape as trainee_training_programs ->
-- trainee_program_workouts, 018_training_programs.sql):
--   trainees (existing) -> trainee_nutrition_plans -> trainee_nutrition_plan_items
-- Both new tables carry their own coach_id (denormalized, same convention
-- as every other coach-owned table in this schema) and every coach-facing
-- policy re-verifies ownership against the immediate parent row, not just
-- coach_id alone -- same reasoning 016/017/018 already document: a row's
-- own coach_id doesn't stop a coach from pointing it at a parent row that
-- isn't actually theirs, since a foreign key only requires the parent to
-- exist, not that it's owned by that same coach.
--
-- "Assigning" a plan to a trainee is simply creating it with that
-- trainee's id -- there is no separate reusable-template/assignment
-- concept here (nothing else in this schema has one either; every
-- per-trainee table, foods aside, is created directly for one trainee).
-- trainee_id is UNIQUE on trainee_nutrition_plans, so a trainee has at
-- most one plan at a time -- "the assigned plan" the trainee's own My
-- Nutrition area shows is always unambiguous. Changing what a trainee is
-- on is done by editing that one row in place (title/notes) and its item
-- list, or deleting it and creating a new one -- both explicitly requested
-- capabilities, both plain UPDATE/DELETE through RLS, no RPC layer needed
-- since (unlike the trainee-write paths elsewhere in this schema) only
-- the coach ever writes here.
--
-- Editable, not append-only: like trainee_training_programs/
-- trainee_program_workouts (018) and unlike the trainee_progress_logs /
-- trainee_nutrition_logs family, a plan and its items are live content the
-- coach edits and reorders in place -- both tables get real UPDATE
-- policies. Unlike trainee_training_programs (which has NO delete policy,
-- archived via status instead), trainee_nutrition_plans DOES get a real
-- DELETE policy -- this milestone explicitly asks for delete, a plan has
-- no execution/history concept anything else references, and deleting it
-- cascades to its items (on delete cascade) so no orphaned item rows can
-- be left behind.
--
-- Trainee read access (section 3) follows the established
-- trainee_get_auth_context() pattern (022_trainee_nutrition_access.sql,
-- reused unchanged here, not redefined) -- required rather than a plain
-- trainees subquery specifically because a trainee has NO SELECT policy on
-- public.trainees at all (021/022's documented RLS self-reference bug: a
-- direct subquery against trainees from inside another policy is NOT
-- exempt from trainees' own RLS and would silently match zero rows for a
-- real trainee). No INSERT/UPDATE/DELETE policy is granted to the trainee
-- role on either table -- RLS default-denies those outright, so the plan
-- is read-only for the trainee exactly as required.

begin;

-- =====================================================================
-- 1. trainee_nutrition_plans -- at most one per trainee (the "assigned"
--    plan).
-- =====================================================================
create table public.trainee_nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null unique references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- trainee_id already has a unique index from the UNIQUE constraint above,
-- so a lookup by trainee_id (the only access pattern the frontend needs)
-- is already indexed -- no separate index required. coach_id is indexed
-- for the coach's own dashboard/listing use, matching
-- trainee_training_programs_coach_id_idx (018).
create index trainee_nutrition_plans_coach_id_idx
  on public.trainee_nutrition_plans (coach_id);

-- updated_at trigger, same shape as public.set_training_programs_updated_at
-- (018) -- one function per table, matching that existing per-table
-- convention rather than introducing a shared/generic one.
create function public.set_nutrition_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_nutrition_plans_set_updated_at
  before update on public.trainee_nutrition_plans
  for each row
  execute function public.set_nutrition_plans_updated_at();

alter table public.trainee_nutrition_plans enable row level security;

-- Every policy verifies coach_id = auth.uid() AND that trainee_id still
-- belongs to that same coach (same shape as trainee_training_programs'
-- policies, 018).
create policy trainee_nutrition_plans_select_own on public.trainee_nutrition_plans
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_nutrition_plans.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plans_insert_own on public.trainee_nutrition_plans
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_nutrition_plans.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plans_update_own on public.trainee_nutrition_plans
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_nutrition_plans.trainee_id
        and trainees.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_nutrition_plans.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- Real delete policy (unlike trainee_training_programs) -- see the design
-- summary above for why this is safe here: nothing else in the schema
-- references a plan, and deleting one cascades to its items.
create policy trainee_nutrition_plans_delete_own on public.trainee_nutrition_plans
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_nutrition_plans.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 2. trainee_nutrition_plan_items -- ordered meals/items within a plan.
-- =====================================================================
create table public.trainee_nutrition_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.trainee_nutrition_plans(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ordered lookup within a plan is the only access pattern this table
-- needs -- same reasoning as trainee_program_workouts_program_id_idx (018).
create index trainee_nutrition_plan_items_plan_id_idx
  on public.trainee_nutrition_plan_items (plan_id, display_order);

create function public.set_nutrition_plan_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainee_nutrition_plan_items_set_updated_at
  before update on public.trainee_nutrition_plan_items
  for each row
  execute function public.set_nutrition_plan_items_updated_at();

alter table public.trainee_nutrition_plan_items enable row level security;

-- Ownership check climbs one level: coach_id = auth.uid() AND the
-- referenced plan is actually owned by that same coach -- does not need to
-- re-check trainees itself, since trainee_nutrition_plans' own policies
-- above already guarantee every row it holds is legitimately owned (same
-- reasoning as trainee_program_workouts' policies, 018).
create policy trainee_nutrition_plan_items_select_own on public.trainee_nutrition_plan_items
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans
      where trainee_nutrition_plans.id = trainee_nutrition_plan_items.plan_id
        and trainee_nutrition_plans.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_items_insert_own on public.trainee_nutrition_plan_items
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans
      where trainee_nutrition_plans.id = trainee_nutrition_plan_items.plan_id
        and trainee_nutrition_plans.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_items_update_own on public.trainee_nutrition_plan_items
  for update
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans
      where trainee_nutrition_plans.id = trainee_nutrition_plan_items.plan_id
        and trainee_nutrition_plans.coach_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans
      where trainee_nutrition_plans.id = trainee_nutrition_plan_items.plan_id
        and trainee_nutrition_plans.coach_id = auth.uid()
    )
  );

create policy trainee_nutrition_plan_items_delete_own on public.trainee_nutrition_plan_items
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainee_nutrition_plans
      where trainee_nutrition_plans.id = trainee_nutrition_plan_items.plan_id
        and trainee_nutrition_plans.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 3. Trainee read access -- own assigned plan only, fully read-only.
-- =====================================================================
-- public.trainee_get_auth_context() (022_trainee_nutrition_access.sql) is
-- reused completely unchanged -- not redefined here. Required instead of a
-- plain trainees subquery because a trainee has no SELECT policy on
-- public.trainees at all (021/022's documented RLS self-reference bug).
-- No INSERT/UPDATE/DELETE policy is added for the trainee role on either
-- table -- RLS default-denies those, so a trainee can never create, edit,
-- reorder, or delete anything here, only read their own assigned plan.
create policy trainee_nutrition_plans_select_own_trainee on public.trainee_nutrition_plans
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_nutrition_plans.trainee_id
        and ctx.coach_id = trainee_nutrition_plans.coach_id
    )
  );

-- Climbs to trainee_nutrition_plans, whose own trainee-facing policy above
-- already guarantees the plan (and therefore, transitively, every item
-- that legitimately references it) belongs to the caller -- re-verified
-- directly here anyway (via the same trainee_get_auth_context() join)
-- rather than trusted transitively, so this policy is self-contained and
-- correct even if evaluated independently.
create policy trainee_nutrition_plan_items_select_own_trainee on public.trainee_nutrition_plan_items
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1
      from public.trainee_nutrition_plans p
      join public.trainee_get_auth_context() ctx
        on ctx.trainee_id = p.trainee_id and ctx.coach_id = p.coach_id
      where p.id = trainee_nutrition_plan_items.plan_id
    )
  );

commit;
