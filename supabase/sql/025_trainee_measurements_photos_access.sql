-- Trainee Measurements & Photos Access milestone -- lets a trainee read
-- their own circumference history (public.trainee_circumference_logs, 016)
-- and starting circumference baseline (public.trainees.starting_*_cm, 015),
-- log/delete their own circumference entries, and read/upload/delete their
-- own progress photos (public.trainee_progress_photos + the 'progress-photos'
-- Storage bucket, 017).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 024_trainee_progress_access.sql. Wrapped in a
-- single transaction so it applies entirely or not at all. Safe to rerun:
-- every policy is preceded by `drop ... if exists`, every function is
-- `create or replace`, and revoke/grant are idempotent on their own.
--
-- Purely additive and safe for existing data: no column, constraint,
-- trigger, coach-facing policy, bucket configuration, or existing row is
-- touched. public.trainee_get_own_profile() (021) is explicitly NOT
-- modified -- starting circumferences are exposed through a brand new,
-- separate RPC instead (see section 2). No target-circumference concept is
-- introduced anywhere -- only the existing starting_*_cm baseline is
-- exposed, read-only.
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- Circumference logs (section 1): trainee_circumference_logs has
-- trainee_id AND coach_id directly on every row -- same shape as
-- trainee_progress_logs (024) -- so a direct trainee-facing SELECT policy
-- anchored on public.trainee_get_auth_context() (022, reused unchanged) is
-- safe. Writes stay RPC-only, exactly like 024: no trainee INSERT/UPDATE/
-- DELETE policy is added to the table at all, so trainee_id/coach_id can
-- never be supplied by the client for a write, only resolved server-side.
--
-- Starting circumferences (section 2): a brand new, narrow, read-only RPC
-- -- public.trainee_get_own_starting_circumferences() -- mirrors
-- trainee_get_own_profile()'s exact mechanism (security definer query
-- against public.trainees, anchored on auth_user_id = auth.uid() AND
-- is_trainee(), bypassing trainees' RLS which grants the trainee role no
-- row access at all) but is a wholly separate function returning only the
-- six starting_*_cm columns. trainee_get_own_profile() itself is not
-- touched by so much as a comment.
--
-- Photo metadata (section 3): unlike every trainee write path so far,
-- photo upload cannot go through a security-definer RPC at all -- the
-- Storage API uploads raw file bytes directly against storage.objects,
-- which Postgres RLS gates directly, with no SQL-callable path around it.
-- Since the trainee unavoidably needs a genuine INSERT (and DELETE)
-- capability on storage.objects for this feature to work at all, this
-- migration also grants matching direct SELECT/INSERT/DELETE policies on
-- the trainee_progress_photos metadata table itself, rather than RPC-only
-- -- consistency, not a new risk: the same ownership/path checks apply
-- either way, and the RPC-only pattern used for logs exists to keep
-- trainee_id/coach_id server-resolved, which the WITH CHECK clauses below
-- achieve just as strictly for photos. No UPDATE policy on the metadata
-- table -- a wrong photo is deleted and re-uploaded, matching 017's own
-- convention.
--
-- Storage (section 4): THE ONE PLACE THIS MIGRATION CANNOT COPY THE
-- COACH'S EXISTING POLICIES VERBATIM. 017's coach policies check
-- `(storage.foldername(name))[1] = auth.uid()::text` -- true for a coach,
-- because a coach's own auth.uid() IS the coach_id segment of the path.
-- For a trainee this is false by construction: a trainee's auth.uid() is
-- their own identity, never the coach_id embedded in the path. The three
-- new trainee policies below instead check
-- `(storage.foldername(name))[1] = ctx.coach_id::text AND
--  (storage.foldername(name))[2] = ctx.trainee_id::text`, with ctx
-- resolved from trainee_get_auth_context() -- i.e. "the folder this
-- object lives in belongs to MY coach and MY own trainee record", never
-- the caller's own auth.uid() directly. No UPDATE policy on
-- storage.objects for the trainee role either, same reasoning as above.
--
-- Consistency and backward compatibility (see also the full walkthrough
-- at the end of this file): the storage path format ({coach_id}/
-- {trainee_id}/{id}.{ext}) is completely unchanged -- every photo a coach
-- has ever uploaded, before or after this migration, already sits at a
-- path whose segments equal that trainee's real coach_id/trainee_id. Once
-- a trainee account is linked (021's invite/link mechanism, unrelated to
-- this file), trainee_get_auth_context() resolves to exactly those same
-- two values, so every existing coach-uploaded photo (and its metadata
-- row) becomes visible to the linked trainee immediately -- no backfill,
-- no data migration, no re-upload required. The coach's own three storage
-- policies and three trainee_progress_photos policies (017, unmodified)
-- continue to apply unchanged and independently -- Postgres RLS policies
-- are OR'd together, so adding these new trainee policies can only ever
-- widen who can act on a ROW THEY OWN, never narrow or affect the coach's
-- existing access to their own rows/objects.

begin;

-- =====================================================================
-- 1. Trainee access: trainee_circumference_logs
-- =====================================================================

-- 1a. Read own history only.
drop policy if exists trainee_circumference_logs_select_own_trainee on public.trainee_circumference_logs;
create policy trainee_circumference_logs_select_own_trainee on public.trainee_circumference_logs
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_circumference_logs.trainee_id
        and ctx.coach_id = trainee_circumference_logs.coach_id
    )
  );

-- 1b. trainee_log_circumference_entry() -- the only way a trainee can
-- create a circumference log row. No INSERT policy is granted to the
-- trainee role on the table at all. Each provided measurement is
-- validated positive before insert (mirrors each column's own
-- `> 0 when present` CHECK, 016, for a clean error instead of a raw
-- constraint violation); "at least one measurement" is re-validated here
-- too (mirrors trainee_circumference_logs_at_least_one_measurement, 016),
-- and the table's own CHECK constraints remain the final backstop
-- regardless of anything this function does.
create or replace function public.trainee_log_circumference_entry(
  p_abdomen_cm numeric default null,
  p_neck_cm numeric default null,
  p_right_arm_cm numeric default null,
  p_left_arm_cm numeric default null,
  p_right_leg_cm numeric default null,
  p_left_leg_cm numeric default null,
  p_logged_at date default current_date,
  p_note text default null
)
returns public.trainee_circumference_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainee_id uuid;
  v_coach_id uuid;
  v_row public.trainee_circumference_logs%rowtype;
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may log their own circumference entry.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null or v_coach_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  if p_logged_at is null then
    raise exception 'A log date is required.';
  end if;

  if p_abdomen_cm is not null and p_abdomen_cm <= 0 then
    raise exception 'Abdomen measurement must be a positive number.';
  end if;
  if p_neck_cm is not null and p_neck_cm <= 0 then
    raise exception 'Neck measurement must be a positive number.';
  end if;
  if p_right_arm_cm is not null and p_right_arm_cm <= 0 then
    raise exception 'Right arm measurement must be a positive number.';
  end if;
  if p_left_arm_cm is not null and p_left_arm_cm <= 0 then
    raise exception 'Left arm measurement must be a positive number.';
  end if;
  if p_right_leg_cm is not null and p_right_leg_cm <= 0 then
    raise exception 'Right leg measurement must be a positive number.';
  end if;
  if p_left_leg_cm is not null and p_left_leg_cm <= 0 then
    raise exception 'Left leg measurement must be a positive number.';
  end if;

  if p_abdomen_cm is null and p_neck_cm is null and p_right_arm_cm is null
     and p_left_arm_cm is null and p_right_leg_cm is null and p_left_leg_cm is null then
    raise exception 'At least one measurement is required.';
  end if;

  insert into public.trainee_circumference_logs (
    trainee_id, coach_id, abdomen_cm, neck_cm, right_arm_cm, left_arm_cm,
    right_leg_cm, left_leg_cm, note, logged_at
  )
  values (
    v_trainee_id, v_coach_id, p_abdomen_cm, p_neck_cm, p_right_arm_cm, p_left_arm_cm,
    p_right_leg_cm, p_left_leg_cm, nullif(trim(p_note), ''), p_logged_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.trainee_log_circumference_entry(numeric, numeric, numeric, numeric, numeric, numeric, date, text) from public;
revoke execute on function public.trainee_log_circumference_entry(numeric, numeric, numeric, numeric, numeric, numeric, date, text) from anon;
grant execute on function public.trainee_log_circumference_entry(numeric, numeric, numeric, numeric, numeric, numeric, date, text) to authenticated;

-- 1c. trainee_delete_circumference_entry() -- the only way a trainee can
-- delete one of their own circumference log rows. No DELETE policy is
-- granted to the trainee role on the table at all.
create or replace function public.trainee_delete_circumference_entry(p_log_id uuid)
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
    raise exception 'Only a trainee may delete their own circumference entry.';
  end if;

  if p_log_id is null then
    raise exception 'A circumference entry id is required.';
  end if;

  select trainee_id, coach_id into v_trainee_id, v_coach_id
  from public.trainee_get_auth_context();

  if v_trainee_id is null or v_coach_id is null then
    raise exception 'No trainee profile is linked to this account.';
  end if;

  delete from public.trainee_circumference_logs
  where id = p_log_id
    and trainee_id = v_trainee_id
    and coach_id = v_coach_id;

  if not found then
    raise exception 'Circumference entry not found.';
  end if;
end;
$$;

revoke execute on function public.trainee_delete_circumference_entry(uuid) from public;
revoke execute on function public.trainee_delete_circumference_entry(uuid) from anon;
grant execute on function public.trainee_delete_circumference_entry(uuid) to authenticated;

-- =====================================================================
-- 2. trainee_get_own_starting_circumferences() -- read-only, separate
--    from and NOT a modification of trainee_get_own_profile() (021).
-- =====================================================================
-- Same mechanism as trainee_get_own_profile(): security definer so it can
-- read public.trainees (which grants the trainee role no row access at
-- all) as the table owner, anchored on auth_user_id = auth.uid() AND
-- is_trainee(). Returns at most one row -- trainees.auth_user_id is
-- unique (021), and this only ever matches the CALLER's own row. No
-- target-circumference values exist anywhere in the schema (015 only
-- defines starting_*_cm) -- this function exposes exactly those six
-- columns and nothing else on the trainees row (no notes, no invite/token
-- columns, no other private coach-side field).
create or replace function public.trainee_get_own_starting_circumferences()
returns table (
  starting_abdomen_cm numeric,
  starting_neck_cm numeric,
  starting_right_arm_cm numeric,
  starting_left_arm_cm numeric,
  starting_right_leg_cm numeric,
  starting_left_leg_cm numeric
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    t.starting_abdomen_cm,
    t.starting_neck_cm,
    t.starting_right_arm_cm,
    t.starting_left_arm_cm,
    t.starting_right_leg_cm,
    t.starting_left_leg_cm
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_starting_circumferences() from public;
revoke execute on function public.trainee_get_own_starting_circumferences() from anon;
grant execute on function public.trainee_get_own_starting_circumferences() to authenticated;

-- =====================================================================
-- IMPORTANT -- read before building the frontend store for sections 3/4:
-- Storage upload and metadata insertion are TWO SEPARATE API OPERATIONS
-- and CANNOT be made one PostgreSQL transaction.
-- =====================================================================
-- Uploading a file (supabase.storage.from('progress-photos').upload(...),
-- gated by section 4's policies) and inserting the trainee_progress_photos
-- metadata row (gated by section 3's policies) are two independent HTTP
-- calls to two different APIs (Storage vs PostgREST) -- there is no `begin;
-- ... commit;` that can span both, and this migration cannot change that;
-- it is a property of how Supabase Storage works, identical to the
-- constraint the coach's own progressPhotos.js store already lives under
-- (see its addPhoto()/deletePhoto() comments). The future trainee-side
-- store MUST follow the exact same two-phase discipline that store already
-- established, not a new one:
--   - Upload FIRST, insert the metadata row SECOND. If the metadata insert
--     is rejected (by section 3b's policy, the (trainee_id, logged_at,
--     angle) uniqueness constraint, or anything else), the just-uploaded
--     Storage object MUST be deleted by the client as a follow-up call --
--     it is never left as an orphan silently.
--   - If that cleanup delete itself fails (network error, or any other
--     reason), the store MUST report that failure clearly and distinctly
--     from an ordinary "save failed" error -- the coach's own store does
--     exactly this today (a dedicated message plus a console.error
--     including the orphaned storage_path), so the trainee-facing store
--     should surface an equivalent message rather than a generic one.
--   - Deleting a photo is the same two-phase shape in reverse: delete the
--     metadata ROW first, then the Storage OBJECT. If the row delete
--     fails, nothing is touched (safe default -- the photo stays visible,
--     matching what it actually still is). If the row delete succeeds but
--     the object removal fails, that is non-fatal and must be handled
--     safely: the photo is correctly gone from the trainee's own view (the
--     metadata row -- the only thing any UI reads from -- is gone), and
--     the leftover file is a harmless orphan under a folder only that
--     trainee's own account can read/delete anyway; log it for later
--     cleanup rather than surfacing it as a failure of the delete the
--     trainee actually asked for and got.
-- None of the RLS/RPC objects below can enforce this sequencing -- it is a
-- frontend-store responsibility, called out here explicitly per the
-- milestone's own requirement, so it is not missed when that store is
-- built.

-- =====================================================================
-- 3. Trainee access: trainee_progress_photos (metadata)
-- =====================================================================
-- Direct policies (not RPC-only) -- see the design summary above for why
-- this is a deliberate, explained departure from the RPC-only pattern
-- used for logs: Storage uploads force a genuine storage.objects INSERT
-- capability regardless (section 4), so gating the metadata row through
-- an RPC would not reduce what the trainee can actually reach end-to-end.
-- Every policy re-verifies both trainee_id AND coach_id against the
-- caller's own resolved context -- a row (or an attempted insert) naming
-- another trainee's or another coach's id never qualifies. No UPDATE
-- policy at all for the trainee role -- a wrong photo is deleted and
-- re-uploaded (017's own convention, unchanged).

-- 3a. Read own photo metadata only.
drop policy if exists trainee_progress_photos_select_own_trainee on public.trainee_progress_photos;
create policy trainee_progress_photos_select_own_trainee on public.trainee_progress_photos
  for select
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_progress_photos.trainee_id
        and ctx.coach_id = trainee_progress_photos.coach_id
    )
  );

-- 3b. Create own photo metadata only. Four independent guarantees in one
-- EXISTS: (1) trainee_id/coach_id on the new row must both match the
-- caller's own resolved context -- prevents assigning the row to another
-- trainee or another coach, even if the client sent different ids; (2)
-- storage_path must be the EXACT three-segment path
-- {coach_id}/{trainee_id}/{id}.{ext} -- not merely prefixed with
-- coach_id/trainee_id (the original draft's `LIKE '.../%'` would have
-- accepted any filename, including one with extra '/' segments after the
-- prefix); (3) the filename component must equal THIS ROW'S OWN id
-- (trainee_progress_photos.id::text) -- a trainee can never point a
-- metadata row at a file uploaded under a different id, including another
-- of their own rows' files; (4) the extension must be one of
-- jpg/jpeg/png/webp, matching the bucket's own MIME allowlist (017:
-- image/jpeg -> jpg, image/png -> png, image/webp -> webp; jpeg is also
-- accepted for robustness even though the coach's own upload code never
-- emits it). angle is re-checked against the same three allowed values
-- the table's own CHECK enforces (trainee_progress_photos, 017) --
-- redundant with that constraint by design, not a substitute for it.
-- id::text is always a well-formed lowercase UUID (cast from a uuid
-- column, not client-supplied text), so no separate UUID-shape check is
-- needed here the way it is in section 4b below, where `name` is
-- arbitrary text. Plain '...' string literals, not E'...' -- Postgres
-- string literals are non-escaping by default (standard_conforming_strings
-- is on), so `\.` below reaches the regex engine as a literal two-character
-- escape, not a string-level escape; coach_id/trainee_id/id are all UUIDs
-- (hex digits and hyphens only), so none of their text forms can contain a
-- regex metacharacter that would need escaping.
drop policy if exists trainee_progress_photos_insert_own_trainee on public.trainee_progress_photos;
create policy trainee_progress_photos_insert_own_trainee on public.trainee_progress_photos
  for insert
  to authenticated
  with check (
    public.is_trainee()
    and angle in ('front', 'side', 'back')
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_progress_photos.trainee_id
        and ctx.coach_id = trainee_progress_photos.coach_id
        and trainee_progress_photos.storage_path ~ (
          '^' || ctx.coach_id::text || '/' || ctx.trainee_id::text || '/' ||
          trainee_progress_photos.id::text || '\.(jpg|jpeg|png|webp)$'
        )
    )
  );

-- 3c. Delete own photo metadata only.
drop policy if exists trainee_progress_photos_delete_own_trainee on public.trainee_progress_photos;
create policy trainee_progress_photos_delete_own_trainee on public.trainee_progress_photos
  for delete
  to authenticated
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where ctx.trainee_id = trainee_progress_photos.trainee_id
        and ctx.coach_id = trainee_progress_photos.coach_id
    )
  );

-- =====================================================================
-- 4. Trainee access: storage.objects, bucket 'progress-photos'
-- =====================================================================
-- Bucket configuration itself (private, 8MB limit, jpeg/png/webp only,
-- 017) is entirely untouched by this migration -- these are RLS policies
-- only. Read (4a) and delete (4c) stay folder-prefix-scoped, deliberately
-- NOT tightened to the exact-filename regex used for insert (4b): they
-- must keep matching whatever filename shape an EXISTING coach-uploaded
-- object already has (the coach's own upload code, 017/progressPhotos.js,
-- has never been and is not being changed by this file), so existing
-- coach-uploaded photos remain readable/deletable by the linked trainee.
-- Insert (4b) is the one case where a brand new name is being chosen, so
-- it alone is constrained to the exact three-part structure -- see 4b's
-- own comment. THE KEY DIFFERENCE FROM THE COACH'S OWN POLICIES (017): segment 1
-- of the path is checked against ctx.coach_id, NOT auth.uid() directly --
-- a trainee's own auth.uid() is never equal to the coach_id embedded in
-- the path, so copying the coach's `(storage.foldername(name))[1] =
-- auth.uid()::text` shape here would silently deny every trainee, always.
-- Both path segments are re-derived from trainee_get_auth_context() every
-- time, never trusted from the object name alone.

-- 4a. Read (needed for both listing and generating signed URLs).
drop policy if exists progress_photos_select_own_trainee on storage.objects;
create policy progress_photos_select_own_trainee on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where (storage.foldername(name))[1] = ctx.coach_id::text
        and (storage.foldername(name))[2] = ctx.trainee_id::text
    )
  );

-- 4b. Upload -- requires the EXACT existing three-part path structure
-- {coach_id}/{trainee_id}/{uuid}.{ext}, not merely a matching folder
-- prefix. Unlike 4a/4c (read/delete, which must keep accepting whatever
-- filename shape an EXISTING coach-uploaded object already has -- see
-- section 3 above and requirement 3), this is the one place a BRAND NEW
-- object name is being chosen, so it can and should be constrained
-- exactly: `name` must match ^{ctx.coach_id}/{ctx.trainee_id}/ followed by
-- a lowercase-hex UUID and a literal '.' and one of jpg/jpeg/png/webp,
-- anchored at both ends. The `^...$` anchors reject any extra '/'
-- segment (no nested folders), any prefix/suffix garbage, and any
-- non-UUID filename; the extension alternation rejects any MIME type the
-- 8MB-limit/jpeg-png-webp-only bucket config (017, unmodified by this
-- file) wasn't already going to reject anyway -- this is defense in
-- depth, validated before Storage's own bucket-level check, not a
-- replacement for it. coach_id/trainee_id are UUIDs (hex digits and
-- hyphens only) so their ::text form can never contain a regex
-- metacharacter that would need escaping; `\.` is a literal two-character
-- regex escape, unaffected by Postgres's non-escaping '...' string
-- literals (standard_conforming_strings is on by default).
drop policy if exists progress_photos_insert_own_trainee on storage.objects;
create policy progress_photos_insert_own_trainee on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where name ~ (
        '^' || ctx.coach_id::text || '/' || ctx.trainee_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
    )
  );

-- 4c. Delete -- only the caller's own coach_id/trainee_id folder. No
-- UPDATE policy for the trainee role on storage.objects, matching 017's
-- own "delete + re-upload" convention.
drop policy if exists progress_photos_delete_own_trainee on storage.objects;
create policy progress_photos_delete_own_trainee on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.is_trainee()
    and exists (
      select 1 from public.trainee_get_auth_context() ctx
      where (storage.foldername(name))[1] = ctx.coach_id::text
        and (storage.foldername(name))[2] = ctx.trainee_id::text
    )
  );

commit;

-- =====================================================================
-- How metadata and Storage stay consistent, and why existing
-- coach-uploaded photos are immediately visible to the linked trainee
-- (full walkthrough)
-- =====================================================================
-- 1. The storage path format ({coach_id}/{trainee_id}/{id}.{ext}, fixed
--    by the coach's own upload code, 017/progressPhotos.js) is completely
--    unchanged by this migration -- no file is moved, renamed, or
--    re-uploaded, and no metadata row's storage_path is altered.
-- 2. Every photo that exists today, and every photo the coach uploads
--    from now on, already sits at a path whose first two segments ARE
--    that trainee's real coach_id and trainee_id (the coach's own
--    upload code sets `${coachId}/${traineeId}/${id}.${ext}` directly --
--    unmodified by this file).
-- 3. trainee_get_auth_context() (022) resolves ctx.coach_id/ctx.trainee_id
--    purely from trainees.auth_user_id = auth.uid() -- i.e. from the
--    trainee's account link (021), independent of when any particular
--    photo was uploaded, before or after this migration.
-- 4. Therefore, the moment a trainee account is linked (021's existing
--    invite flow -- unrelated to and untouched by this file) and this
--    migration has been run, EVERY existing photo under that trainee's
--    folder already satisfies section 4a's policy -- no backfill, no
--    data migration, no re-upload required. The same is true for every
--    existing trainee_progress_photos metadata row under section 3a.
-- 5. The metadata row and the Storage object are two independent things
--    protected by two independent policy sets, exactly as they are for
--    the coach today: a trainee could in principle satisfy one without
--    the other only by calling the Storage API or PostgREST directly
--    with a hand-crafted request, and even then each half's policy still
--    independently enforces the same coach_id/trainee_id ownership --
--    there is no path by which satisfying one policy set widens what the
--    other permits.
-- 6. The coach's own six policies (017: three on trainee_progress_photos,
--    three on storage.objects) are untouched and keep applying exactly
--    as before -- Postgres RLS evaluates all matching permissive
--    policies with OR, so adding these new trainee policies only ever
--    ADDS a path for the trainee to reach a row/object they already
--    legitimately own; it cannot narrow, bypass, or otherwise affect the
--    coach's existing access to their own data.
