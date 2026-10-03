-- W12-05A hardening: keep privileged invitation implementations out of the
-- exposed public schema. Public RPCs are SECURITY INVOKER wrappers only.

revoke all on function public.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitations_expire()
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitations_list(text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_my_invitation(text)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitation_action(text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitation_accept(text)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitation_link_identity(text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitation_resolve_identity(text)
  from public,anon,authenticated,service_role;
revoke all on function public.workforce_invitation_mark_delivery(text,text,text)
  from public,anon,authenticated,service_role;

alter function public.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) set schema security;
alter function public.workforce_invitations_expire() set schema security;
alter function public.workforce_invitations_list(text,text,text) set schema security;
alter function public.workforce_my_invitation(text) set schema security;
alter function public.workforce_invitation_action(text,text,timestamptz) set schema security;
alter function public.workforce_invitation_accept(text) set schema security;
alter function public.workforce_invitation_link_identity(text,uuid) set schema security;
alter function public.workforce_invitation_resolve_identity(text) set schema security;
alter function public.workforce_invitation_mark_delivery(text,text,text) set schema security;

revoke all on function security.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitations_expire()
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitations_list(text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_my_invitation(text)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitation_action(text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitation_accept(text)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitation_link_identity(text,uuid)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitation_resolve_identity(text)
  from public,anon,authenticated,service_role;
revoke all on function security.workforce_invitation_mark_delivery(text,text,text)
  from public,anon,authenticated,service_role;

grant execute on function security.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) to authenticated,service_role;
grant execute on function security.workforce_invitations_expire()
  to authenticated,service_role;
grant execute on function security.workforce_invitations_list(text,text,text)
  to authenticated,service_role;
grant execute on function security.workforce_my_invitation(text)
  to authenticated,service_role;
grant execute on function security.workforce_invitation_action(text,text,timestamptz)
  to authenticated,service_role;
grant execute on function security.workforce_invitation_accept(text)
  to authenticated,service_role;
grant execute on function security.workforce_invitation_link_identity(text,uuid)
  to service_role;
grant execute on function security.workforce_invitation_resolve_identity(text)
  to service_role;
grant execute on function security.workforce_invitation_mark_delivery(text,text,text)
  to service_role;

create function public.workforce_invitation_create(
  p_email text,
  p_role text,
  p_scope_type text,
  p_scope_id text default null,
  p_institution_id text default null,
  p_contractor_id text default null,
  p_expires_at timestamptz default null,
  p_source text default 'individual',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_create_wrapper$
  select security.workforce_invitation_create(
    p_email,p_role,p_scope_type,p_scope_id,p_institution_id,p_contractor_id,
    p_expires_at,p_source,p_metadata
  );
$invitation_create_wrapper$;

create function public.workforce_invitations_expire()
returns integer
language sql
security invoker
set search_path=''
as $invitation_expire_wrapper$
  select security.workforce_invitations_expire();
$invitation_expire_wrapper$;

create function public.workforce_invitations_list(
  p_institution_id text default null,
  p_contractor_id text default null,
  p_status text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_list_wrapper$
  select security.workforce_invitations_list(
    p_institution_id,p_contractor_id,p_status
  );
$invitation_list_wrapper$;

create function public.workforce_my_invitation(
  p_invitation_id text
)
returns jsonb
language sql
security invoker
set search_path=''
as $my_invitation_wrapper$
  select security.workforce_my_invitation(p_invitation_id);
$my_invitation_wrapper$;

create function public.workforce_invitation_action(
  p_invitation_id text,
  p_action text,
  p_expires_at timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_action_wrapper$
  select security.workforce_invitation_action(
    p_invitation_id,p_action,p_expires_at
  );
$invitation_action_wrapper$;

create function public.workforce_invitation_accept(
  p_invitation_id text
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_accept_wrapper$
  select security.workforce_invitation_accept(p_invitation_id);
$invitation_accept_wrapper$;

create function public.workforce_invitation_link_identity(
  p_invitation_id text,
  p_auth_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_link_wrapper$
  select security.workforce_invitation_link_identity(
    p_invitation_id,p_auth_user_id
  );
$invitation_link_wrapper$;

create function public.workforce_invitation_resolve_identity(
  p_invitation_id text
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_resolve_wrapper$
  select security.workforce_invitation_resolve_identity(p_invitation_id);
$invitation_resolve_wrapper$;

create function public.workforce_invitation_mark_delivery(
  p_invitation_id text,
  p_status text,
  p_error text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $invitation_delivery_wrapper$
  select security.workforce_invitation_mark_delivery(
    p_invitation_id,p_status,p_error
  );
$invitation_delivery_wrapper$;

revoke all on function public.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) from public,anon;
revoke all on function public.workforce_invitations_expire()
  from public,anon;
revoke all on function public.workforce_invitations_list(text,text,text)
  from public,anon;
revoke all on function public.workforce_my_invitation(text)
  from public,anon;
revoke all on function public.workforce_invitation_action(text,text,timestamptz)
  from public,anon;
revoke all on function public.workforce_invitation_accept(text)
  from public,anon;
revoke all on function public.workforce_invitation_link_identity(text,uuid)
  from public,anon,authenticated;
revoke all on function public.workforce_invitation_resolve_identity(text)
  from public,anon,authenticated;
revoke all on function public.workforce_invitation_mark_delivery(text,text,text)
  from public,anon,authenticated;

grant execute on function public.workforce_invitation_create(
  text,text,text,text,text,text,timestamptz,text,jsonb
) to authenticated;
grant execute on function public.workforce_invitations_expire()
  to authenticated;
grant execute on function public.workforce_invitations_list(text,text,text)
  to authenticated;
grant execute on function public.workforce_my_invitation(text)
  to authenticated;
grant execute on function public.workforce_invitation_action(text,text,timestamptz)
  to authenticated;
grant execute on function public.workforce_invitation_accept(text)
  to authenticated;
grant execute on function public.workforce_invitation_link_identity(text,uuid)
  to service_role;
grant execute on function public.workforce_invitation_resolve_identity(text)
  to service_role;
grant execute on function public.workforce_invitation_mark_delivery(text,text,text)
  to service_role;
