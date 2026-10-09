-- Keep recorded history intact during ordinary workout/exercise edits, while
-- allowing existing account-deletion cascades to complete in one transaction.
-- Migration 062 is already installed in production; apply this after it.
begin;

alter table public.trainee_workout_sessions
  drop constraint trainee_workout_sessions_coach_id_fkey,
  add constraint trainee_workout_sessions_coach_id_fkey
    foreign key (coach_id) references auth.users(id)
    on delete no action deferrable initially deferred,
  drop constraint trainee_workout_sessions_workout_id_fkey,
  add constraint trainee_workout_sessions_workout_id_fkey
    foreign key (workout_id) references public.trainee_program_workouts(id)
    on delete no action deferrable initially deferred;

alter table public.trainee_workout_set_logs
  drop constraint trainee_workout_set_logs_exercise_id_fkey,
  add constraint trainee_workout_set_logs_exercise_id_fkey
    foreign key (exercise_id) references public.trainee_workout_exercises(id)
    on delete no action deferrable initially deferred;

commit;
