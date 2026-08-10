-- Body Circumferences milestone -- lets a coach record a trainee's initial
-- circumferences (ס"מ) alongside the existing starting_weight, editable
-- from the same trainee add/edit screen and shown on the trainee detail
-- screen.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 014_progress_logs_delete.sql.
--
-- Purely additive: six nullable numeric(5,1) columns on public.trainees,
-- each with a "> 0 when present" check, mirroring target_weight
-- (012_trainees_target_weight.sql). No existing row touched, no other
-- table or earlier migration modified. No RLS change needed here --
-- public.trainees already scopes select/insert/update to
-- coach_id = auth.uid() (001_trainees.sql), and these are just more
-- columns on that same row.

alter table public.trainees
  add column starting_abdomen_cm numeric(5, 1) check (starting_abdomen_cm is null or starting_abdomen_cm > 0),
  add column starting_neck_cm numeric(5, 1) check (starting_neck_cm is null or starting_neck_cm > 0),
  add column starting_right_arm_cm numeric(5, 1) check (starting_right_arm_cm is null or starting_right_arm_cm > 0),
  add column starting_left_arm_cm numeric(5, 1) check (starting_left_arm_cm is null or starting_left_arm_cm > 0),
  add column starting_right_leg_cm numeric(5, 1) check (starting_right_leg_cm is null or starting_right_leg_cm > 0),
  add column starting_left_leg_cm numeric(5, 1) check (starting_left_leg_cm is null or starting_left_leg_cm > 0);
