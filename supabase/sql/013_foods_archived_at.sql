-- Soft-Delete Coach Foods milestone -- lets a coach remove a food they
-- created from their own picker list without breaking historical
-- nutrition logs that reference it.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 012_trainees_target_weight.sql.
--
-- Why soft delete, not hard delete: public.trainee_nutrition_logs.food_id
-- is `not null references public.foods(id) on delete restrict`
-- (003_nutrition.sql), and public.foods has no delete RLS policy at all
-- (also 003_nutrition.sql, by original design -- "a food must stay
-- available even if the coach stops using it going forward"). A hard
-- delete is therefore already blocked twice over today; this migration
-- doesn't change that. Instead, archived_at marks a food as no longer
-- offered for NEW entries while leaving the row (and every log that
-- points at it) fully intact and readable.
--
-- Purely additive: one nullable column, no default, no existing row
-- touched, no constraint loosened or removed, no other table or earlier
-- migration modified. NULL means "active" (every existing row today).

alter table public.foods
  add column archived_at timestamptz;
