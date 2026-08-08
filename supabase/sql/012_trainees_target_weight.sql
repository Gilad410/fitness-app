-- Target Weight milestone -- lets a coach record a trainee's target/goal
-- weight (ק"ג) alongside the existing starting_weight, editable from the
-- same trainee add/edit screen and shown on the trainee detail screen.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 011_restaurant_nutrition_logs.sql.
--
-- Purely additive: a single nullable column on public.trainees, mirroring
-- the existing starting_weight column (same numeric(5,1) shape, also
-- optional). No existing row is touched, no other table or earlier
-- migration is modified.
--
-- target_weight gets its own "> 0 when present" check -- starting_weight
-- (001_trainees.sql) predates this convention and is deliberately left
-- alone here, matching the "don't modify old migrations" constraint.

alter table public.trainees
  add column target_weight numeric(5, 1) check (target_weight is null or target_weight > 0);
