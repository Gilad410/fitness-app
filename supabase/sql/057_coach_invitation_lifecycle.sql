-- Coach invitation lifecycle. These trusted helpers are callable only by
-- the service role used inside the invite-coach Edge Function.
begin;

create or replace function public.owner_admin_prepare_coach_invite(
  p_owner_user_id uuid, p_invitation_id uuid, p_action text
)
returns table (
  invitation_id uuid, email text, invite_token uuid,
  invite_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.coach_invitations%rowtype;
  v_auth_user auth.users%rowtype;
begin
  if p_owner_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_owner_user_id and role = 'owner'
  ) then
    raise exception 'Only the owner may manage coach invitations.';
  end if;
  if p_action not in ('resend', 'cancel') then
    raise exception 'Unsupported invitation action.';
  end if;

  select * into v_invitation
  from public.coach_invitations
  where id = p_invitation_id and status = 'invited'
  for update;
  if not found then
    raise exception 'No pending invitation found with that id.';
  end if;

  select * into v_auth_user
  from auth.users u
  where lower(trim(u.email)) = lower(trim(v_invitation.email))
  for update;
  if found then
    if v_auth_user.email_confirmed_at is not null then
      raise exception 'The invited account is already confirmed.';
    end if;
    if coalesce(v_auth_user.raw_user_meta_data ->> 'coach_invite_token', '')
       <> v_invitation.invite_token::text then
      raise exception 'The unconfirmed account does not belong to this invitation.';
    end if;
  end if;

  if p_action = 'resend' then
    update public.coach_invitations
    set invite_sent_at = now(),
        invite_expires_at = now() + interval '7 days',
        invited_by = p_owner_user_id
    where id = v_invitation.id
    returning * into v_invitation;
  end if;

  return query select v_invitation.id, v_invitation.email,
    v_invitation.invite_token, v_invitation.invite_expires_at;
end;
$$;

revoke execute on function public.owner_admin_prepare_coach_invite(uuid, uuid, text) from public;
revoke execute on function public.owner_admin_prepare_coach_invite(uuid, uuid, text) from anon;
revoke execute on function public.owner_admin_prepare_coach_invite(uuid, uuid, text) from authenticated;
grant execute on function public.owner_admin_prepare_coach_invite(uuid, uuid, text) to service_role;

create or replace function public.owner_admin_cancel_coach_invite(
  p_owner_user_id uuid, p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_owner_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_owner_user_id and role = 'owner'
  ) then
    raise exception 'Only the owner may cancel coach invitations.';
  end if;
  update public.coach_invitations set status = 'cancelled'
  where id = p_invitation_id and status = 'invited';
  if not found then
    raise exception 'No pending invitation found with that id.';
  end if;
end;
$$;

revoke execute on function public.owner_admin_cancel_coach_invite(uuid, uuid) from public;
revoke execute on function public.owner_admin_cancel_coach_invite(uuid, uuid) from anon;
revoke execute on function public.owner_admin_cancel_coach_invite(uuid, uuid) from authenticated;
grant execute on function public.owner_admin_cancel_coach_invite(uuid, uuid) to service_role;

commit;
