-- W12-05A: canonical User Invitation & Activation System.
-- Invitation state is canonical here. app_role_memberships is the scoped
-- authorization/read-model projection and is never activated by client metadata.

create table if not exists public.wf_user_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_id text not null unique default security.new_legacy_id('INV'),
  email text not null check (length(email)<=320),
  email_normalized text generated always as (lower(btrim(email))) stored,
  role text not null check (length(role)<=80),
  scope_type text not null check (length(scope_type)<=40)
    check (scope_type in ('platform','institution','department','program','cohort','employer')),
  scope_id text,
  institution_id text references public.wf_institutions(institution_id) on delete cascade,
  employer_id text references public.contractors(contractor_id) on delete cascade,
  membership_key text,
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked','cancelled')),
  activation_policy text not null default 'auto_activate'
    check (activation_policy in ('auto_activate','approval_required')),
  expires_at timestamptz not null,
  recipient_existing_identity boolean not null default false,
  invited_by_auth_user_id uuid references auth.users(id) on delete set null,
  invited_by_user_id text references public.users(user_id) on delete set null,
  accepted_by_auth_user_id uuid references auth.users(id) on delete set null,
  accepted_by_user_id text references public.users(user_id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid references auth.users(id) on delete set null,
  revoked_by_user_id text references public.users(user_id) on delete set null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed')),
  delivery_attempted_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  delivery_error_code text,
  idempotency_key text check (idempotency_key is null or length(idempotency_key)<=240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_user_invitations_scope_owner check (
    (scope_type='platform' and scope_id is null and institution_id is null and employer_id is null)
    or
    (
      scope_type in ('institution','department','program','cohort')
      and scope_id is not null
      and institution_id is not null
      and employer_id is null
    )
    or
    (
      scope_type='employer'
      and scope_id is not null
      and employer_id is not null
      and institution_id is null
    )
  )
);

create unique index if not exists wf_user_invitations_open_semantic_key
  on public.wf_user_invitations(
    email_normalized,role,scope_type,coalesce(scope_id,''),
    coalesce(institution_id,''),coalesce(employer_id,'')
  )
  where status='pending';

create unique index if not exists wf_user_invitations_idempotency_key
  on public.wf_user_invitations(
    idempotency_key,coalesce(institution_id,''),coalesce(employer_id,'')
  )
  where idempotency_key is not null;

create index if not exists wf_user_invitations_institution_status_idx
  on public.wf_user_invitations(institution_id,status,created_at desc)
  where institution_id is not null;

create index if not exists wf_user_invitations_employer_status_idx
  on public.wf_user_invitations(employer_id,status,created_at desc)
  where employer_id is not null;

create index if not exists wf_user_invitations_recipient_status_idx
  on public.wf_user_invitations(email_normalized,status,created_at desc);

alter table public.wf_user_invitations enable row level security;
revoke all on public.wf_user_invitations from public,anon,authenticated;
grant select,insert,update,delete on public.wf_user_invitations to service_role;

create or replace function security.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(exists(
    select 1
    from public.app_role_memberships r
    where r.auth_user_id=(select auth.uid())
      and lower(r.status)='active'
      and lower(r.role)='super_admin'
      and lower(r.scope_type)='platform'
  ),false);
$$;

create or replace function security.user_invitation_actor_can_manage(
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_institution_id text,
  p_employer_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
begin
  if (select auth.uid()) is null then
    return false;
  end if;

  -- Validate the target role family before any platform-admin bypass so an
  -- authenticated administrator cannot mint an invented role/scope pair.
  if v_scope_type='platform' then
    if p_scope_id is not null
       or p_institution_id is not null
       or p_employer_id is not null
       or v_role not in ('super_admin','admin','support','read_only_analyst') then
      return false;
    end if;
    if not security.is_admin() then return false; end if;
    if v_role='super_admin' then return security.is_super_admin(); end if;
    return true;
  end if;

  if p_institution_id is not null then
    if v_role<>'student'
       and security.canonical_institution_role(v_role) not in (
         'institution_super_admin','institution_admin','department_head',
         'program_coordinator','instructor','assistant_instructor',
         'career_services','read_only_analyst'
       ) then
      return false;
    end if;
    if security.is_admin() then
      if v_role='student' and v_scope_type='department' then return false; end if;
      return security.institution_scope_matches(
        p_institution_id,v_scope_type,p_scope_id,null
      );
    end if;
    if v_scope_type not in ('institution','department','program','cohort') then
      return false;
    end if;
    if p_scope_id is null or not security.institution_scope_matches(
      p_institution_id,v_scope_type,p_scope_id,null
    ) then
      return false;
    end if;

    if v_role='student' then
      if v_scope_type not in ('institution','program','cohort') then
        return false;
      end if;
      return exists(
        select 1
        from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and security.canonical_institution_role(r.role) in (
            'institution_super_admin','institution_admin','department_head',
            'program_coordinator','career_services'
          )
          and security.institution_role_scope_valid(r.role,r.scope_type)
          and security.institution_scope_contains(
            p_institution_id,
            lower(r.scope_type),r.scope_id,
            v_scope_type,p_scope_id
          )
      );
    end if;

    return security.can_invite_institution_member(
      p_institution_id,v_role,v_scope_type,p_scope_id
    );
  end if;

  if p_employer_id is not null then
    if v_scope_type<>'employer' or p_scope_id<>p_employer_id then
      return false;
    end if;
    if v_role not in (
      'employer_owner','employer_admin','recruiter',
      'hiring_manager','employer_read_only'
    ) then
      return false;
    end if;
    if security.is_admin() then return true; end if;
    if v_role='employer_owner' then return false; end if;
    return security.has_employer_role(
      p_employer_id,array['employer_owner','employer_admin']
    );
  end if;

  return false;
end;
$$;

create or replace function security.expire_user_invitations()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_count integer:=0;
begin
  for v_inv in
    update public.wf_user_invitations i
    set status='expired',updated_at=now()
    where i.status='pending'
      and i.expires_at<=now()
      and (
        security.is_admin()
        or security.user_invitation_actor_can_manage(
          i.role,i.scope_type,i.scope_id,i.institution_id,i.employer_id
        )
        or i.email_normalized=coalesce((
          select lower(btrim(coalesce(u.email,'')))
          from public.users u
          where u.auth_user_id=(select auth.uid())
          limit 1
        ),'')
      )
    returning i.*
  loop
    v_count:=v_count+1;

    if v_inv.membership_key is not null then
      update public.app_role_memberships
      set status='expired',updated_at=now()
      where membership_key=v_inv.membership_key
        and lower(status)='pending';
    end if;

    insert into public.platform_audit_events(
      actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
      institution_id,employer_id,result,before_json,after_json,metadata
    ) values(
      null,null,'USER_INVITATION_EXPIRED','user_invitation',v_inv.invitation_id,
      'workforce_invitation_system',v_inv.institution_id,v_inv.employer_id,'success',
      jsonb_build_object('status','pending'),
      jsonb_build_object('status','expired'),
      jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
    );
  end loop;
  return v_count;
end;
$$;

create or replace function public.user_invitation_create(
  p_email text,
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_institution_id text default null,
  p_employer_id text default null,
  p_expires_at timestamptz default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
  v_scope_id text:=nullif(btrim(coalesce(p_scope_id,'')),'');
  v_expires_at timestamptz:=p_expires_at;
  v_user public.users%rowtype;
  v_existing public.wf_user_invitations%rowtype;
  v_inv public.wf_user_invitations%rowtype;
  v_membership public.app_role_memberships%rowtype;
  v_invitation_id text;
  v_membership_key text;
  v_actor_user_id text:=security.current_legacy_user_id();
  v_activation_policy text:='auto_activate';
  v_idempotency_key text:=left(
    nullif(btrim(coalesce(p_idempotency_key,'')),''),
    240
  );
  v_first_name text:=left(
    nullif(btrim(coalesce(p_metadata->>'firstName','')),''),
    100
  );
  v_last_name text:=left(
    nullif(btrim(coalesce(p_metadata->>'lastName','')),''),
    100
  );
  v_metadata jsonb;
begin
  perform security.expire_user_invitations();

  if v_email='' or position('@' in v_email)<2 or length(v_email)>320 then
    raise exception 'Valid invitation email required';
  end if;
  v_metadata:=jsonb_strip_nulls(jsonb_build_object(
    'firstName',v_first_name,
    'lastName',v_last_name
  ));
  if v_expires_at is null or v_expires_at<=now() then
    raise exception 'Invitation expiration must be in the future';
  end if;
  if v_expires_at>now()+interval '30 days' then
    raise exception 'Invitation expiration exceeds maximum window';
  end if;
  if not security.user_invitation_actor_can_manage(
    v_role,v_scope_type,v_scope_id,p_institution_id,p_employer_id
  ) then
    raise exception 'Invitation role or scope denied';
  end if;

  if p_institution_id is not null and v_role<>'student' then
    if not security.can_approve_institution_member(
      p_institution_id,v_role,v_scope_type,v_scope_id
    ) then
      v_activation_policy:='approval_required';
    end if;
  end if;

  if v_idempotency_key is not null then
    select * into v_existing
    from public.wf_user_invitations
    where idempotency_key=v_idempotency_key
      and coalesce(institution_id,'')=coalesce(p_institution_id,'')
      and coalesce(employer_id,'')=coalesce(p_employer_id,'')
    limit 1;
    if found then
      if not security.user_invitation_actor_can_manage(
        v_existing.role,v_existing.scope_type,v_existing.scope_id,
        v_existing.institution_id,v_existing.employer_id
      ) then
        raise exception 'Invitation scope denied';
      end if;
      return jsonb_build_object(
        'created',false,
        'invitationId',v_existing.invitation_id,
        'status',v_existing.status,
        'deliveryStatus',v_existing.delivery_status,
        'expiresAt',v_existing.expires_at,
        'activationPolicy',v_existing.activation_policy,
        'recipientExistingIdentity',v_existing.recipient_existing_identity
      );
    end if;
  end if;

  select * into v_existing
  from public.wf_user_invitations
  where email_normalized=v_email
    and role=v_role
    and scope_type=v_scope_type
    and coalesce(scope_id,'')=coalesce(v_scope_id,'')
    and coalesce(institution_id,'')=coalesce(p_institution_id,'')
    and coalesce(employer_id,'')=coalesce(p_employer_id,'')
    and status='pending'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created',false,
      'invitationId',v_existing.invitation_id,
      'status',v_existing.status,
      'deliveryStatus',v_existing.delivery_status,
      'expiresAt',v_existing.expires_at,
      'activationPolicy',v_existing.activation_policy,
      'recipientExistingIdentity',v_existing.recipient_existing_identity
    );
  end if;

  select * into v_user
  from public.users
  where lower(btrim(coalesce(email,'')))=v_email
  limit 1;

  if not found then
    insert into public.users(email,first_name,last_name,status,bridge_source_sheet)
    values(v_email,v_first_name,v_last_name,'active','workforce_invitation')
    returning * into v_user;
  else
    update public.users
    set first_name=coalesce(nullif(first_name,''),v_first_name),
        last_name=coalesce(nullif(last_name,''),v_last_name),
        updated_at=now()
    where user_id=v_user.user_id
    returning * into v_user;
  end if;

  if exists(
    select 1
    from public.app_role_memberships r
    where r.user_id=v_user.user_id
      and lower(r.role)=v_role
      and lower(r.scope_type)=v_scope_type
      and coalesce(r.scope_id,'')=coalesce(v_scope_id,'')
      and lower(r.status)='active'
  ) then
    raise exception 'Membership already active';
  end if;

  v_invitation_id:=security.new_legacy_id('INV');

  select * into v_membership
  from public.app_role_memberships r
  where r.user_id=v_user.user_id
    and lower(r.role)=v_role
    and lower(r.scope_type)=v_scope_type
    and coalesce(r.scope_id,'')=coalesce(v_scope_id,'')
  order by r.updated_at desc nulls last,r.created_at desc nulls last
  limit 1;

  if found then
    v_membership_key:=v_membership.membership_key;
    update public.app_role_memberships
    set auth_user_id=v_user.auth_user_id,
        status='pending',
        source='canonical_invitation:'||v_invitation_id,
        updated_at=now()
    where id=v_membership.id;
  else
    v_membership_key:='invite:'||v_invitation_id;
    insert into public.app_role_memberships(
      membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source
    ) values(
      v_membership_key,v_user.auth_user_id,v_user.user_id,v_role,
      v_scope_type,v_scope_id,'pending','canonical_invitation:'||v_invitation_id
    );
  end if;

  insert into public.wf_user_invitations(
    invitation_id,email,role,scope_type,scope_id,institution_id,employer_id,
    membership_key,status,activation_policy,expires_at,recipient_existing_identity,
    invited_by_auth_user_id,invited_by_user_id,idempotency_key,metadata
  ) values(
    v_invitation_id,v_email,v_role,v_scope_type,v_scope_id,
    p_institution_id,p_employer_id,v_membership_key,'pending',v_activation_policy,v_expires_at,
    v_user.auth_user_id is not null,(select auth.uid()),v_actor_user_id,
    v_idempotency_key,
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning * into v_inv;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_actor_user_id,'USER_INVITATION_CREATED',
    'user_invitation',v_inv.invitation_id,'workforce_invitation_system',
    v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object(
      'status',v_inv.status,'role',v_inv.role,'scopeType',v_inv.scope_type,
      'scopeId',v_inv.scope_id,'expiresAt',v_inv.expires_at
    ),
    jsonb_build_object('recipientExistingIdentity',v_inv.recipient_existing_identity)
  );

  return jsonb_build_object(
    'created',true,
    'invitationId',v_inv.invitation_id,
    'status',v_inv.status,
    'deliveryStatus',v_inv.delivery_status,
    'expiresAt',v_inv.expires_at,
    'activationPolicy',v_inv.activation_policy,
    'recipientExistingIdentity',v_inv.recipient_existing_identity
  );
end;
$$;

create or replace function public.user_invitations_list(
  p_institution_id text default null,
  p_employer_id text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform security.expire_user_invitations();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'invitationId',i.invitation_id,
      'email',i.email,
      'role',i.role,
      'scopeType',i.scope_type,
      'scopeId',i.scope_id,
      'institutionId',i.institution_id,
      'employerId',i.employer_id,
      'status',i.status,
      'activationPolicy',i.activation_policy,
      'expiresAt',i.expires_at,
      'recipientExistingIdentity',i.recipient_existing_identity,
      'deliveryStatus',i.delivery_status,
      'deliveryAttemptedAt',i.delivery_attempted_at,
      'lastSentAt',i.last_sent_at,
      'sendCount',i.send_count,
      'createdAt',i.created_at,
      'updatedAt',i.updated_at
    ) order by i.created_at desc)
    from public.wf_user_invitations i
    where (p_institution_id is null or i.institution_id=p_institution_id)
      and (p_employer_id is null or i.employer_id=p_employer_id)
      and (p_status is null or lower(i.status)=lower(p_status))
      and security.user_invitation_actor_can_manage(
        i.role,i.scope_type,i.scope_id,i.institution_id,i.employer_id
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.user_invitation_for_recipient(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_user public.users%rowtype;
  v_org_name text;
begin
  perform security.expire_user_invitations();

  if (select auth.uid()) is null then
    raise exception 'Authenticated recipient required';
  end if;

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  select * into v_user
  from public.users
  where auth_user_id=(select auth.uid())
  limit 1;

  if not found or lower(btrim(coalesce(v_user.email,'')))<>v_inv.email_normalized then
    raise exception 'Invitation recipient mismatch';
  end if;

  if v_inv.institution_id is not null then
    select coalesce(name,short_name,institution_id) into v_org_name
    from public.wf_institutions where institution_id=v_inv.institution_id;
  elsif v_inv.employer_id is not null then
    select coalesce(business_name,contractor_id) into v_org_name
    from public.contractors where contractor_id=v_inv.employer_id;
  else
    v_org_name:='TXKPRO Workforce';
  end if;

  return jsonb_build_object(
    'invitationId',v_inv.invitation_id,
    'email',v_inv.email,
    'role',v_inv.role,
    'scopeType',v_inv.scope_type,
    'scopeId',v_inv.scope_id,
    'institutionId',v_inv.institution_id,
    'employerId',v_inv.employer_id,
    'organizationName',v_org_name,
    'status',v_inv.status,
    'activationPolicy',v_inv.activation_policy,
    'expiresAt',v_inv.expires_at,
    'recipientExistingIdentity',v_inv.recipient_existing_identity
  );
end;
$$;

create or replace function public.user_invitation_prepare_resend(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
begin
  perform security.expire_user_invitations();

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if not security.user_invitation_actor_can_manage(
    v_inv.role,v_inv.scope_type,v_inv.scope_id,v_inv.institution_id,v_inv.employer_id
  ) then
    raise exception 'Invitation scope denied';
  end if;
  if v_inv.status<>'pending' then
    raise exception 'Only pending invitations can be resent';
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,metadata
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),
    'USER_INVITATION_RESEND_REQUESTED','user_invitation',v_inv.invitation_id,
    'workforce_invitation_system',v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
  );

  return jsonb_build_object(
    'invitationId',v_inv.invitation_id,
    'status',v_inv.status,
    'expiresAt',v_inv.expires_at
  );
end;
$$;

create or replace function public.user_invitation_revoke(
  p_invitation_id text,
  p_status text default 'revoked'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_status text:=lower(btrim(coalesce(p_status,'revoked')));
begin
  perform security.expire_user_invitations();

  if v_status not in ('revoked','cancelled') then
    raise exception 'Invitation revoke status invalid';
  end if;

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if not security.user_invitation_actor_can_manage(
    v_inv.role,v_inv.scope_type,v_inv.scope_id,v_inv.institution_id,v_inv.employer_id
  ) then
    raise exception 'Invitation scope denied';
  end if;
  if v_inv.status in ('revoked','cancelled') then
    return jsonb_build_object('invitationId',v_inv.invitation_id,'status',v_inv.status);
  end if;
  if v_inv.status<>'pending' then
    raise exception 'Only pending invitations can be revoked';
  end if;

  update public.wf_user_invitations
  set status=v_status,
      revoked_at=now(),
      revoked_by_auth_user_id=(select auth.uid()),
      revoked_by_user_id=security.current_legacy_user_id(),
      updated_at=now()
  where invitation_id=v_inv.invitation_id;

  if v_inv.membership_key is not null then
    update public.app_role_memberships
    set status=v_status,updated_at=now()
    where membership_key=v_inv.membership_key
      and lower(status)='pending';
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),
    case when v_status='cancelled' then 'USER_INVITATION_CANCELLED' else 'USER_INVITATION_REVOKED' end,
    'user_invitation',v_inv.invitation_id,'workforce_invitation_system',
    v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object('status','pending'),
    jsonb_build_object('status',v_status),
    jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
  );

  return jsonb_build_object('invitationId',v_inv.invitation_id,'status',v_status);
end;
$$;

create or replace function public.user_invitation_record_delivery(
  p_invitation_id text,
  p_success boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
begin
  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;

  update public.wf_user_invitations
  set delivery_status=case when p_success then 'sent' else 'failed' end,
      delivery_attempted_at=now(),
      last_sent_at=case when p_success then now() else last_sent_at end,
      send_count=send_count+1,
      delivery_error_code=case when p_success then null else left(nullif(btrim(coalesce(p_error_code,'')),''),120) end,
      updated_at=now()
  where invitation_id=p_invitation_id;

  insert into public.platform_audit_events(
    action,entity_type,entity_id,source,institution_id,employer_id,result,metadata
  ) values(
    case when p_success then 'USER_INVITATION_SENT' else 'USER_INVITATION_DELIVERY_FAILED' end,
    'user_invitation',v_inv.invitation_id,'workforce_invitation_delivery',
    v_inv.institution_id,v_inv.employer_id,
    case when p_success then 'success' else 'failed' end,
    jsonb_build_object(
      'role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id,
      'errorCode',case when p_success then null else left(nullif(btrim(coalesce(p_error_code,'')),''),120) end
    )
  );

  return jsonb_build_object(
    'invitationId',v_inv.invitation_id,
    'deliveryStatus',case when p_success then 'sent' else 'failed' end
  );
end;
$$;

create or replace function public.user_invitation_accept(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_user public.users%rowtype;
  v_redirect text;
  v_selected_role text;
  v_membership_status text;
begin
  perform security.expire_user_invitations();

  if (select auth.uid()) is null then
    raise exception 'Authenticated recipient required';
  end if;

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;

  select * into v_user
  from public.users
  where auth_user_id=(select auth.uid())
  limit 1;

  if not found or lower(btrim(coalesce(v_user.email,'')))<>v_inv.email_normalized then
    raise exception 'Invitation recipient mismatch';
  end if;

  if v_inv.status='accepted' then
    if v_inv.accepted_by_auth_user_id=(select auth.uid()) then
      v_redirect:=case
        when v_inv.role='student' then '/onboarding?role=student'
        when v_inv.scope_type in ('institution','department','program','cohort')
             and v_inv.activation_policy='approval_required'
          then '/onboarding?role=educator'
        when v_inv.scope_type in ('institution','department','program','cohort') then '/institution'
        when v_inv.scope_type='employer' then '/employer'
        else '/admin'
      end;
      return jsonb_build_object(
        'invitationId',v_inv.invitation_id,'status','accepted',
        'redirectTo',v_redirect,'idempotent',true
      );
    end if;
    raise exception 'Invitation already accepted';
  end if;

  if v_inv.status<>'pending' then
    raise exception 'Invitation is not active';
  end if;
  if v_inv.expires_at<=now() then
    raise exception 'Invitation expired';
  end if;

  v_membership_status:=case
    when v_inv.activation_policy='approval_required' then 'pending'
    else 'active'
  end;

  update public.app_role_memberships
  set auth_user_id=(select auth.uid()),
      user_id=v_user.user_id,
      status=v_membership_status,
      source='canonical_invitation:'||v_inv.invitation_id,
      updated_at=now()
  where membership_key=v_inv.membership_key;

  if not found then
    perform security.ensure_app_role_semantic(
      coalesce(v_inv.membership_key,'invite:'||v_inv.invitation_id),
      (select auth.uid()),v_user.user_id,v_inv.role,v_inv.scope_type,v_inv.scope_id,
      v_membership_status,'canonical_invitation:'||v_inv.invitation_id
    );
  end if;

  update public.wf_role_memberships
  set status=v_membership_status,updated_at=now()
  where user_id=v_user.user_id
    and lower(role)=lower(v_inv.role)
    and coalesce(institution_id,'')=coalesce(v_inv.institution_id,'')
    and coalesce(contractor_id,'')=coalesce(v_inv.employer_id,'');

  if not found then
    insert into public.wf_role_memberships(
      user_id,role,institution_id,contractor_id,status,bridge_source_key,bridge_source_sheet
    ) values(
      v_user.user_id,v_inv.role,v_inv.institution_id,v_inv.employer_id,
      v_membership_status,'canonical_invitation:'||v_inv.invitation_id,
      'workforce_invitation'
    );
  end if;

  if v_inv.scope_type='employer' and v_inv.employer_id is not null then
    if not exists(
      select 1 from public.contractor_team_members tm
      where tm.contractor_id=v_inv.employer_id
        and tm.user_id=v_user.user_id
        and lower(coalesce(tm.status,'active'))='active'
    ) then
      insert into public.contractor_team_members(
        contractor_id,user_id,title,status,created_at,updated_at,
        bridge_source_key,bridge_source_sheet
      ) values(
        v_inv.employer_id,v_user.user_id,v_inv.role,'active',
        now()::text,now()::text,'canonical_invitation:'||v_inv.invitation_id,
        'workforce_invitation'
      );
    end if;
  end if;

  if v_inv.role='student' then
    v_selected_role:='student';
    insert into public.wf_onboarding_accounts(
      auth_user_id,user_id,selected_role,status,current_step,profile_data,created_at,updated_at
    ) values(
      (select auth.uid()),v_user.user_id,'student','not_started',1,
      jsonb_build_object('invitationId',v_inv.invitation_id),now(),now()
    )
    on conflict (auth_user_id) do update
    set selected_role=case
          when public.wf_onboarding_accounts.status='complete'
            then public.wf_onboarding_accounts.selected_role
          else 'student'
        end,
        profile_data=case
          when public.wf_onboarding_accounts.status='complete'
            then public.wf_onboarding_accounts.profile_data
          else public.wf_onboarding_accounts.profile_data
               || jsonb_build_object('invitationId',v_inv.invitation_id)
        end,
        updated_at=now();
    v_redirect:='/onboarding?role=student';
  elsif v_inv.scope_type in ('institution','department','program','cohort') then
    v_selected_role:='educator';
    if v_inv.activation_policy='approval_required' then
      insert into public.wf_onboarding_accounts(
        auth_user_id,user_id,selected_role,status,current_step,profile_data,
        submitted_at,created_at,updated_at
      ) values(
        (select auth.uid()),v_user.user_id,'educator','pending_review',6,
        jsonb_build_object('invitationId',v_inv.invitation_id),
        now(),now(),now()
      )
      on conflict (auth_user_id) do update
      set selected_role='educator',
          status=case
            when public.wf_onboarding_accounts.status='complete'
              then public.wf_onboarding_accounts.status
            else 'pending_review'
          end,
          profile_data=public.wf_onboarding_accounts.profile_data
            || jsonb_build_object('invitationId',v_inv.invitation_id),
          updated_at=now();
      v_redirect:='/onboarding?role=educator';
    else
      insert into public.wf_onboarding_accounts(
        auth_user_id,user_id,selected_role,status,current_step,profile_data,
        submitted_at,completed_at,created_at,updated_at
      ) values(
        (select auth.uid()),v_user.user_id,'educator','complete',6,
        jsonb_build_object('invitationId',v_inv.invitation_id),
        now(),now(),now(),now()
      )
      on conflict (auth_user_id) do nothing;
      v_redirect:='/institution';
    end if;
  elsif v_inv.scope_type='employer' then
    v_selected_role:='employer';
    insert into public.wf_onboarding_accounts(
      auth_user_id,user_id,selected_role,status,current_step,profile_data,
      employer_id,submitted_at,completed_at,created_at,updated_at
    ) values(
      (select auth.uid()),v_user.user_id,'employer','complete',6,'{}'::jsonb,
      v_inv.employer_id,now(),now(),now(),now()
    )
    on conflict (auth_user_id) do nothing;
    v_redirect:='/employer';
  else
    v_redirect:='/admin';
  end if;

  update public.wf_user_invitations
  set status='accepted',
      accepted_by_auth_user_id=(select auth.uid()),
      accepted_by_user_id=v_user.user_id,
      accepted_at=now(),
      updated_at=now()
  where invitation_id=v_inv.invitation_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user.user_id,'USER_INVITATION_ACCEPTED',
    'user_invitation',v_inv.invitation_id,'workforce_invitation_system',
    v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object('status','pending'),
    jsonb_build_object('status','accepted'),
    jsonb_build_object(
      'role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id
    )
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user.user_id,'ROLE_MEMBERSHIP_LINKED',
    'role_membership',v_inv.membership_key,'workforce_invitation_system',
    v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object(
      'role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id,
      'status',v_membership_status
    ),
    jsonb_build_object('invitationId',v_inv.invitation_id)
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user.user_id,'USER_ONBOARDING_HANDOFF',
    'user',v_user.user_id,'workforce_invitation_system',
    v_inv.institution_id,v_inv.employer_id,'success',
    jsonb_build_object('redirectTo',v_redirect,'selectedRole',v_selected_role),
    jsonb_build_object('invitationId',v_inv.invitation_id)
  );

  return jsonb_build_object(
    'invitationId',v_inv.invitation_id,
    'status','accepted',
    'role',v_inv.role,
    'scopeType',v_inv.scope_type,
    'scopeId',v_inv.scope_id,
    'activationPolicy',v_inv.activation_policy,
    'membershipStatus',v_membership_status,
    'redirectTo',v_redirect,
    'idempotent',false
  );
end;
$$;

revoke all on function security.is_super_admin() from public,anon,authenticated;
revoke all on function security.user_invitation_actor_can_manage(text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function security.expire_user_invitations()
  from public,anon,authenticated;
revoke all on function public.user_invitation_record_delivery(text,boolean,text)
  from public,anon,authenticated;

grant execute on function security.is_super_admin() to service_role;
grant execute on function security.user_invitation_actor_can_manage(text,text,text,text,text)
  to service_role;
grant execute on function security.expire_user_invitations() to service_role;
grant execute on function public.user_invitation_record_delivery(text,boolean,text)
  to service_role;

revoke all on function public.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb)
  from public,anon;
revoke all on function public.user_invitations_list(text,text,text)
  from public,anon;
revoke all on function public.user_invitation_for_recipient(text)
  from public,anon;
revoke all on function public.user_invitation_prepare_resend(text)
  from public,anon;
revoke all on function public.user_invitation_revoke(text,text)
  from public,anon;
revoke all on function public.user_invitation_accept(text)
  from public,anon;

grant execute on function public.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb)
  to authenticated,service_role;
grant execute on function public.user_invitations_list(text,text,text)
  to authenticated,service_role;
grant execute on function public.user_invitation_for_recipient(text)
  to authenticated,service_role;
grant execute on function public.user_invitation_prepare_resend(text)
  to authenticated,service_role;
grant execute on function public.user_invitation_revoke(text,text)
  to authenticated,service_role;
grant execute on function public.user_invitation_accept(text)
  to authenticated,service_role;

comment on table public.wf_user_invitations is
  'W12-05A canonical invitation lifecycle. Pending memberships are non-authoritative read-model projections until server-side acceptance activates them.';
comment on function public.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb) is
  'Creates or idempotently returns a scoped canonical invitation after server-side actor role/scope authorization.';
comment on function public.user_invitation_accept(text) is
  'Recipient-only acceptance. Email identity must match; role/scope come exclusively from canonical invitation state.';
