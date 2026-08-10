-- Weight Tracking milestone -- lets a coach delete a mis-entered weigh-in
-- so it can be re-logged correctly, matching the existing correction
-- convention used by trainee_nutrition_logs (delete + re-add, never
-- edited in place).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 013_foods_archived_at.sql.
--
-- Purely additive: adds a single RLS policy to the existing
-- public.trainee_progress_logs table (see 002_progress_logs.sql). No
-- column, table, trigger, or existing row is touched. Still no update
-- policy -- corrections stay delete + re-add, consistent with
-- trainee_nutrition_logs (003_nutrition.sql).

create policy trainee_progress_logs_delete_own on public.trainee_progress_logs
  for delete
  using (coach_id = auth.uid());
