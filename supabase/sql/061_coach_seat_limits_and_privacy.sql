-- Coach seat limits and privacy controls.
--
-- 1. The owner assigns each coach an explicit number of paid trainee seats.
--    A database trigger enforces the limit for every client and every write
--    path, including reactivating an archived trainee. The coach row is
--    locked while counting seats so two concurrent inserts cannot both take
--    the last available seat.
-- 2. Privacy-policy acceptance is recorded server-side. The table has RLS
--    enabled and no direct policies; callers can only record their own
--    acceptance through the narrow RPC below. No IP address, user agent or
--    health data is collected for this purpose.

begin;

alter table public.coaches
  add column if not exists trainee_limit integer;

-- Preserve every existing coach's current ability to serve their current
-- non-archived roster. New coaches receive zero seats until the owner records
-- what they purchased.
update public.coaches c
set trainee_limit = (
  select count(*)::integer
  from public.trainees t
  where t.coach_id = c.user_id
    and t.status <> 'archived'
)
where c.trainee_limit is null;

alter table public.coaches
  alter column trainee_limit set default 0,
  alter column trainee_limit set not null;

alter table public.coaches
  drop constraint if exists coaches_trainee_limit_check;
alter table public.coaches
  add constraint coaches_trainee_limit_check
  check (trainee_limit between 0 and 100000);

-- Return type changes require a drop/recreate. The function remains owner
-- only and still exposes aggregate counts, never trainee identities or health
-- information.
drop function if exists public.owner_list_coaches();
create function public.owner_list_coaches()
returns table (
  user_id uuid,
  email text,
  access_status text,
  payment_status text,
  payment_reviewed_at date,
  paid_through date,
  owner_note text,
  created_at timestamptz,
  trainee_count bigint,
  trainee_limit integer
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
    (select count(*) from public.trainees t
      where t.coach_id = c.user_id and t.status <> 'archived'),
    c.trainee_limit
  from public.coaches c
  join auth.users u on u.id = c.user_id
  order by c.created_at desc;
end;
$$;

revoke execute on function public.owner_list_coaches() from public;
revoke execute on function public.owner_list_coaches() from anon;
grant execute on function public.owner_list_coaches() to authenticated;

create or replace function public.owner_set_coach_trainee_limit(
  p_coach_user_id uuid,
  p_trainee_limit integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_owner() then
    raise exception 'Only the owner may change a coach trainee limit.';
  end if;
  if p_trainee_limit is null or p_trainee_limit < 0 or p_trainee_limit > 100000 then
    raise exception 'Trainee limit must be between 0 and 100000.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_coach_user_id and role = 'coach'
  ) then
    raise exception 'Target account is not a coach.';
  end if;

  -- Serialize with trainee inserts/reactivations for this coach.
  perform 1 from public.coaches where user_id = p_coach_user_id for update;
  if not found then
    raise exception 'No coach account record found for this user.';
  end if;

  select count(*)::integer into v_current_count
  from public.trainees
  where coach_id = p_coach_user_id and status <> 'archived';

  if p_trainee_limit < v_current_count then
    raise exception 'Trainee limit cannot be lower than the current non-archived trainee count (%).',
      v_current_count;
  end if;

  update public.coaches
  set trainee_limit = p_trainee_limit
  where user_id = p_coach_user_id;
end;
$$;

revoke execute on function public.owner_set_coach_trainee_limit(uuid, integer) from public;
revoke execute on function public.owner_set_coach_trainee_limit(uuid, integer) from anon;
grant execute on function public.owner_set_coach_trainee_limit(uuid, integer) to authenticated;

create or replace function public.enforce_coach_trainee_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used integer;
begin
  -- Archived rows do not consume a paid seat. Ordinary edits to an already
  -- occupied seat do not re-check the quota.
  if new.status = 'archived' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status <> 'archived'
     and old.coach_id = new.coach_id then
    return new;
  end if;

  select trainee_limit into v_limit
  from public.coaches
  where user_id = new.coach_id
  for update;

  if not found then
    raise exception 'No coach account record found for this trainee.';
  end if;

  select count(*)::integer into v_used
  from public.trainees t
  where t.coach_id = new.coach_id
    and t.status <> 'archived'
    and (tg_op = 'INSERT' or t.id <> new.id);

  if v_used >= v_limit then
    raise exception 'Trainee limit reached (% of % seats are in use).', v_used, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trainees_enforce_coach_limit on public.trainees;
create trigger trainees_enforce_coach_limit
  before insert or update of coach_id, status on public.trainees
  for each row execute function public.enforce_coach_trainee_limit();

revoke execute on function public.enforce_coach_trainee_limit() from public;
revoke execute on function public.enforce_coach_trainee_limit() from anon;
revoke execute on function public.enforce_coach_trainee_limit() from authenticated;

create table if not exists public.privacy_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'trainee', 'owner')),
  policy_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.privacy_acceptances enable row level security;
revoke all on table public.privacy_acceptances from public, anon, authenticated;

create or replace function public.record_privacy_acceptance(p_policy_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if p_policy_version is distinct from '2026-10-07' then
    raise exception 'Unsupported privacy policy version.';
  end if;

  select role into v_role
  from public.user_roles
  where user_id = auth.uid();
  if v_role is null then
    raise exception 'No application role is linked to this account.';
  end if;

  insert into public.privacy_acceptances (user_id, role, policy_version, accepted_at)
  values (auth.uid(), v_role, p_policy_version, now())
  on conflict (user_id) do update
  set role = excluded.role,
      policy_version = excluded.policy_version,
      accepted_at = excluded.accepted_at;
end;
$$;

revoke execute on function public.record_privacy_acceptance(text) from public;
revoke execute on function public.record_privacy_acceptance(text) from anon;
grant execute on function public.record_privacy_acceptance(text) to authenticated;

-- The legacy email-confirmation signup path cannot call an authenticated RPC
-- before the user confirms their address. It stores only the policy version in
-- auth metadata. When Supabase links that account to an application role, this
-- trigger converts the metadata into the same private server-side record. The
-- timestamp is generated by the database rather than trusted from the client.
create or replace function public.capture_privacy_acceptance_on_role_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy_version text;
begin
  select raw_user_meta_data ->> 'privacy_policy_version'
    into v_policy_version
  from auth.users
  where id = new.user_id;

  if v_policy_version = '2026-10-07' then
    insert into public.privacy_acceptances (user_id, role, policy_version, accepted_at)
    values (new.user_id, new.role, v_policy_version, now())
    on conflict (user_id) do update
    set role = excluded.role,
        policy_version = excluded.policy_version,
        accepted_at = excluded.accepted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_capture_privacy_acceptance on public.user_roles;
create trigger user_roles_capture_privacy_acceptance
  after insert or update of role on public.user_roles
  for each row execute function public.capture_privacy_acceptance_on_role_link();

revoke execute on function public.capture_privacy_acceptance_on_role_link() from public;
revoke execute on function public.capture_privacy_acceptance_on_role_link() from anon;
revoke execute on function public.capture_privacy_acceptance_on_role_link() from authenticated;

commit;
