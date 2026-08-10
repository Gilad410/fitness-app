-- Body Circumferences milestone -- dated circumference tracking, the
-- circumference counterpart to trainee_progress_logs (002_progress_logs.sql
-- / 014_progress_logs_delete.sql). Each of the six measurements is
-- optional per entry (a coach may only measure some on a given day), but
-- at least one must be present -- an entirely empty row isn't a
-- meaningful log.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 015_trainee_starting_circumferences.sql.

create table public.trainee_circumference_logs (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  abdomen_cm numeric(5, 1) check (abdomen_cm is null or abdomen_cm > 0),
  neck_cm numeric(5, 1) check (neck_cm is null or neck_cm > 0),
  right_arm_cm numeric(5, 1) check (right_arm_cm is null or right_arm_cm > 0),
  left_arm_cm numeric(5, 1) check (left_arm_cm is null or left_arm_cm > 0),
  right_leg_cm numeric(5, 1) check (right_leg_cm is null or right_leg_cm > 0),
  left_leg_cm numeric(5, 1) check (left_leg_cm is null or left_leg_cm > 0),
  note text,
  logged_at date not null default current_date,
  created_at timestamptz not null default now(),
  constraint trainee_circumference_logs_at_least_one_measurement check (
    abdomen_cm is not null or neck_cm is not null or right_arm_cm is not null or
    left_arm_cm is not null or right_leg_cm is not null or left_leg_cm is not null
  )
);

create index trainee_circumference_logs_trainee_id_idx
  on public.trainee_circumference_logs (trainee_id, logged_at desc);

alter table public.trainee_circumference_logs enable row level security;

-- Every policy verifies coach_id = auth.uid() AND that trainee_id still
-- belongs to that same coach. The second check matters because coach_id
-- alone doesn't stop a coach from pointing a row at *another* coach's
-- trainee_id (the FK only requires the trainee to exist, not that it's
-- theirs) -- this closes that gap on select, insert, and delete alike.
create policy trainee_circumference_logs_select_own on public.trainee_circumference_logs
  for select
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_circumference_logs_insert_own on public.trainee_circumference_logs
  for insert
  with check (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

create policy trainee_circumference_logs_delete_own on public.trainee_circumference_logs
  for delete
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.trainees
      where trainees.id = trainee_circumference_logs.trainee_id
        and trainees.coach_id = auth.uid()
    )
  );

-- No update policy: corrections are delete + re-add, matching
-- trainee_progress_logs (014_progress_logs_delete.sql) and
-- trainee_nutrition_logs (003_nutrition.sql).
