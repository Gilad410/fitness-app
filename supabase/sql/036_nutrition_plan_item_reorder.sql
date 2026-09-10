-- Nutrition plan item reorder -- fixes a real data-integrity bug in
-- moveItem() (src/features/nutrition/store/nutritionPlans.js), found by
-- independent review after 035_trainee_nutrition_plans.sql shipped. No
-- coach has used item reordering in production yet; this migration must
-- be applied before the fixed frontend code is relied on.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 035_trainee_nutrition_plans.sql. Wrapped in a
-- single transaction so it applies entirely or not at all. Purely
-- additive: one new function. No table, column, policy, or existing row
-- is touched.
--
-- =====================================================================
-- The bug
-- =====================================================================
-- moveItem() swapped two items' display_order by issuing two independent
-- UPDATE statements (via two separate PostgREST requests run in
-- parallel), then -- on any failure -- restored the client's own,
-- purely-local, pre-optimistic snapshot of the plan. Two problems follow:
--
--   1. Not atomic: if one UPDATE succeeds and the other fails (a
--      transient network blip between the two independent HTTP requests
--      is enough), the database is left with only ONE of the two items'
--      display_order actually changed -- a partially-applied swap, not a
--      swap at all. "Restoring the local array" in that case doesn't fix
--      anything server-side: the UI would show the pre-swap order while
--      the database now genuinely disagrees with it, and the next
--      real fetch would reveal a broken order (or, if PostgREST's own
--      ORDER BY happens to tie-break some other way, an item that seems
--      to have silently vanished from view until reordered again).
--   2. Two overlapping moveItem() calls (nothing on the client prevented
--      firing a second reorder for the same plan before the first one's
--      two writes had both settled) could race against each other,
--      compounding problem 1.
--
-- =====================================================================
-- The fix
-- =====================================================================
-- coach_swap_nutrition_plan_items() performs both display_order updates
-- inside ONE PL/pgSQL function body -- a single Postgres transaction,
-- genuinely atomic: either both rows change or (on any error, including
-- an ownership/same-plan check failing) neither does, full stop. This
-- closes problem 1 completely -- there is no partially-applied state left
-- for the client to ever need to reconcile, so restoring its own local
-- snapshot on failure is now always accurate (the database really is
-- unchanged whenever this function raises). Problem 2 (overlapping calls)
-- is addressed on the client side (nutritionPlans.js now refuses a second
-- moveItem() for the same trainee's plan while one is already in
-- flight) -- this function's own `for update` row locks are still a
-- useful independent backstop against a genuinely concurrent call (e.g.
-- two browser tabs) serializing safely rather than corrupting anything,
-- but the primary defense against a single coach's own UI firing two
-- overlapping requests lives in the store.
--
-- Ownership: checks coach_id = auth.uid() directly on each item row,
-- not by re-climbing to trainees -- sufficient here because coach_id on
-- trainee_nutrition_plan_items is already independently guaranteed
-- correct by that table's own INSERT policy (035, unmodified), which
-- re-verifies the item's plan is owned by that same coach before ever
-- allowing the row to be created; coach_id is never updated after insert
-- (no UPDATE grant touches it -- the frontend's own patch objects never
-- include it either). Same reasoning trainee_program_workouts'
-- policies (018) already rely on for not re-climbing all the way to
-- trainees on every check.

begin;

create or replace function public.coach_swap_nutrition_plan_items(
  p_item_id_a uuid,
  p_item_id_b uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.trainee_nutrition_plan_items%rowtype;
  v_b public.trainee_nutrition_plan_items%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may reorder nutrition plan items.';
  end if;

  -- Row locks held for the rest of this transaction -- a concurrent call
  -- touching either row (another reorder, or a delete) blocks here until
  -- this one commits or rolls back, rather than interleaving with it.
  select * into v_a
  from public.trainee_nutrition_plan_items
  where id = p_item_id_a and coach_id = auth.uid()
  for update;

  if not found then
    raise exception 'Nutrition plan item not found.';
  end if;

  select * into v_b
  from public.trainee_nutrition_plan_items
  where id = p_item_id_b and coach_id = auth.uid()
  for update;

  if not found then
    raise exception 'Nutrition plan item not found.';
  end if;

  if v_a.plan_id <> v_b.plan_id then
    raise exception 'Both items must belong to the same nutrition plan.';
  end if;

  update public.trainee_nutrition_plan_items
  set display_order = v_b.display_order
  where id = v_a.id;

  update public.trainee_nutrition_plan_items
  set display_order = v_a.display_order
  where id = v_b.id;
end;
$$;

revoke execute on function public.coach_swap_nutrition_plan_items(uuid, uuid) from public;
revoke execute on function public.coach_swap_nutrition_plan_items(uuid, uuid) from anon;
grant execute on function public.coach_swap_nutrition_plan_items(uuid, uuid) to authenticated;

commit;
