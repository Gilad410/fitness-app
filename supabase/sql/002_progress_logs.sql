-- Progress Tracking milestone — per-trainee weigh-in history.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql.

create table public.trainee_progress_logs (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  weight numeric(5, 1) not null check (weight > 0),
  note text,
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index trainee_progress_logs_trainee_id_idx
  on public.trainee_progress_logs (trainee_id, logged_at desc);

alter table public.trainee_progress_logs enable row level security;

create policy trainee_progress_logs_select_own on public.trainee_progress_logs
  for select
  using (coach_id = auth.uid());

create policy trainee_progress_logs_insert_own on public.trainee_progress_logs
  for insert
  with check (coach_id = auth.uid());

-- No update or delete policy: logs are append-only, never edited or
-- removed once recorded.
