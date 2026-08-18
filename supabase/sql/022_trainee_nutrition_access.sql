-- Trainee Nutrition Access milestone -- gives a trainee a narrow,
-- self-service version of the nutrition experience 003_nutrition.sql /
-- 005_food_reference_protein_and_expansion.sql already built for coaches:
-- view their own logged history and daily totals, log a new entry against
-- either their coach's existing food catalog or the shared reference
-- catalogs (food_reference_catalog / restaurant_food_items), and delete
-- their own mis-logged entry.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 021_trainee_auth_and_roles.sql. Wrapped in a
-- single transaction so it applies entirely or not at all.
--
-- =====================================================================
-- Revision note (reviewed before being run; nothing in it has been
-- executed against the database)
-- =====================================================================
-- A security review of the first draft of this migration found a bug
-- affecting BOTH this migration's own new policies AND an already-applied
-- 021 policy, plus three narrower issues. All fixed in this version:
--
--   1. RLS self-reference bug: a trainee has no SELECT policy on
--      public.trainees at all (021 deliberately routes trainee profile
--      access only through the security-definer trainee_get_own_profile()
--      RPC, precisely so the coach's private `notes` and invite/token
--      columns are never exposed). That means a plain
--      `exists (select 1 from public.trainees where ...)` subquery
--      written directly inside another table's RLS policy is NOT exempt
--      from RLS -- it runs as the querying (trainee) role, `trainees` RLS
--      applies to it exactly as it would to a direct query, and it
--      silently matches zero rows. The first draft's foods/
--      trainee_nutrition_logs trainee policies had exactly this bug, and
--      -- more importantly -- so does 021's already-applied
--      trainee_notifications_select_own_trainee, which was never actually
--      exercised against a real notification before now. Fixed by adding
--      one new security-definer helper, public.trainee_get_auth_context()
--      (section 0 below), which resolves trainee_id/coach_id as the
--      table owner (bypassing trainees' RLS, same mechanism
--      trainee_get_own_profile() already relies on) and is used by every
--      trainee-facing policy and function from here on, including a
--      corrective drop+recreate of the 021 notifications policy
--      (section 3) and its mark-read RPC.
--   2. Row consistency: every trainee-facing policy/RPC now requires a
--      row's trainee_id AND coach_id to BOTH match the caller's resolved
--      context (not trainee_id alone) -- a corrupted or mislinked row
--      with a matching trainee_id but the wrong coach_id is neither
--      readable nor deletable.
--   3. Archived foods: the p_food_id path now rejects an archived food
--      outright (never usable for a new log entry); the reference-food
--      path never reuses or silently revives an archived same-name food,
--      and returns one generic "currently unavailable" error rather than
--      leaking constraint details -- see section 4.
--   4. Reference-food creation race: the previous SELECT-then-INSERT was
--      replaced with an atomic INSERT ... ON CONFLICT DO NOTHING against
--      the existing foods_coach_id_name_idx unique index, so two
--      concurrent requests creating the same coach food can no longer
--      race or error unhandled -- see section 4.
--
-- Purely additive and safe for existing data otherwise: no column,
-- constraint, trigger, or coach-facing policy is altered; no existing row
-- is touched. The only pre-existing object this migration changes is the
-- one 021 policy named in point 1 above (an explicit, narrow correction,
-- not a new capability) -- every coach policy and every other
-- trainee-facing object from 021 is untouched.
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- Reading:
--   - food_reference_catalog and restaurant_food_items already grant
--     select to "any authenticated user" (004/009: `using (auth.uid() is
--     not null)`) -- shared, non-sensitive reference data. A trainee can
--     already read both; this migration adds no policy to either table.
--   - foods (a coach's own catalog) and trainee_nutrition_logs (a
--     trainee's own logged history) each get exactly one new SELECT
--     policy, both anchored on public.trainee_get_auth_context() rather
--     than a direct trainees subquery. Neither table gets an
--     INSERT/UPDATE/DELETE policy for the trainee role -- RLS
--     default-denies those outright; the only write paths are the two
--     RPCs below.
--
-- Writing (logging a new entry): one narrow RPC,
-- trainee_log_nutrition_entry(), reproduces NutritionSection.vue's two
-- coach source branches (an existing food, grams-based; a restaurant
-- item, servings-based) plus a third the trainee needs that the coach UI
-- doesn't: picking directly from the shared food_reference_catalog. See
-- section 4 for the full walkthrough of how that third path can create a
-- `foods` row without ever giving the trainee free rein over the coach's
-- catalog. trainee_id/coach_id are never parameters -- both are resolved
-- via trainee_get_auth_context() inside the function, every time.
-- calories/protein are never parameters either and are never computed
-- here: every insert below omits those columns entirely, so
-- set_nutrition_log_calories() (003/005/011, unmodified by this
-- migration) remains the sole, authoritative source for both.
--
-- Deleting: trainee_delete_nutrition_entry() takes only a log id,
-- re-derives full ownership (trainee_id AND coach_id) the same way, and
-- deletes only if both match. No DELETE policy is granted to the trainee
-- role on the table itself.

begin;

-- =====================================================================
-- 0. public.trainee_get_auth_context() -- the one place every
--    trainee-facing policy/RPC below resolves "who is this trainee, and
--    which coach do they belong to".
-- =====================================================================
-- security definer so it resolves the caller's own trainees row as the
-- table owner, bypassing trainees' RLS (which grants the trainee role no
-- direct row access at all -- see the revision note above). Returns at
-- most one row: trainees.auth_user_id is unique (021), and this only
-- ever matches the CALLER's own row via auth.uid(). Also requires
-- public.is_trainee(), so a coach account (or a linked-but-since-
-- unlinked/role-revoked account) resolves to zero rows here even if some
-- stale auth_user_id link existed.
create or replace function public.trainee_get_auth_context()
returns table (trainee_id uuid, coach_id uuid)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.id, t.coach_id
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_auth_context() from public;
grant execute on function public.trainee_get_auth_context() to authenticated;

-- =====================================================================
-- 1. Trainee read access: foods (coach's own catalog, read-only)
-- =====================================================================
-- Lets the trainee browse/search their own coach's existing foods when
-- picking what to log -- exactly the list NutritionSection.vue's picker
-- shows a coach, minus the ability to add/edit/archive anything in it.
-- Archived rows are deliberately NOT filtered out here: a trainee's own
-- past log entries can reference an archived food (food:foods(name) in
-- the join the frontend will use), and hiding the row would break
-- rendering that history -- the RPC below is what refuses to let an
-- archived food be used for a NEW entry, not this policy.
-- No INSERT/UPDATE/DELETE policy is added for the trainee role, so
-- foods_insert_own / foods_update_own (021, both already require
-- public.is_coach()) are completely unaffected.
create policy foods_select_own_trainee on public.foods
  for select
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.coach_id = foods.coach_id
    )
  );

-- =====================================================================
-- 2. Trainee read access: trainee_nutrition_logs (own history only)
-- =====================================================================
-- Requires the row's trainee_id AND coach_id to both match the caller's
-- resolved context in the same EXISTS check -- a row with a correct
-- trainee_id but a corrupted/mismatched coach_id does not qualify. Coach
-- policies on this table (021: public.is_coach() + trainees ownership
-- re-verification) are untouched.
create policy trainee_nutrition_logs_select_own_trainee on public.trainee_nutrition_logs
  for select
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_nutrition_logs.trainee_id
        and ctx.coach_id = trainee_nutrition_logs.coach_id
    )
  );

-- =====================================================================
-- 3. Correction to 021: trainee_notifications_select_own_trainee /
--    trainee_mark_notification_read()
-- =====================================================================
-- ADDITIVE CORRECTION TO THE ALREADY-APPLIED MIGRATION
-- 021_trainee_auth_and_roles.sql -- not a new capability. That
-- migration's trainee_notifications_select_own_trainee policy queried
-- public.trainees directly from inside the policy body, which hits the
-- exact RLS self-reference bug described in the revision note above and
-- would return zero rows for every real trainee. Dropped and recreated
-- here using trainee_get_auth_context(), with row consistency tightened
-- to require both trainee_id and coach_id to match (021 only checked
-- ownership via trainee_id through the join). No other object from 021
-- is touched, and the coach-side notification policies
-- (trainee_notifications_select_own / _insert_own, 020/021) are
-- untouched.
drop policy if exists trainee_notifications_select_own_trainee on public.trainee_notifications;
create policy trainee_notifications_select_own_trainee on public.trainee_notifications
  for select
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_notifications.trainee_id
        and ctx.coach_id = trainee_notifications.coach_id
    )
  );

-- trainee_mark_notification_read() was already security definer, so its
-- own internal trainees lookup was NOT subject to the RLS bug above --
-- but it only verified trainee_id, not coach_id. Recreated to check both,
-- via the same helper, for the same full-row-consistency reason as
-- section 2. Still restricted to flipping is_read/read_at only, on
-- exactly one row, exactly as before.
create or replace function public.trainee_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may mark their own notification as read.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  update public.trainee_notifications
  set is_read = true,
      read_at = now()
  where id = p_notification_id
    and is_read = false
    and trainee_id = v_trainee_id
    and coach_id = v_coach_id;
end;
$$;

-- Grants unchanged from 021 (function replaced in place, same signature
-- -- CREATE OR REPLACE preserves existing grants, but restated here for
-- clarity and to guarantee the intended end state regardless of what ran
-- before).
revoke execute on function public.trainee_mark_notification_read(uuid) from public;
grant execute on function public.trainee_mark_notification_read(uuid) to authenticated;

-- =====================================================================
-- 4. trainee_log_nutrition_entry() -- the only way a trainee can create
--    a nutrition log row (or, along the way, a new `foods` row).
-- =====================================================================
-- Exactly one of p_food_id / p_reference_food_id / p_restaurant_food_item_id
-- must be supplied, matching the shape of trainee_nutrition_logs' existing
-- "exactly one source" CHECK constraint (trainee_nutrition_logs_source_check,
-- 011) -- re-validated here first for a clear error message, with that
-- constraint remaining the final backstop regardless.
create or replace function public.trainee_log_nutrition_entry(
  p_food_id uuid default null,
  p_reference_food_id uuid default null,
  p_restaurant_food_item_id uuid default null,
  p_grams numeric default null,
  p_servings numeric default null,
  p_logged_at date default current_date
)
returns public.trainee_nutrition_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_food_id uuid;
  v_food_archived_at timestamptz;
  v_ref_name text;
  v_ref_calories numeric;
  v_ref_protein numeric;
  v_source_count int;
  v_row public.trainee_nutrition_logs%rowtype;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may log their own nutrition entry.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  if p_logged_at is null then
    raise exception 'A log date is required.';
  end if;

  v_source_count := (case when p_food_id is not null then 1 else 0 end)
    + (case when p_reference_food_id is not null then 1 else 0 end)
    + (case when p_restaurant_food_item_id is not null then 1 else 0 end);

  if v_source_count <> 1 then
    raise exception 'Exactly one of food, reference food, or restaurant item must be provided.';
  end if;

  -- ---- Restaurant/chain item: servings-based, no `foods` row involved.
  if p_restaurant_food_item_id is not null then
    if p_servings is null or p_servings <= 0 then
      raise exception 'Servings must be a positive number.';
    end if;

    if not exists (
      select 1 from public.restaurant_food_items where id = p_restaurant_food_item_id
    ) then
      raise exception 'Restaurant item not found.';
    end if;

    insert into public.trainee_nutrition_logs (trainee_id, coach_id, restaurant_food_item_id, servings, logged_at)
    values (v_trainee_id, v_coach_id, p_restaurant_food_item_id, p_servings, p_logged_at)
    returning * into v_row;

    return v_row;
  end if;

  -- ---- Everything else is grams-based against public.foods.
  if p_grams is null or p_grams <= 0 then
    raise exception 'Grams must be a positive number.';
  end if;

  if p_food_id is not null then
    -- Must already exist, active, in THIS trainee's own coach's catalog
    -- -- never another coach's, never a client-invented id, and never an
    -- archived row (a trainee cannot revive or reuse a food the coach
    -- removed from active use). No row is modified here, only read.
    select id, archived_at into v_food_id, v_food_archived_at
    from public.foods
    where id = p_food_id and coach_id = v_coach_id;

    if v_food_id is null then
      raise exception 'Food not found.';
    end if;

    if v_food_archived_at is not null then
      raise exception 'This food is no longer available for new entries.';
    end if;
  else
    -- p_reference_food_id path: the reference row is the ONLY source of
    -- name/calories/protein below -- never a client-supplied number.
    select name, calories_per_100g, protein_per_100g
      into v_ref_name, v_ref_calories, v_ref_protein
    from public.food_reference_catalog
    where id = p_reference_food_id;

    if not found then
      raise exception 'Reference food not found.';
    end if;

    -- Atomic, concurrency-safe: relies on the existing
    -- foods_coach_id_name_idx unique index (coach_id, lower(name)),
    -- 003_nutrition.sql. If another request (or the coach, concurrently)
    -- creates the same (coach, name) row first, ON CONFLICT DO NOTHING
    -- simply skips this insert -- no error, no race -- and v_food_id
    -- stays null so the fallback lookup below finds whichever row won.
    -- This never UPDATEs an existing foods row, only inserts a brand-new
    -- one or (below) reuses an existing one completely unmodified.
    insert into public.foods (coach_id, name, calories_per_100g, protein_per_100g)
    values (v_coach_id, v_ref_name, v_ref_calories, v_ref_protein)
    on conflict (coach_id, (lower(name))) do nothing
    returning id into v_food_id;

    if v_food_id is null then
      -- A row with this (coach, name) already existed. If it's active,
      -- reuse it exactly as the coach's own UI reuses a matching food
      -- (untouched, not modified). If it's archived, refuse -- a trainee
      -- can never silently revive or reuse an archived food, and never
      -- learns anything more specific than "unavailable" (no distinction
      -- between "archived" and any other reason, to avoid leaking
      -- catalog state beyond what the read policy already shows them).
      select id, archived_at into v_food_id, v_food_archived_at
      from public.foods
      where coach_id = v_coach_id and lower(name) = lower(v_ref_name);

      if v_food_id is null or v_food_archived_at is not null then
        raise exception 'This food is currently unavailable. Please contact your coach.';
      end if;
    end if;
  end if;

  insert into public.trainee_nutrition_logs (trainee_id, coach_id, food_id, grams, logged_at)
  values (v_trainee_id, v_coach_id, v_food_id, p_grams, p_logged_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date) from public;
grant execute on function public.trainee_log_nutrition_entry(uuid, uuid, uuid, numeric, numeric, date) to authenticated;

-- =====================================================================
-- 5. trainee_delete_nutrition_entry() -- the only way a trainee can
--    delete one of their own nutrition log rows.
-- =====================================================================
-- No DELETE policy is granted to the trainee role on trainee_nutrition_logs
-- at all -- this RPC is the sole path, and it requires full row
-- consistency (trainee_id AND coach_id both matching the caller's
-- resolved context) before deleting anything.
create or replace function public.trainee_delete_nutrition_entry(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may delete their own nutrition entry.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  delete from public.trainee_nutrition_logs
  where id = p_log_id
    and trainee_id = v_trainee_id
    and coach_id = v_coach_id;

  if not found then
    raise exception 'Nutrition entry not found.';
  end if;
end;
$$;

revoke execute on function public.trainee_delete_nutrition_entry(uuid) from public;
grant execute on function public.trainee_delete_nutrition_entry(uuid) to authenticated;

commit;

-- =====================================================================
-- How shared-catalog selection works without ever editing the coach's
-- catalog (full walkthrough)
-- =====================================================================
-- 1. A trainee has no INSERT or UPDATE grant on public.foods at all --
--    section 1 above adds only a SELECT policy, nothing else, and RLS
--    default-denies any command with no matching policy.
-- 2. trainee_log_nutrition_entry() is `security definer`, so when IT
--    inserts into public.foods, that insert runs as the function's owner
--    (the table owner), not as the calling trainee -- it is not
--    exercising some grant the trainee secretly has; the trainee has
--    none. The function is the only door, and it only ever writes one
--    specific, narrow shape through that door.
-- 3. That shape is deliberately smaller than the RPC's own privileges
--    would technically allow: it never accepts a name, calories, or
--    protein value as a parameter. The only values it will ever write
--    into a new `foods` row are copied verbatim from the
--    food_reference_catalog row the trainee picked (by id) -- the
--    trainee chooses *which* reference row, never *what values* end up
--    in the catalog.
-- 4. It never UPDATEs an existing foods row, active or archived. Its
--    INSERT either succeeds outright (no prior row with that name for
--    this coach), or ON CONFLICT DO NOTHING silently skips it and the
--    fallback lookup either reuses the existing active row untouched, or
--    -- if that existing row is archived -- refuses with a generic
--    "unavailable" error instead of reusing, reviving, or modifying it.
-- 5. coach_id on the new row is always v_coach_id, resolved server-side
--    via trainee_get_auth_context() -- never a parameter -- so a trainee
--    can only ever add to their OWN coach's catalog, never point a row at
--    an unrelated coach.
-- 6. calories_per_100g/protein_per_100g on the row are copied once, at
--    creation, from the reference catalog -- after that, like every
--    other foods row, they are governed entirely by the pre-existing
--    foods_update_own policy (021: coach-only). A trainee cannot revisit
--    and change them, through this RPC or any other path.
-- Net effect: a trainee can make the shared reference catalog "show up"
-- in their coach's picker the first time it's used, exactly like the
-- coach's own UI does today when converting a suggestion into a saved
-- food -- but cannot type a name, cannot type a number, cannot edit an
-- existing entry, cannot revive an archived one, and cannot touch any
-- catalog but their own coach's.
