-- Trainee Authentication & Roles milestone -- introduces real coach/trainee
-- identity to Supabase Auth. Before this migration, "coach" was not a
-- database concept at all: any authenticated user could satisfy every
-- coach_id = auth.uid() policy in this schema simply by inserting a
-- trainees row that pointed coach_id at themselves.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- as the project owner (needed for the auth.users triggers in sections 5
-- and 6), after 001_trainees.sql .. 020_trainee_notifications.sql. Wrapped
-- in a single transaction (see BEGIN / COMMIT below) so it applies
-- entirely or not at all.
--
-- Scope, deliberately: this migration does NOT touch progress-photo,
-- circumference, or training-programs policies (016-019), because those
-- already re-verify ownership by climbing back to a trainees row -- see
-- "Schema-wide role audit" below for why that makes them safe already. It
-- also does NOT add or change any frontend code.
--
-- =====================================================================
-- Revision note (this file was reviewed before being run; nothing in it
-- has been executed against the database)
-- =====================================================================
-- Round 1 security review found five issues, all fixed in that revision:
--   1. The coach's normal `trainees` UPDATE policy allowed writing
--      auth_user_id/invite_* directly -- a coach could hand-link any
--      trainees row to any auth.users id, bypassing the invite/email
--      checks entirely. Fixed with column-level GRANTs (section 3) plus
--      dedicated invite-issuing/cancel/unlink RPCs (section 4).
--   2. The linking trigger matched on token alone -- a leaked token was
--      enough to claim a trainee regardless of who signed up. Fixed by
--      also requiring the new account's own (Supabase-verified) email to
--      match the invited trainee's email (section 5).
--   3. auth_user_id's `on delete set null` FK conflicted with the
--      invite-state CHECK constraint: deleting a trainee's Auth account
--      would leave invite_status = 'accepted' with a now-null
--      auth_user_id, violating the constraint and making the delete fail.
--      Fixed with a BEFORE DELETE trigger on auth.users that resets the
--      whole invite state to 'none' first (section 6).
--   4. The invite-state CHECK didn't require invite_sent_at/
--      invite_expires_at for an 'invited' row, so a malformed row could
--      exist with a token but no expiry. Tightened (section 2).
--   5. The audit had assumed every coach-owned table re-verifies
--      ownership through trainees, which is false for public.foods,
--      trainee_progress_logs, and trainee_nutrition_logs -- their
--      policies trust coach_id = auth.uid() directly. Fixed in section 7.
--   Also added: role checks on both sides of trainee_notifications
--   (section 8), and an is_coach()/is_trainee() helper pair so every role
--   check in this file (and the schema-audit fixes) shares one definition.
--
-- Round 2 security review found four more issues, fixed in this revision:
--   6. trainee_progress_logs and trainee_nutrition_logs only checked
--      coach_id = auth.uid(), never that trainee_id actually belonged to
--      that coach -- a coach could manually submit another coach's real
--      trainee_id and read/create/delete a log against it. Fixed by
--      adding the same trainees ownership re-verification every other
--      per-trainee table already uses (section 7).
--   7. The linking trigger fired on INSERT alone and never checked
--      auth.users.email_confirmed_at -- an account could be linked (and
--      granted the trainee role) before its email was ever verified.
--      Replaced with an INSERT-or-UPDATE pair sharing one function, gated
--      on email_confirmed_at is not null, so linking only happens once
--      the account is actually confirmed -- whether it was confirmed at
--      signup or only later (section 5).
--   8. The backfill classified *every* existing auth.users row as a
--      coach, including any orphan account created through the
--      previously open /signup that never went on to own a trainee.
--      Narrowed to only the auth.users ids already referenced by
--      trainees.coach_id (section 1).
--   9. The invite-state CHECK allowed invite_expires_at <= invite_sent_at
--      (e.g. a zero-or-negative validity window). Added
--      invite_expires_at > invite_sent_at to both the 'invited' and
--      'accepted' branches (section 2).
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- 1. public.user_roles -- one row per auth.users id, role in
--    ('coach', 'trainee'). The single source of truth for "what kind of
--    user is this". No insert/update/delete policy exposes it to
--    anon/authenticated at all -- only this migration's backfill and the
--    security-definer trigger in section 5 (which run as the table owner
--    and so bypass RLS) can ever write a role. A client can never grant
--    itself one, and client-editable auth signup metadata (raw_user_meta_data)
--    is never trusted to assign a role -- it only ever carries an opaque
--    invite token used purely as a lookup key (section 5); the trigger
--    alone decides, server-side, whether that token earns a role.
-- 2. Only the existing auth.users rows already referenced by
--    trainees.coach_id are backfilled as role = 'coach' -- i.e. accounts
--    that have actually acted as a coach (own at least one trainee row),
--    not every row that happens to exist in auth.users. An orphan account
--    -- e.g. a leftover signup through the previously open /signup screen
--    that never went on to create a trainee -- gets no role and no
--    access, same as any brand-new signup after this migration. This
--    keeps every real, existing coach's access working unchanged while
--    not rubber-stamping accounts that were never actually used as one.
-- 3. trainees gains auth_user_id (the trainee's own login, nullable until
--    they onboard) plus a minimal single-use invite mechanism
--    (invite_token / invite_status / invite_sent_at / invite_expires_at /
--    invite_accepted_at). Those six columns are deliberately NOT reachable
--    through the coach's normal row UPDATE -- only through the RPCs in
--    section 4, which re-verify ownership, role, and (for issuing) a
--    valid trainee email every time.
-- 4. A pair of security-definer triggers on auth.users, sharing one
--    function (section 5), are the only thing that ever turns a Supabase
--    Auth account into a trainee: linking only happens once
--    email_confirmed_at is not null (whether that's true at signup or
--    only later, once the account holder clicks the confirmation email),
--    AND the account carries a token matching a still-pending, unexpired
--    invite, AND the account's own (verified) email matches the invited
--    trainee's email. An ordinary signup with no token (e.g. today's
--    existing /signup screen, unchanged) gets no row in user_roles at all
--    -- zero access anywhere -- until a human explicitly grants a role.
-- 5. Trainee-facing access stays exactly what the milestone asked for:
--    own profile (narrow column allowlist, via RPC) and own notifications
--    (read + mark-as-read only), nothing else.

begin;

-- =====================================================================
-- 1. Roles
-- =====================================================================

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'trainee')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- A user may read their own role (needed for client-side route
-- protection) -- nothing else.
create policy user_roles_select_own on public.user_roles
  for select
  using (user_id = auth.uid());

-- Backfill: an existing account is only classified as a coach if it is
-- actually referenced as a coach_id by an existing trainees row --
-- deliberately narrower than "every row in auth.users", so an orphan
-- account (e.g. an old signup through the previously open /signup screen
-- that never went on to own a trainee) is left with no role and no
-- access, exactly like a fresh signup after this migration. coach_id is
-- `not null references auth.users(id)`, so every value selected here is
-- guaranteed to already exist in auth.users.
insert into public.user_roles (user_id, role)
select distinct coach_id, 'coach' from public.trainees
on conflict (user_id) do nothing;

-- Single, reusable definition of "is the caller a coach / a trainee" --
-- every role check in this file (and the schema-audit fixes in section 7)
-- goes through these two, so there is exactly one place that defines what
-- each role means. `language sql ... stable`, no arguments, so Postgres
-- can evaluate each once per query rather than once per row. security
-- definer + a locked search_path so it can't be hijacked and doesn't
-- depend on the caller separately holding SELECT on user_roles (they do,
-- via user_roles_select_own, but this keeps the check independent of that
-- policy ever changing).
create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'coach'
  );
$$;

create or replace function public.is_trainee()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'trainee'
  );
$$;

revoke execute on function public.is_coach() from public;
grant execute on function public.is_coach() to authenticated;
revoke execute on function public.is_trainee() from public;
grant execute on function public.is_trainee() to authenticated;

-- =====================================================================
-- 2. Link a trainee row to its own Supabase Auth account
-- =====================================================================

alter table public.trainees
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column invite_token uuid unique,
  add column invite_status text not null default 'none'
    check (invite_status in ('none', 'invited', 'accepted')),
  add column invite_sent_at timestamptz,
  add column invite_expires_at timestamptz,
  add column invite_accepted_at timestamptz;

-- Every state fully pins which columns must/must not be set, so a row can
-- never sit half-migrated between states:
--   'none'     -- no invite has ever been issued (or a previous one was
--                 cancelled/unlinked). Nothing invite-shaped is present.
--   'invited'  -- a coach issued an invite that hasn't been claimed yet.
--                 token/sent/expiry are all required; not yet linked.
--   'accepted' -- claimed. auth_user_id and invite_accepted_at are
--                 required; the (single-use) token is gone.
-- invite_sent_at and invite_expires_at are intentionally still required
-- (not nulled) once accepted -- kept as the historical record of when the
-- invite that led to this link was originally sent and would have
-- expired. Both 'invited' and 'accepted' additionally require
-- invite_expires_at > invite_sent_at, so a zero-or-negative validity
-- window can never exist (coach_issue_trainee_invite always sets both
-- from the same now() within one statement, so this holds by
-- construction; the linking trigger never touches either column).
alter table public.trainees
  add constraint trainees_invite_state_consistent check (
    (invite_status = 'none'
      and invite_token is null
      and invite_sent_at is null
      and invite_expires_at is null
      and invite_accepted_at is null
      and auth_user_id is null)
    or (invite_status = 'invited'
      and invite_token is not null
      and invite_sent_at is not null
      and invite_expires_at is not null
      and invite_expires_at > invite_sent_at
      and invite_accepted_at is null
      and auth_user_id is null)
    or (invite_status = 'accepted'
      and invite_token is null
      and invite_sent_at is not null
      and invite_expires_at is not null
      and invite_expires_at > invite_sent_at
      and invite_accepted_at is not null
      and auth_user_id is not null)
  );

-- Coach-facing "who's pending an invite" lookup. Partial so it stays tiny
-- (invited rows are a small, transient minority of a coach's roster).
create index trainees_coach_id_invite_status_idx
  on public.trainees (coach_id, invite_status)
  where invite_status <> 'none';

-- =====================================================================
-- 3. Tighten existing coach policies on trainees: ownership, role, AND
--    column-level protection for identity/invite columns
-- =====================================================================

drop policy trainees_select_own on public.trainees;
create policy trainees_select_own on public.trainees
  for select
  using (coach_id = auth.uid() and public.is_coach());

drop policy trainees_insert_own on public.trainees;
create policy trainees_insert_own on public.trainees
  for insert
  with check (coach_id = auth.uid() and public.is_coach());

drop policy trainees_update_own on public.trainees;
create policy trainees_update_own on public.trainees
  for update
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

-- Row-level policies alone can't stop a coach's UPDATE from *also*
-- writing auth_user_id/invite_* in the same statement -- RLS only ever
-- decides which rows are touched, not which columns a permitted
-- statement may set. Postgres column-level privileges close that gap
-- directly: revoke blanket UPDATE, then grant it back only for the
-- columns the existing trainee add/edit screen actually writes (verified
-- against src/features/trainees/store/trainees.js's update() and
-- src/features/trainees/views/TraineeFormView.vue's payload, plus the
-- status-only update in TraineeDetailView.vue). auth_user_id and every
-- invite_* column are excluded, so ANY update statement against
-- public.trainees that names one of them fails on privileges before RLS
-- is even evaluated -- regardless of role. Only the security-definer RPCs
-- below (section 4) and the security-definer triggers (sections 5-6),
-- which run as the table owner and so aren't subject to these grants, can
-- ever write those six columns.
revoke update on public.trainees from authenticated;
grant update (
  full_name, email, phone, notes, start_date, goal,
  starting_weight, target_weight, status,
  starting_abdomen_cm, starting_neck_cm,
  starting_right_arm_cm, starting_left_arm_cm,
  starting_right_leg_cm, starting_left_leg_cm
) on public.trainees to authenticated;

-- Still no delete policy (unchanged from 001_trainees.sql) and still no
-- trainee-facing policy directly on this table -- see section 8 for why
-- trainee profile access goes through a narrow RPC instead.

-- =====================================================================
-- 4. Coach invite RPCs -- the only path to writing auth_user_id/invite_*
-- =====================================================================
-- All three: security definer (so they can write the columns section 3
-- just locked down), re-verify coach_id = auth.uid() AND is_coach()
-- explicitly (they run as the table owner and so bypass RLS -- the
-- ownership check has to happen in the function body instead), and lock
-- the row with `for update` / a status-scoped WHERE to avoid racing a
-- concurrent call.

-- Issues (or re-issues, while still pending) a single-use invite for one
-- trainee the caller owns. Refuses: a trainee that isn't the caller's own,
-- one that's already linked to an account (unlink first -- see below), or
-- one with no valid email on file -- an invite is meaningless without
-- somewhere to send it, and the email on file is also what the linking
-- trigger will require the new account to match.
create or replace function public.coach_issue_trainee_invite(p_trainee_id uuid)
returns table (invite_token uuid, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_expires timestamptz := now() + interval '7 days';
  v_row public.trainees%rowtype;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may issue a trainee invite.';
  end if;

  select * into v_row
  from public.trainees
  where id = p_trainee_id and coach_id = auth.uid()
  for update;

  if not found then
    raise exception 'Trainee not found or not owned by the current coach.';
  end if;

  if v_row.invite_status = 'accepted' then
    raise exception 'This trainee already has a linked account -- unlink it before issuing a new invite.';
  end if;

  if v_row.email is null or trim(v_row.email) = '' then
    raise exception 'Trainee must have a valid email before an invite can be issued.';
  end if;

  if lower(trim(v_row.email)) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Trainee email is not a valid email address.';
  end if;

  update public.trainees
  set invite_token = v_token,
      invite_status = 'invited',
      invite_sent_at = now(),
      invite_expires_at = v_expires,
      invite_accepted_at = null
  where id = p_trainee_id
    and coach_id = auth.uid();

  return query select v_token, v_expires;
end;
$$;

-- Revokes a still-pending invite (e.g. sent to the wrong address, or the
-- link leaked) before it's claimed. Returns the row to 'none'. No effect
-- on an already-accepted link -- that's coach_unlink_trainee_account.
create or replace function public.coach_cancel_trainee_invite(p_trainee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_coach() then
    raise exception 'Only a coach may cancel a trainee invite.';
  end if;

  update public.trainees
  set invite_token = null,
      invite_status = 'none',
      invite_sent_at = null,
      invite_expires_at = null,
      invite_accepted_at = null
  where id = p_trainee_id
    and coach_id = auth.uid()
    and invite_status = 'invited';

  if not found then
    raise exception 'No pending invite to cancel for this trainee.';
  end if;
end;
$$;

-- Severs an already-accepted link (e.g. the trainee lost access, or the
-- coach wants to re-issue to a corrected email) -- clears auth_user_id
-- and every invite_* column back to 'none', and revokes the trainee role
-- since that Auth account is no longer tied to any trainee row. Does NOT
-- touch the trainee's Auth account itself (still exists, still able to
-- log in, just linked to nothing) and does NOT touch any of the
-- trainee's historical business data -- every other table references
-- trainee_id, never auth_user_id.
create or replace function public.coach_unlink_trainee_account(p_trainee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid;
begin
  if not public.is_coach() then
    raise exception 'Only a coach may unlink a trainee account.';
  end if;

  select auth_user_id into v_auth_user_id
  from public.trainees
  where id = p_trainee_id
    and coach_id = auth.uid()
    and invite_status = 'accepted'
  for update;

  if v_auth_user_id is null then
    raise exception 'This trainee has no linked account to unlink.';
  end if;

  update public.trainees
  set auth_user_id = null,
      invite_token = null,
      invite_status = 'none',
      invite_sent_at = null,
      invite_expires_at = null,
      invite_accepted_at = null
  where id = p_trainee_id
    and coach_id = auth.uid();

  delete from public.user_roles
  where user_id = v_auth_user_id and role = 'trainee';
end;
$$;

revoke execute on function public.coach_issue_trainee_invite(uuid) from public;
grant execute on function public.coach_issue_trainee_invite(uuid) to authenticated;
revoke execute on function public.coach_cancel_trainee_invite(uuid) from public;
grant execute on function public.coach_cancel_trainee_invite(uuid) to authenticated;
revoke execute on function public.coach_unlink_trainee_account(uuid) from public;
grant execute on function public.coach_unlink_trainee_account(uuid) to authenticated;

-- =====================================================================
-- 5. Secure linking: auth.users insert/confirm -> trainees.auth_user_id
-- =====================================================================
-- The only path by which a Supabase Auth account can ever become a
-- trainee. One function, fired by two triggers, does nothing unless ALL
-- of the following hold:
--   - new.email_confirmed_at is not null -- the account's email has
--     actually been verified by Supabase Auth. Never done before this,
--     so an unconfirmed signup can never be linked or granted a role.
--   - the signup's metadata carries a token (raw_user_meta_data is
--     client-editable, so it is only ever used as an opaque lookup key --
--     see below) matching a trainees row that is still 'invited',
--     unclaimed (auth_user_id is null), and unexpired.
--   - the new account's own email (new.email -- Supabase Auth's own
--     record, never client-supplied metadata) matches the invited
--     trainee's email, normalized (lower + trim) on both sides.
-- The token proves "this account knows about a specific pending invite";
-- the email match proves "this is being completed by the person the
-- invite was issued to", so a leaked token alone -- without also
-- controlling that trainee's actual, now-verified email address -- can
-- never claim the row. A bare signup (e.g. today's existing /signup
-- screen, which sends no such metadata) links to nothing and is left
-- with no user_roles row at all, i.e. zero access anywhere.
--
-- Two triggers share this one function, covering both timings a
-- confirmed email can arrive in:
--   - AFTER INSERT -- covers a user who is already confirmed at the
--     moment the row is created (e.g. autoconfirm enabled, or an
--     already-verified identity from an external provider).
--   - AFTER UPDATE OF email_confirmed_at, restricted by a WHEN clause to
--     only the actual null -> not-null transition -- covers the normal
--     "confirm by clicking the emailed link" flow, where Supabase Auth
--     updates the existing row later.
-- Idempotent by construction, not just by intent: the claiming UPDATE's
-- WHERE clause requires invite_status = 'invited' and auth_user_id is
-- null. The first successful run flips the row to 'accepted' with
-- auth_user_id set, so any later invocation (a duplicate event, a retry,
-- the UPDATE trigger firing after the INSERT trigger already claimed it
-- because the row was inserted pre-confirmed) matches zero rows and
-- changes nothing -- backed up by user_roles' own primary key plus
-- `on conflict (user_id) do nothing` against a second role insert.
--
-- Requires running as the project's postgres/owner role (true of the
-- whole Supabase Dashboard -> SQL Editor session these migrations are
-- already run from) since it creates triggers on auth.users.

create or replace function public.link_trainee_on_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid;
  v_email text;
  v_trainee_id uuid;
begin
  if new.email_confirmed_at is null then
    return new; -- not verified yet -- nothing to do until confirmation.
  end if;

  begin
    v_token := (new.raw_user_meta_data ->> 'trainee_invite_token')::uuid;
  exception when others then
    v_token := null; -- malformed/absent metadata -- treat as no token, not an error.
  end;

  if v_token is null then
    return new;
  end if;

  v_email := lower(trim(new.email));

  update public.trainees
  set auth_user_id = new.id,
      invite_status = 'accepted',
      invite_token = null,
      invite_accepted_at = now()
  where invite_token = v_token
    and invite_status = 'invited'
    and auth_user_id is null
    and invite_expires_at > now()
    and email is not null
    and lower(trim(email)) = v_email
  returning id into v_trainee_id;

  if v_trainee_id is not null then
    insert into public.user_roles (user_id, role)
    values (new.id, 'trainee')
    on conflict (user_id) do nothing;
  end if;
  -- If v_trainee_id is null (email not yet confirmed, token forged/
  -- already consumed/expired, or the confirmed email doesn't match the
  -- invited trainee's email), the auth.users row is untouched by this
  -- function and left with no trainees link and no user_roles row:
  -- default-deny, same as a bare signup.

  return new;
end;
$$;

revoke execute on function public.link_trainee_on_email_confirmed() from public;

drop trigger if exists on_auth_user_created_link_trainee on auth.users;
create trigger on_auth_user_created_link_trainee
  after insert on auth.users
  for each row
  execute function public.link_trainee_on_email_confirmed();

drop trigger if exists on_auth_user_confirmed_link_trainee on auth.users;
create trigger on_auth_user_confirmed_link_trainee
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.link_trainee_on_email_confirmed();

-- =====================================================================
-- 6. Secure unlinking: auth.users delete -> reset trainees invite state
-- =====================================================================
-- auth_user_id's `on delete set null` (section 2) is not, by itself,
-- enough: it only nulls that one column, but trainees_invite_state_consistent
-- also requires invite_status = 'none' (and every other invite_* column
-- null) whenever auth_user_id is null. Deleting a linked trainee's Auth
-- account would otherwise leave invite_status = 'accepted' next to a
-- null auth_user_id -- a CHECK violation that would make the delete fail
-- outright. This BEFORE DELETE trigger resets the whole row to a fully
-- valid, unlinked 'none' state before the row is removed and before the
-- FK's own SET NULL action runs (Postgres fires BEFORE ROW triggers,
-- including this one, ahead of the FK's internal AFTER-trigger action) --
-- by the time SET NULL would fire, auth_user_id is already null, so it
-- becomes a harmless no-op. The FK is kept as `on delete set null` anyway
-- as a defense-in-depth backstop, not as the primary mechanism.
--
-- What this deliberately does NOT do: touch trainee_progress_logs,
-- trainee_nutrition_logs, trainee_circumference_logs, trainee_progress_photos,
-- trainee_training_programs, or trainee_notifications -- every one of
-- those references trainee_id (the trainees row itself), never
-- auth_user_id, so a trainee's login being deleted never removes or
-- alters any of the coach's historical business data for that trainee.
create or replace function public.handle_deleted_trainee_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.trainees
  set auth_user_id = null,
      invite_token = null,
      invite_status = 'none',
      invite_sent_at = null,
      invite_expires_at = null,
      invite_accepted_at = null
  where auth_user_id = old.id;

  return old;
end;
$$;

revoke execute on function public.handle_deleted_trainee_auth_user() from public;

drop trigger if exists on_auth_user_deleted_unlink_trainee on auth.users;
create trigger on_auth_user_deleted_unlink_trainee
  before delete on auth.users
  for each row
  execute function public.handle_deleted_trainee_auth_user();

-- =====================================================================
-- 7. Schema-wide role audit: tables that trust coach_id = auth.uid()
--    directly, without climbing through trainees
-- =====================================================================
-- Re-reading every RLS policy in 001-020 (not assuming the shape): most
-- coach-owned tables (trainee_circumference_logs [016], trainee_progress_photos
-- + storage.objects [017], trainee_training_programs / trainee_program_workouts
-- [018], trainee_notifications' coach-side policies [020]) already
-- re-verify ownership with `exists (select 1 from trainees where
-- trainees.id = ... and trainees.coach_id = auth.uid())` on every
-- policy. Those are already safe against a no-role/trainee-role user:
-- since trainees_insert_own (section 3) now also requires is_coach(), a
-- non-coach can never create the trainees row that check depends on, so
-- the whole chain is closed transitively without editing those tables.
--
-- Three tables do NOT climb through trainees and were trusting
-- coach_id = auth.uid() on its own -- these needed a direct fix:
--   - public.foods (003_nutrition.sql) -- has no trainee_id at all; a
--     no-role signup could freely create/read/update its own foods rows.
--     Fixed below by adding `and public.is_coach()`.
--   - public.trainee_progress_logs (002/014) -- select/insert/delete
--     checked coach_id only, with no re-verification that trainee_id
--     actually belonged to that coach -- a genuine coach could manually
--     submit another coach's real trainee_id and read/create/delete a log
--     against it. Fixed below by adding both `and public.is_coach()` AND
--     the same trainees ownership re-verification every other per-trainee
--     table (circumference_logs, photos, notifications, programs) already
--     uses: `exists (select 1 from trainees t where t.id = ...trainee_id
--     and t.coach_id = auth.uid())`.
--   - public.trainee_nutrition_logs (003) -- same shape and same fix as
--     progress_logs.
-- Adding public.is_coach() closes the no-role/trainee-role gap; adding the
-- trainees ownership re-verification independently closes the
-- cross-coach gap (a real coach pointing a log at a trainee_id that
-- exists but isn't theirs) -- both are now applied to all three of that
-- table's policies (select/insert, plus insert/delete for the two logs
-- tables), matching the WITH CHECK/USING split each policy type supports.
--
-- Confirmed safe as-is, intentionally unchanged: food_reference_catalog
-- (004), restaurant_food_items (009), and exercise_reference_catalog (019)
-- are shared, non-sensitive reference catalogs with no coach or trainee
-- ownership at all (`using (auth.uid() is not null)`, read-only from the
-- app) -- exactly the "shared non-sensitive reference catalogs may remain
-- readable" case, so no role check is added to them.

drop policy foods_select_own on public.foods;
create policy foods_select_own on public.foods
  for select
  using (coach_id = auth.uid() and public.is_coach());

drop policy foods_insert_own on public.foods;
create policy foods_insert_own on public.foods
  for insert
  with check (coach_id = auth.uid() and public.is_coach());

drop policy foods_update_own on public.foods;
create policy foods_update_own on public.foods
  for update
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

drop policy trainee_progress_logs_select_own on public.trainee_progress_logs;
create policy trainee_progress_logs_select_own on public.trainee_progress_logs
  for select
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_progress_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

drop policy trainee_progress_logs_insert_own on public.trainee_progress_logs;
create policy trainee_progress_logs_insert_own on public.trainee_progress_logs
  for insert
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_progress_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

drop policy trainee_progress_logs_delete_own on public.trainee_progress_logs;
create policy trainee_progress_logs_delete_own on public.trainee_progress_logs
  for delete
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_progress_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

drop policy trainee_nutrition_logs_select_own on public.trainee_nutrition_logs;
create policy trainee_nutrition_logs_select_own on public.trainee_nutrition_logs
  for select
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_nutrition_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

drop policy trainee_nutrition_logs_insert_own on public.trainee_nutrition_logs;
create policy trainee_nutrition_logs_insert_own on public.trainee_nutrition_logs
  for insert
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_nutrition_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

drop policy trainee_nutrition_logs_delete_own on public.trainee_nutrition_logs;
create policy trainee_nutrition_logs_delete_own on public.trainee_nutrition_logs
  for delete
  using (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_nutrition_logs.trainee_id
        and t.coach_id = auth.uid()
    )
  );

-- =====================================================================
-- 8. Minimum safe trainee access
-- =====================================================================

-- 8a. Own profile -- read-only, narrow column allowlist. Deliberately a
-- security-definer function rather than a `using (auth_user_id =
-- auth.uid())` policy directly on trainees: a raw table policy would also
-- hand the trainee the coach's private `notes` field and the invite
-- token/status columns.
create or replace function public.trainee_get_own_profile()
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  start_date date,
  goal text,
  starting_weight numeric,
  target_weight numeric,
  status text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.id, t.full_name, t.email, t.phone, t.start_date, t.goal,
         t.starting_weight, t.target_weight, t.status
  from public.trainees t
  where t.auth_user_id = auth.uid()
    and public.is_trainee();
$$;

revoke execute on function public.trainee_get_own_profile() from public;
grant execute on function public.trainee_get_own_profile() to authenticated;

-- 8b. Own notifications -- read. title/message are the content being
-- delivered to the trainee, and no other column on this row is
-- coach-private, so (unlike trainees) a direct table policy is
-- appropriate here. Checks BOTH ownership (trainees.auth_user_id =
-- auth.uid()) AND role (is_trainee()) -- ownership alone would also let a
-- coach who happened to be linked as somebody's auth_user_id (shouldn't
-- happen, but the role check costs nothing and removes the assumption).
create policy trainee_notifications_select_own_trainee on public.trainee_notifications
  for select
  using (
    public.is_trainee()
    and exists (
      select 1 from public.trainees t
      where t.id = trainee_notifications.trainee_id
        and t.auth_user_id = auth.uid()
    )
  );

-- 8c. Mark only their own notifications as read. No UPDATE policy is
-- granted to the trainee role at all -- instead a narrow security-definer
-- RPC that can only ever flip is_read/read_at, and only on a notification
-- whose trainee_id resolves back to the caller's own auth_user_id, and
-- only for a caller holding the trainee role.
create or replace function public.trainee_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trainee() then
    raise exception 'Only a trainee may mark their own notification as read.';
  end if;

  update public.trainee_notifications n
  set is_read = true,
      read_at = now()
  where n.id = p_notification_id
    and n.is_read = false
    and exists (
      select 1 from public.trainees t
      where t.id = n.trainee_id
        and t.auth_user_id = auth.uid()
    );
end;
$$;

revoke execute on function public.trainee_mark_notification_read(uuid) from public;
grant execute on function public.trainee_mark_notification_read(uuid) to authenticated;

-- No trainee access is granted anywhere else. Nutrition, progress,
-- circumference, photos, and training-programs tables are untouched by
-- this migration, per scope.

commit;
