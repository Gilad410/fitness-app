import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const coach = '10000000-0000-4000-8000-000000000001'
const otherCoach = '10000000-0000-4000-8000-000000000002'
const trainee = '20000000-0000-4000-8000-000000000001'
const otherTrainee = '20000000-0000-4000-8000-000000000002'
const traineeAuth = '30000000-0000-4000-8000-000000000001'
const otherTraineeAuth = '30000000-0000-4000-8000-000000000002'
const program = '40000000-0000-4000-8000-000000000001'
const workout = '50000000-0000-4000-8000-000000000001'
const exercise = '60000000-0000-4000-8000-000000000001'

test('workout history enforces ownership and coach status in PostgreSQL', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create role authenticated;
      create role anon;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.uid', true), '')::uuid
      $$;
      create table public.coaches (user_id uuid primary key, access_status text not null);
      create table public.trainees (id uuid primary key, coach_id uuid, auth_user_id uuid, status text);
      create table public.trainee_training_programs (id uuid primary key, trainee_id uuid, coach_id uuid, status text);
      create table public.trainee_program_workouts (id uuid primary key, program_id uuid, coach_id uuid, name text);
      create table public.trainee_workout_exercises (id uuid primary key, workout_id uuid, coach_id uuid, name text);
      create function public.is_trainee() returns boolean language sql security definer stable as $$
        select exists (select 1 from public.trainees where auth_user_id = auth.uid())
      $$;
      create function public.is_coach() returns boolean language sql security definer stable as $$
        select exists (select 1 from public.coaches where user_id = auth.uid() and access_status = 'active')
      $$;
      create function public.trainee_get_auth_context() returns table (trainee_id uuid, coach_id uuid)
      language sql security definer stable as $$
        select t.id, t.coach_id from public.trainees t
        join public.coaches c on c.user_id = t.coach_id
        where t.auth_user_id = auth.uid() and t.status = 'active' and c.access_status = 'active'
      $$;
      grant usage on schema public, auth to authenticated;
      grant select on public.trainees to authenticated;
      grant execute on function public.is_trainee(), public.is_coach(),
        public.trainee_get_auth_context(), auth.uid() to authenticated;
      insert into auth.users values
        ('${coach}'), ('${otherCoach}'), ('${traineeAuth}'), ('${otherTraineeAuth}');
      insert into public.coaches values ('${coach}', 'active'), ('${otherCoach}', 'active');
      insert into public.trainees values
        ('${trainee}', '${coach}', '${traineeAuth}', 'active'),
        ('${otherTrainee}', '${otherCoach}', '${otherTraineeAuth}', 'active');
      insert into public.trainee_training_programs values ('${program}', '${trainee}', '${coach}', 'active');
      insert into public.trainee_program_workouts values ('${workout}', '${program}', '${coach}', 'רגליים');
      insert into public.trainee_workout_exercises values ('${exercise}', '${workout}', '${coach}', 'סקוואט');
    `)
    await db.exec(await readFile(new URL('./062_workout_sessions.sql', import.meta.url), 'utf8'))
    await db.exec(`set role authenticated; set app.uid = '${traineeAuth}'`)

    const started = await db.query('select public.trainee_start_workout($1) as session', [workout])
    const sessionId = started.rows[0].session.id
    assert.equal(started.rows[0].session.status, 'active')
    const saved = await db.query('select public.trainee_save_workout_set($1,$2,1,8,80,\'קל\') as set', [sessionId, exercise])
    assert.equal(saved.rows[0].set.weight_kg, 80)
    await assert.rejects(() => db.query('select public.trainee_save_workout_set($1,$2,2,8,-1,null)', [sessionId, exercise]))
    await assert.rejects(() => db.query(`insert into public.trainee_workout_sessions (trainee_id,coach_id,workout_id,workout_name)
      values ('${trainee}','${coach}','${workout}','מזויף')`))

    await db.exec(`set app.uid = '${otherTraineeAuth}'`)
    assert.equal((await db.query('select * from public.trainee_workout_sessions')).rows.length, 0)
    await assert.rejects(() => db.query('select public.trainee_finish_workout($1)', [sessionId]))

    await db.exec(`set app.uid = '${coach}'`)
    assert.equal((await db.query('select * from public.trainee_workout_sessions')).rows.length, 1)
    assert.equal((await db.query('select * from public.trainee_workout_set_logs')).rows.length, 1)
    await assert.rejects(() => db.query('select public.trainee_finish_workout($1)', [sessionId]))

    await db.exec(`set app.uid = '${traineeAuth}'`)
    const finished = await db.query('select public.trainee_finish_workout($1) as session', [sessionId])
    assert.equal(finished.rows[0].session.status, 'completed')
    await assert.rejects(() => db.query('select public.trainee_save_workout_set($1,$2,2,8,85,null)', [sessionId, exercise]))

    await db.exec(`reset role; update public.coaches set access_status = 'suspended' where user_id = '${coach}'; set role authenticated; set app.uid = '${coach}'`)
    assert.equal((await db.query('select * from public.trainee_workout_sessions')).rows.length, 0)
    await db.exec(`set app.uid = '${traineeAuth}'`)
    assert.equal((await db.query('select * from public.trainee_workout_sessions')).rows.length, 0)
    await db.exec(`reset role; delete from public.trainees where id = '${trainee}'`)
    assert.equal((await db.query('select * from public.trainee_workout_sessions')).rows.length, 0)
    assert.equal((await db.query('select * from public.trainee_workout_set_logs')).rows.length, 0)
  } finally {
    await db.close()
  }
})
