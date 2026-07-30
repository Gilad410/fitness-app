-- Trainee Management milestone — coach-owned trainee roster.
--
-- This repo has no Supabase CLI/migrations set up. Run this file manually,
-- once, in the Supabase Dashboard -> SQL Editor, against a project where
-- Supabase Auth is already configured (auth.users must exist).

create table public.trainees (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) > 0),
  email text,
  phone text,
  notes text,
  start_date date,
  goal text check (goal in ('fat_loss', 'muscle_gain', 'maintenance', 'custom')),
  starting_weight numeric(5, 1),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainees_coach_id_idx on public.trainees (coach_id);
create index trainees_coach_id_status_idx on public.trainees (coach_id, status);

create function public.set_trainees_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trainees_set_updated_at
  before update on public.trainees
  for each row
  execute function public.set_trainees_updated_at();

alter table public.trainees enable row level security;

create policy trainees_select_own on public.trainees
  for select
  using (coach_id = auth.uid());

create policy trainees_insert_own on public.trainees
  for insert
  with check (coach_id = auth.uid());

create policy trainees_update_own on public.trainees
  for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- No delete policy: with RLS enabled and no delete policy, deletes are denied
-- outright. Trainees are archived (status = 'archived'), never hard-deleted.
