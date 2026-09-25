-- Owner / Coach Administration milestone (DRAFT, NOT yet applied --
-- prepared and reviewed locally only; see the Phase 0/1 integration
-- report for the full design rationale and acceptance-test plan).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL
-- Editor, after 049_food_reference_catalog_multi_source_infrastructure.sql
-- and 046_coach_barcode_products.sql (both confirmed applied -- this
-- migration's own coach_barcode_products fix, section 6, assumes that
-- table already exists). Wrapped in a single transaction so it applies
-- entirely or not at all -- deliberately ONE migration, not split
-- across two, specifically so there is never an intermediate database
-- state where coach-suspension is enforced everywhere except
-- coach_barcode_products (a prior draft of this work split that fix
-- into a separate migration 057; reviewed and folded back into this
-- single file for that reason).
--
-- Purely additive: no existing table, column, row, policy text (other
-- than coach_barcode_products' three policies, section 6, which gain
-- exactly one already-established condition), function signature, or
-- trigger from 001-055 is removed or narrowed. Every existing coach
-- keeps exactly the access they have today -- see the backfill in
-- section 3, which runs inside this same transaction before is_coach()
-- is redefined, so there is no window where an existing coach is
-- treated as inactive.
--
-- =====================================================================
-- Design summary
-- =====================================================================
-- 1. Role: 'owner' becomes a third allowed value of the existing
--    user_roles.role CHECK -- purely a widening (every existing row
--    already satisfies the new, broader constraint). is_owner()
--    mirrors is_coach()/is_trainee() (021) exactly: security definer,
--    stable, no arguments, one exists() against user_roles.
-- 2. public.coaches -- one row per coach, holding what 021's
--    user_roles deliberately does NOT: account-level administrative
--    state. Kept as its own table (not new columns on user_roles)
--    because user_roles is shared with the trainee role and has no
--    natural home for coach-only fields -- the same "new table per new
--    concern" convention already used for public.trainees,
--    public.coach_barcode_products, and
--    public.barcode_nutrition_basis_preferences.
--      access_status: 'pending' | 'active' | 'suspended' -- what
--        is_coach() below actually gates on.
--      payment_status: 'unpaid' | 'trial' | 'paid' | 'overdue' --
--        informational only. NEVER read by is_coach() or any RLS
--        policy anywhere in this migration -- changing it can never,
--        by construction, change what a coach can access. Only an
--        explicit access_status change (via owner_set_coach_status,
--        section 7) can do that.
--      payment_reviewed_at, paid_through -- both nullable dates the
--        owner sets manually; never computed or enforced by any
--        trigger.
--      owner_note -- free text, owner's private note about this
--        coach; never shown to the coach.
-- 3. public.coach_status_history -- append-only audit trail. No
--    update or delete policy for anyone, including the owner --
--    correcting history is not a feature this migration provides.
-- 4. Backfill: every existing user_roles row with role = 'coach' gets
--    a coaches row with access_status = 'active', payment_status =
--    'paid' (existing coaches are already using the product; treating
--    them as newly 'unpaid' would be a factually wrong default for
--    accounts that predate this feature). Runs BEFORE section 5's
--    is_coach() redefinition, in the same transaction.
-- 5. The single enforcement point: is_coach() (021) is redefined,
--    same signature, to additionally require an 'active' coaches row.
--    Because virtually every coach-facing RLS policy, RPC, and Storage
--    policy already calls is_coach() (confirmed by grep across every
--    migration during the architecture inventory -- see the Phase 0/1
--    report), this one change is what actually enforces suspension
--    almost everywhere, without touching those policies' own text --
--    the exact leverage 026_coach_role_policy_hardening.sql already
--    demonstrated for the same function, for a different reason
--    (closing a hypothetical future gap; this migration is what
--    finally uses it).
-- 6. The one real, independently-discovered exception: public.
--    coach_barcode_products (046, from the barcode-logging branch)
--    checks ONLY coach_id = auth.uid() in its three policies -- no
--    is_coach() call at all, because it postdates 026 and never went
--    through that hardening pass (the two branches diverged
--    independently). Without this section, a suspended coach could
--    still read/write their barcode-approval cache even after every
--    other table stopped responding. Fixed here, in the SAME
--    transaction as section 5, using 026's exact pattern (add `and
--    public.is_coach()`, same position, nothing else reworded) --
--    this is precisely why sections 5 and 6 cannot be split across two
--    migrations: splitting them would recreate, even briefly, the
--    exact gap this section exists to close.
-- 7. Owner RPCs -- every one security definer, every one indepen-
--    dently re-checks is_owner() in its own body (RLS is bypassed for
--    security definer functions, so the check has to live in the body
--    instead -- same reasoning 021's coach RPCs already use), every
--    one rejects an unauthenticated caller explicitly (defense in
--    depth: is_owner() would already return false for auth.uid() is
--    null, but an explicit check up front gives a clearer error and
--    costs nothing), every one validates its status-string inputs
--    against the same CHECK the table itself enforces (so a bad value
--    fails with a clear message from the function, not an opaque
--    constraint-violation error), and every one explicitly refuses to
--    let an owner-role account be management as though it were a
--    coach (owner_set_coach_status/owner_set_coach_payment_status both
--    verify the TARGET row's own role is 'coach' before writing
--    anything -- an owner can never accidentally suspend another
--    owner through this path, because owners have no public.coaches
--    row to begin with; this is enforced by an explicit role check on
--    the target, not merely by the absence of a row).
--      owner_list_coaches() -- read-only, returns exactly the columns
--        the owner dashboard needs (email, access_status,
--        payment_status, payment_reviewed_at, paid_through,
--        created_at, trainee_count) -- no trainee health data, body
--        measurements, or progress-photo content is exposed by this
--        or any function in this migration.
--      owner_get_or_invite_coach(p_email) -- idempotent issue-or-reuse
--        for a pending coach invitation, mirroring
--        coach_get_or_issue_trainee_invite's (034) safe-retry shape
--        exactly, for the exact same reason: an Edge Function must be
--        able to retry a failed email send without invalidating a
--        token that may already have been delivered on an earlier
--        attempt. See section 8 for the invitation table and linking
--        trigger this RPC writes to.
--      owner_cancel_coach_invite(p_invitation_id) -- revokes a still-
--        pending invitation.
--      owner_set_coach_status(p_coach_user_id, p_new_status, p_reason)
--        -- the only path that ever changes access_status. Writes the
--        new status and a coach_status_history row in the same
--        statement-level transaction (both succeed or both roll back
--        together -- Postgres's own atomicity, not application-level
--        best-effort).
--      owner_set_coach_payment_status(p_coach_user_id, p_new_payment_status,
--        p_payment_reviewed_at, p_paid_through) -- payment fields only.
--        Never touches access_status, never writes to
--        coach_status_history (that table is for access-status
--        changes specifically) -- structurally incapable of causing an
--        access change, not merely documented not to.
-- 8. Coach invitation mechanism -- mirrors 021/034's trainee-invite
--    design as closely as the different starting point allows. A
--    trainee invite decorates an ALREADY-EXISTING trainees row (the
--    coach creates it first); a coach invitation has no such row to
--    decorate, since the whole point is inviting someone who does not
--    yet have any account or record at all. So: public.coach_invitations
--    is a small, standalone table (email, invite_token, status,
--    invited_by, timestamps) that exists ONLY to carry a pending
--    invitation until it is claimed, at which point a trigger on
--    auth.users (mirroring link_trainee_on_email_confirmed, same
--    email-confirmed + token-match + email-match requirements) creates
--    the user_roles('coach') row AND the coaches row (as 'pending',
--    not 'active' -- approval is a separate, later owner action via
--    owner_set_coach_status, not automatic on signup) in one step.
--    An account whose email already holds ANY role (checked via
--    on conflict do nothing on user_roles) is left untouched by the
--    trigger -- a partial failure here never leaves an unexplained or
--    privileged account: worst case is an accepted invitation that
--    grants nothing, which is default-deny, not default-allow.

begin;

-- =====================================================================
-- 1. Owner role
-- =====================================================================

alter table public.user_roles
  drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('coach', 'trainee', 'owner'));

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'owner'
  );
$$;

revoke execute on function public.is_owner() from public;
revoke execute on function public.is_owner() from anon;
grant execute on function public.is_owner() to authenticated;

-- =====================================================================
-- 2. public.coaches -- account-level administrative state
-- =====================================================================

create table public.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'suspended')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'trial', 'paid', 'overdue')),
  payment_reviewed_at date,
  paid_through date,
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coaches enable row level security;

-- The owner sees/manages every row. A coach may read (only) their own
-- row -- needed for the frontend's live coach-status re-check
-- (mirrors trainee_get_auth_context()'s purpose, section 9) -- but
-- never through a raw table policy that would also hand them
-- owner_note (private to the owner) or another coach's row: narrow
-- security-definer RPC only (coach_get_own_status, section 9), no
-- SELECT policy granted to the coach role on this table at all. Only
-- the owner gets a table-level policy.
create policy coaches_select_owner on public.coaches
  for select
  using (public.is_owner());

create policy coaches_update_owner on public.coaches
  for update
  using (public.is_owner())
  with check (public.is_owner());

-- No insert/delete policy for anyone -- rows are created only by the
-- backfill below and by the auth.users linking trigger (section 8),
-- both of which run as the table owner and so bypass RLS. No delete
-- path exists anywhere in this migration, matching the
-- "preserve all coach and trainee data" requirement -- suspending a
-- coach never removes their coaches row or any data that references
-- their user_id.

create or replace function public.set_coaches_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coaches_set_updated_at
  before update on public.coaches
  for each row
  execute function public.set_coaches_updated_at();

-- =====================================================================
-- 3. public.coach_status_history -- append-only audit trail
-- =====================================================================

create table public.coach_status_history (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  old_status text,
  new_status text not null check (new_status in ('pending', 'active', 'suspended')),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  reason text
);

create index coach_status_history_coach_user_id_idx
  on public.coach_status_history (coach_user_id, changed_at desc);

alter table public.coach_status_history enable row level security;

-- Owner-only, read-only. No insert/update/delete policy for anyone --
-- the only writer is owner_set_coach_status (section 7), a security
-- definer function that bypasses RLS; there is deliberately no way
-- for even the owner to edit or delete a history row through the API.
create policy coach_status_history_select_owner on public.coach_status_history
  for select
  using (public.is_owner());

-- =====================================================================
-- 4. Backfill existing coaches as 'active' -- BEFORE is_coach() below
--    is redefined to depend on this table, in the same transaction.
-- =====================================================================

insert into public.coaches (user_id, access_status, payment_status)
select user_id, 'active', 'paid'
from public.user_roles
where role = 'coach'
on conflict (user_id) do nothing;

-- =====================================================================
-- 5. The enforcement point: is_coach() now requires an active coach
-- =====================================================================

create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles r
    join public.coaches c on c.user_id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'coach'
      and c.access_status = 'active'
  );
$$;

-- Signature/grants unchanged from 021 -- every existing GRANT EXECUTE
-- on is_coach() to authenticated already covers this new body; no
-- caller of is_coach() anywhere in the schema needs to change.

-- =====================================================================
-- 6. Close the coach_barcode_products gap (046) -- same transaction
--    as section 5, so suspension is never enforced everywhere except
--    here, even briefly.
-- =====================================================================

drop policy if exists coach_barcode_products_select_own on public.coach_barcode_products;
create policy coach_barcode_products_select_own on public.coach_barcode_products
  for select
  using (coach_id = auth.uid() and public.is_coach());

drop policy if exists coach_barcode_products_insert_own on public.coach_barcode_products;
create policy coach_barcode_products_insert_own on public.coach_barcode_products
  for insert
  with check (coach_id = auth.uid() and public.is_coach());

drop policy if exists coach_barcode_products_update_own on public.coach_barcode_products;
create policy coach_barcode_products_update_own on public.coach_barcode_products
  for update
  using (coach_id = auth.uid() and public.is_coach())
  with check (coach_id = auth.uid() and public.is_coach());

-- =====================================================================
-- 7. Owner RPCs
-- =====================================================================

-- Read-only roster for the owner dashboard. Deliberately narrow: no
-- trainee health data, body measurements, or progress-photo content is
-- reachable from this function -- trainee_count is a count only, never
-- a join that exposes trainee rows themselves.
create or replace function public.owner_list_coaches()
returns table (
  user_id uuid,
  email text,
  access_status text,
  payment_status text,
  payment_reviewed_at date,
  paid_through date,
  owner_note text,
  created_at timestamptz,
  trainee_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may list coaches.';
  end if;

  return query
  select
    c.user_id,
    u.email::text,
    c.access_status,
    c.payment_status,
    c.payment_reviewed_at,
    c.paid_through,
    c.owner_note,
    c.created_at,
    (select count(*) from public.trainees t where t.coach_id = c.user_id)
  from public.coaches c
  join auth.users u on u.id = c.user_id
  order by c.created_at desc;
end;
$$;

revoke execute on function public.owner_list_coaches() from public;
revoke execute on function public.owner_list_coaches() from anon;
grant execute on function public.owner_list_coaches() to authenticated;

-- Sets access_status and records why, atomically. Refuses to target an
-- account that is not (already) a coach -- in particular, an owner
-- account, which never has a public.coaches row, can never be
-- "suspended" through this path: the `not found` branch below fires
-- for exactly that case, not a silent no-op.
create or replace function public.owner_set_coach_status(
  p_coach_user_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may change a coach''s access status.';
  end if;

  if p_new_status not in ('pending', 'active', 'suspended') then
    raise exception 'Invalid access status: %', p_new_status;
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required when changing a coach''s access status.';
  end if;

  select role into v_target_role
  from public.user_roles
  where user_id = p_coach_user_id;

  if v_target_role is distinct from 'coach' then
    raise exception 'Target account is not a coach -- cannot be managed as one.';
  end if;

  select access_status into v_old_status
  from public.coaches
  where user_id = p_coach_user_id
  for update;

  if not found then
    raise exception 'No coach account record found for this user.';
  end if;

  update public.coaches
  set access_status = p_new_status
  where user_id = p_coach_user_id;

  insert into public.coach_status_history (coach_user_id, old_status, new_status, changed_by, reason)
  values (p_coach_user_id, v_old_status, p_new_status, auth.uid(), p_reason);
end;
$$;

revoke execute on function public.owner_set_coach_status(uuid, text, text) from public;
revoke execute on function public.owner_set_coach_status(uuid, text, text) from anon;
grant execute on function public.owner_set_coach_status(uuid, text, text) to authenticated;

-- Payment fields only -- structurally cannot change access_status
-- (the UPDATE statement below never names that column) and never
-- writes to coach_status_history (that table is scoped to
-- access-status changes). Same target-role guard as
-- owner_set_coach_status, for the same reason.
create or replace function public.owner_set_coach_payment_status(
  p_coach_user_id uuid,
  p_new_payment_status text,
  p_payment_reviewed_at date,
  p_paid_through date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may change a coach''s payment status.';
  end if;

  if p_new_payment_status not in ('unpaid', 'trial', 'paid', 'overdue') then
    raise exception 'Invalid payment status: %', p_new_payment_status;
  end if;

  select role into v_target_role
  from public.user_roles
  where user_id = p_coach_user_id;

  if v_target_role is distinct from 'coach' then
    raise exception 'Target account is not a coach -- cannot be managed as one.';
  end if;

  update public.coaches
  set payment_status = p_new_payment_status,
      payment_reviewed_at = p_payment_reviewed_at,
      paid_through = p_paid_through
  where user_id = p_coach_user_id;

  if not found then
    raise exception 'No coach account record found for this user.';
  end if;
end;
$$;

revoke execute on function public.owner_set_coach_payment_status(uuid, text, date, date) from public;
revoke execute on function public.owner_set_coach_payment_status(uuid, text, date, date) from anon;
grant execute on function public.owner_set_coach_payment_status(uuid, text, date, date) to authenticated;

-- =====================================================================
-- 8. Coach invitation mechanism
-- =====================================================================

create table public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invite_token uuid unique,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'cancelled')),
  invited_by uuid not null references auth.users(id),
  invite_sent_at timestamptz not null default now(),
  invite_expires_at timestamptz not null,
  invite_accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  check (invite_expires_at > invite_sent_at)
);

-- Partial: at most one LIVE (still-pending, unexpired-in-intent)
-- invitation per email. A cancelled or accepted row does not count
-- against this -- re-inviting the same address later (e.g. after a
-- cancellation, or for a genuinely new person reusing an old departed
-- coach's address) is allowed to create a new row; only two
-- simultaneously-'invited' rows for the same email are prevented,
-- which is what would actually be confusing (two live tokens for one
-- address). Case-insensitive via lower().
create unique index coach_invitations_email_live_idx
  on public.coach_invitations (lower(email))
  where status = 'invited';

alter table public.coach_invitations enable row level security;

create policy coach_invitations_select_owner on public.coach_invitations
  for select
  using (public.is_owner());

-- No insert/update/delete policy for anyone -- every write goes
-- through owner_get_or_invite_coach / owner_cancel_coach_invite
-- (security definer, bypass RLS, re-check is_owner() in their own
-- body) or the auth.users linking trigger below.

-- Idempotent issue-or-reuse, mirroring coach_get_or_issue_trainee_invite
-- (034) exactly: a still-pending, unexpired invitation for this email
-- is returned unchanged (newly_issued = false) rather than rotated, so
-- an Edge Function's retry after a failed email send never invalidates
-- a token that may already have been delivered. A fresh token is
-- minted only when nothing valid exists to reuse (no prior invitation,
-- a cancelled one, or an expired one). Refuses an email that already
-- belongs to an existing role of ANY kind (coach, trainee, or owner)
-- -- that account should sign in normally, not be re-invited.
create or replace function public.owner_get_or_invite_coach(p_email text)
returns table (invitation_id uuid, invite_token uuid, invite_expires_at timestamptz, newly_issued boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_row public.coach_invitations%rowtype;
  v_token uuid;
  v_expires timestamptz;
  v_id uuid;
  v_existing_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may invite a coach.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'An email address is required.';
  end if;

  v_email := lower(trim(p_email));

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Not a valid email address.';
  end if;

  select id into v_existing_user_id from auth.users where lower(email) = v_email;
  if v_existing_user_id is not null and exists (
    select 1 from public.user_roles where user_id = v_existing_user_id
  ) then
    raise exception 'This email already belongs to an existing account with an assigned role.';
  end if;

  -- Lock any existing live invitation row for this email before
  -- branching, so two concurrent invite calls for the same address
  -- converge on one token rather than racing to mint two.
  select * into v_row
  from public.coach_invitations
  where lower(email) = v_email and status = 'invited'
  for update;

  if found and v_row.invite_expires_at > now() then
    return query select v_row.id, v_row.invite_token, v_row.invite_expires_at, false;
    return;
  end if;

  v_token := gen_random_uuid();
  v_expires := now() + interval '7 days';

  if found then
    -- Expired pending row for this email -- replace in place rather
    -- than insert a second row (the partial unique index only blocks
    -- a second 'invited' row, but reusing this one is simpler and
    -- keeps one history line per live invitation attempt).
    update public.coach_invitations
    set invite_token = v_token,
        invite_sent_at = now(),
        invite_expires_at = v_expires,
        invited_by = auth.uid()
    where id = v_row.id
    returning id into v_id;
  else
    insert into public.coach_invitations (email, invite_token, invited_by, invite_expires_at)
    values (v_email, v_token, auth.uid(), v_expires)
    returning id into v_id;
  end if;

  return query select v_id, v_token, v_expires, true;
end;
$$;

revoke execute on function public.owner_get_or_invite_coach(text) from public;
revoke execute on function public.owner_get_or_invite_coach(text) from anon;
grant execute on function public.owner_get_or_invite_coach(text) to authenticated;

-- Revokes a still-pending invitation (wrong address, leaked link, no
-- longer wanted). No effect on an already-accepted one -- there is no
-- "un-hire" path here; that is owner_set_coach_status('suspended', ...).
create or replace function public.owner_cancel_coach_invite(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may cancel a coach invitation.';
  end if;

  update public.coach_invitations
  set status = 'cancelled'
  where id = p_invitation_id
    and status = 'invited';

  if not found then
    raise exception 'No pending invitation found with that id.';
  end if;
end;
$$;

revoke execute on function public.owner_cancel_coach_invite(uuid) from public;
revoke execute on function public.owner_cancel_coach_invite(uuid) from anon;
grant execute on function public.owner_cancel_coach_invite(uuid) to authenticated;

-- The only path by which a Supabase Auth account can ever become a
-- coach. Mirrors link_trainee_on_email_confirmed (021) exactly: fires
-- on the email-confirmed transition (both at-insert-already-confirmed
-- and confirmed-later timings), requires a token in raw_user_meta_data
-- matching a still-'invited', unexpired coach_invitations row, AND the
-- account's own verified email matching that invitation's email. On a
-- match: marks the invitation 'accepted', grants role = 'coach', and
-- creates the coaches row as 'pending' (NOT 'active' -- approval is a
-- separate, later owner_set_coach_status call, never automatic here).
-- `on conflict do nothing` on both inserts means an account that
-- somehow already holds a role, or already has a coaches row, is left
-- completely untouched rather than overwritten -- a partial failure or
-- a race can never leave an unexplained or upgraded-privilege account,
-- only a claimed invitation that grants nothing (default-deny).
create or replace function public.link_coach_on_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid;
  v_email text;
  v_invitation_id uuid;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  begin
    v_token := (new.raw_user_meta_data ->> 'coach_invite_token')::uuid;
  exception when others then
    v_token := null;
  end;

  if v_token is null then
    return new;
  end if;

  v_email := lower(trim(new.email));

  update public.coach_invitations
  set status = 'accepted',
      invite_accepted_at = now(),
      accepted_user_id = new.id
  where invite_token = v_token
    and status = 'invited'
    and invite_expires_at > now()
    and lower(trim(email)) = v_email
  returning id into v_invitation_id;

  if v_invitation_id is not null then
    insert into public.user_roles (user_id, role)
    values (new.id, 'coach')
    on conflict (user_id) do nothing;

    insert into public.coaches (user_id, access_status, payment_status)
    values (new.id, 'pending', 'unpaid')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.link_coach_on_email_confirmed() from public;

drop trigger if exists on_auth_user_created_link_coach on auth.users;
create trigger on_auth_user_created_link_coach
  after insert on auth.users
  for each row
  execute function public.link_coach_on_email_confirmed();

drop trigger if exists on_auth_user_confirmed_link_coach on auth.users;
create trigger on_auth_user_confirmed_link_coach
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.link_coach_on_email_confirmed();

-- =====================================================================
-- 9. Coach self-status RPC -- the coach-side live re-check
-- =====================================================================
-- Mirrors trainee_get_auth_context() (022/033)'s purpose exactly: the
-- router's live per-navigation re-check (see the frontend changes in
-- this same milestone) cannot query public.coaches directly (no SELECT
-- policy is granted to the coach role there, deliberately -- see
-- section 2), so this narrow function returns only what the frontend
-- needs to decide whether to keep the session, nothing else.
create or replace function public.coach_get_own_status()
returns table (access_status text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select c.access_status
  from public.coaches c
  where c.user_id = auth.uid();
$$;

revoke execute on function public.coach_get_own_status() from public;
revoke execute on function public.coach_get_own_status() from anon;
grant execute on function public.coach_get_own_status() to authenticated;

commit;
