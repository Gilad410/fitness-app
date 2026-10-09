-- Workout execution history. Run after 061 in the Supabase SQL Editor.
-- One transaction: either the entire feature is installed or none of it is.
-- The two source tables remain coach-editable. RESTRICT keeps a workout or
-- exercise with recorded history from being deleted underneath that history.
begin;

create table if not exists public.trainee_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.trainees(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete restrict,
  workout_id uuid not null references public.trainee_program_workouts(id) on delete restrict,
  workout_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed')),
  check ((status = 'active' and finished_at is null) or
         (status = 'completed' and finished_at is not null and finished_at >= started_at))
);

create unique index if not exists trainee_one_active_workout_idx
  on public.trainee_workout_sessions (trainee_id) where status = 'active';
create index if not exists trainee_workout_sessions_history_idx
  on public.trainee_workout_sessions (trainee_id, started_at desc);
create index if not exists coach_workout_sessions_history_idx
  on public.trainee_workout_sessions (coach_id, trainee_id, started_at desc);

create table if not exists public.trainee_workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trainee_workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.trainee_workout_exercises(id) on delete restrict,
  exercise_name text not null,
  set_number integer not null check (set_number between 1 and 100),
  reps integer not null check (reps between 1 and 1000),
  weight_kg numeric(7,2) not null check (weight_kg between 0 and 10000),
  trainee_note text check (trainee_note is null or char_length(trainee_note) <= 1000),
  recorded_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);
create index if not exists trainee_workout_set_logs_exercise_idx
  on public.trainee_workout_set_logs (exercise_id, recorded_at desc);

alter table public.trainee_workout_sessions enable row level security;
alter table public.trainee_workout_set_logs enable row level security;

-- No direct writes. All writes use the narrow functions below; no client
-- may forge coach_id, trainee_id, timestamps, completion, or exercise links.
revoke all on public.trainee_workout_sessions from public, anon, authenticated;
revoke all on public.trainee_workout_set_logs from public, anon, authenticated;
grant select on public.trainee_workout_sessions to authenticated;
grant select on public.trainee_workout_set_logs to authenticated;

drop policy if exists workout_sessions_select_participants on public.trainee_workout_sessions;
create policy workout_sessions_select_participants on public.trainee_workout_sessions
  for select to authenticated using (
    (public.is_trainee() and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_workout_sessions.trainee_id
        and ctx.coach_id = trainee_workout_sessions.coach_id
    ))
    or (public.is_coach() and coach_id = auth.uid() and exists (
      select 1 from public.trainees t
      where t.id = trainee_workout_sessions.trainee_id and t.coach_id = auth.uid()
    ))
  );

drop policy if exists workout_set_logs_select_participants on public.trainee_workout_set_logs;
create policy workout_set_logs_select_participants on public.trainee_workout_set_logs
  for select to authenticated using (
    exists (select 1 from public.trainee_workout_sessions s where s.id = session_id)
  );

create or replace function public.trainee_start_workout(p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_workout record;
  v_session public.trainee_workout_sessions%rowtype;
begin
  select ctx.trainee_id, ctx.coach_id into v_trainee_id, v_coach_id
    from public.trainee_get_auth_context() ctx;
  if v_trainee_id is null then raise exception 'Active trainee access required.'; end if;

  select w.id, coalesce(nullif(trim(w.name), ''), 'אימון') as name
    into v_workout
  from public.trainee_program_workouts w
  join public.trainee_training_programs p on p.id = w.program_id
  where w.id = p_workout_id and p.trainee_id = v_trainee_id
    and p.coach_id = v_coach_id and w.coach_id = v_coach_id
    and p.status = 'active';
  if v_workout.id is null then raise exception 'Workout is not in the active program.'; end if;

  -- Serialize starts for this trainee, so two devices cannot create two
  -- active sessions. The unique partial index is a second line of defence.
  perform pg_advisory_xact_lock(hashtextextended(v_trainee_id::text, 0));
  select * into v_session from public.trainee_workout_sessions
    where trainee_id = v_trainee_id and status = 'active' for update;
  if v_session.id is not null then
    if v_session.workout_id <> p_workout_id then
      raise exception 'Finish the active workout before starting another.';
    end if;
    return to_jsonb(v_session);
  end if;

  insert into public.trainee_workout_sessions
    (trainee_id, coach_id, workout_id, workout_name)
  values (v_trainee_id, v_coach_id, p_workout_id, v_workout.name)
  returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

create or replace function public.trainee_save_workout_set(
  p_session_id uuid, p_exercise_id uuid, p_set_number integer,
  p_reps integer, p_weight_kg numeric, p_trainee_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_session public.trainee_workout_sessions%rowtype;
  v_exercise record;
  v_set public.trainee_workout_set_logs%rowtype;
begin
  select ctx.trainee_id, ctx.coach_id into v_trainee_id, v_coach_id
    from public.trainee_get_auth_context() ctx;
  if v_trainee_id is null then raise exception 'Active trainee access required.'; end if;
  select * into v_session from public.trainee_workout_sessions
    where id = p_session_id and trainee_id = v_trainee_id
      and coach_id = v_coach_id and status = 'active' for update;
  if v_session.id is null then raise exception 'No active workout session.'; end if;

  select id, name into v_exercise from public.trainee_workout_exercises
    where id = p_exercise_id and workout_id = v_session.workout_id
      and coach_id = v_coach_id;
  if v_exercise.id is null then raise exception 'Exercise does not belong to this workout.'; end if;
  if p_set_number not between 1 and 100 or p_reps not between 1 and 1000
     or p_weight_kg is null or p_weight_kg < 0 or p_weight_kg > 10000
     or p_weight_kg <> round(p_weight_kg, 2)
     or char_length(coalesce(p_trainee_note, '')) > 1000 then
    raise exception 'Invalid set values.';
  end if;

  insert into public.trainee_workout_set_logs
    (session_id, exercise_id, exercise_name, set_number, reps, weight_kg, trainee_note)
  values (p_session_id, p_exercise_id, v_exercise.name, p_set_number, p_reps,
          p_weight_kg, nullif(trim(p_trainee_note), ''))
  on conflict (session_id, exercise_id, set_number) do update
    set reps = excluded.reps, weight_kg = excluded.weight_kg,
        trainee_note = excluded.trainee_note, recorded_at = now()
  returning * into v_set;
  return to_jsonb(v_set);
end;
$$;

create or replace function public.trainee_finish_workout(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_session public.trainee_workout_sessions%rowtype;
begin
  select ctx.trainee_id, ctx.coach_id into v_trainee_id, v_coach_id
    from public.trainee_get_auth_context() ctx;
  if v_trainee_id is null then raise exception 'Active trainee access required.'; end if;
  update public.trainee_workout_sessions
  set status = 'completed', finished_at = greatest(now(), started_at)
  where id = p_session_id and trainee_id = v_trainee_id
    and coach_id = v_coach_id and status = 'active'
  returning * into v_session;
  if v_session.id is null then raise exception 'No active workout session.'; end if;
  return to_jsonb(v_session);
end;
$$;

revoke execute on function public.trainee_start_workout(uuid) from public, anon;
revoke execute on function public.trainee_save_workout_set(uuid, uuid, integer, integer, numeric, text) from public, anon;
revoke execute on function public.trainee_finish_workout(uuid) from public, anon;
grant execute on function public.trainee_start_workout(uuid) to authenticated;
grant execute on function public.trainee_save_workout_set(uuid, uuid, integer, integer, numeric, text) to authenticated;
grant execute on function public.trainee_finish_workout(uuid) to authenticated;

commit;
