-- Require an AAL2 session for every owner-only database operation.
-- The owner role remains discoverable through user_roles_select_own so
-- the client can route an AAL1 owner to MFA setup/challenge, but every
-- privileged RPC and policy already calls is_owner(), making this the
-- single server-side enforcement point.

begin;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'owner'
    );
$$;

revoke execute on function public.is_owner() from public;
revoke execute on function public.is_owner() from anon;
grant execute on function public.is_owner() to authenticated;

commit;
