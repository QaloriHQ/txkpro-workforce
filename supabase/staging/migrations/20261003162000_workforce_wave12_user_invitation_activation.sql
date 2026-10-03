-- W12-05A: canonical User Invitation & Activation System.
-- Auth identity stays in Supabase Auth. This layer owns invitation lifecycle,
-- scoped membership activation, audit history, and reusable invite/link semantics.

create table if not exists public.wf_user_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_id text not null unique default security.new_legacy_id('INV'),
  email text not null,
  role text not null,
  scope_type text not null,
  scope_id text,
  institution_id text references public.wf_institutions(institution_id) on delete cascade,
  contractor_id text references public.contractors(contractor_id) on delete cascade,
  target_user_id text references public.users(user_id) on delete set null,
  target_auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked','cancelled')),
  source text not null default 'individual',
  expires_at timestamptz not null,
  invited_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  invited_by_user_id text references public.users(user_id) on delete set null,
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id) on delete set null,
  accepted_by_user_id text references public.users(user_id) on delete set null,
  closed_at timestamptz,
  closed_by_auth_user_id uuid references auth.users(id) on delete set null,
  closed_by_user_id text references public.users(user_id) on delete set null,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sent','failed')),
  delivery_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_user_invitations_email_check
    check (position('@' in email) > 1),
  constraint wf_user_invitations_org_binding_check
    check (not (institution_id is not null and contractor_id is not null))
);

create unique index if not exists wf_user_invitations_pending_semantic_key
  on public.wf_user_invitations(
    lower(btrim(email)),
    lower(role),
    lower(scope_type),
    coalesce(scope_id,'')
  )
  where status='pending';

create index if not exists wf_user_invitations_institution_status_idx
  on public.wf_user_invitations(institution_id,status,expires_at desc)
  where institution_id is not null;

create index if not exists wf_user_invitations_contractor_status_idx
  on public.wf_user_invitations(contractor_id,status,expires_at desc)
  where contractor_id is not null;

create index if not exists wf_user_invitations_target_auth_idx
  on public.wf_user_invitations(target_auth_user_id,status,created_at desc)
  where target_auth_user_id is not null;

alter table public.wf_user_invitations enable row level security;
revoke all on table public.wf_user_invitations from public, anon, authenticated;
grant select,insert,update on table public.wf_user_invitations to service_role;

create or replace function security.invitation_target_valid(
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_institution_id text,
  p_contractor_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    case
      when lower(coalesce(p_role,''))='student' then
        p_institution_id is not null
        and p_contractor_id is null
        and lower(coalesce(p_scope_type,'')) in ('institution','program','cohort')
        and p_scope_id is not null
        and security.institution_scope_matches(
          p_institution_id,
          lower(p_scope_type),
          p_scope_id,
          null
        )
      when security.canonical_institution_role(p_role) is not null
        and lower(coalesce(p_scope_type,'')) in ('institution','department','program','cohort') then
        p_institution_id is not null
        and p_contractor_id is null
        and security.institution_role_scope_valid(p_role,p_scope_type)
        and security.institution_scope_matches(
          p_institution_id,
          lower(p_scope_type),
          p_scope_id,
          null
        )
      when lower(coalesce(p_role,'')) in (
        'employer_owner','employer_admin','recruiter',
        'hiring_manager','employer_read_only'
      ) then
        p_institution_id is null
        and p_contractor_id is not null
        and lower(coalesce(p_scope_type,''))='employer'
        and p_scope_id=p_contractor_id
        and exists (
          select 1 from public.contractors c
          where c.contractor_id=p_contractor_id
            and lower(coalesce(c.account_status,'active'))='active'
        )
      when lower(coalesce(p_role,'')) in (
        'super_admin','admin','support','read_only_analyst'
      ) then
        p_institution_id is null
        and p_contractor_id is null
        and lower(coalesce(p_scope_type,''))='platform'
        and p_scope_id is null
      else false
    end,
    false
  );
$$;

create or replace function security.can_invite_student(
  p_institution_id text,
  p_target_scope_type text,
  p_target_scope_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.invitation_target_valid(
      'student',p_target_scope_type,p_target_scope_id,p_institution_id,null
    )
    and (
      security.is_admin()
      or exists (
        select 1
        from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and security.canonical_institution_role(r.role) in (
            'institution_super_admin','institution_admin',
            'department_head','program_coordinator'
          )
          and security.institution_role_scope_valid(r.role,r.scope_type)
          and security.institution_scope_contains(
            p_institution_id,
            lower(r.scope_type),
            r.scope_id,
            lower(p_target_scope_type),
            p_target_scope_id
          )
      )
    ),
    false
  );
$$;

create or replace function security.can_create_user_invitation(
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_institution_id text,
  p_contractor_id text
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
  if (select auth.uid()) is null then return false; end if;
  if not security.invitation_target_valid(
    v_role,v_scope_type,p_scope_id,p_institution_id,p_contractor_id
  ) then return false; end if;

  if v_role='student' then
    return security.can_invite_student(
      p_institution_id,v_scope_type,p_scope_id
    );
  end if;

  if security.canonical_institution_role(v_role) is not null
    and v_scope_type in ('institution','department','program','cohort') then
    return security.can_invite_institution_member(
      p_institution_id,v_role,v_scope_type,p_scope_id
    );
  end if;

  if v_scope_type='employer' then
    return security.has_employer_role(
      p_contractor_id,array['employer_owner','employer_admin']
    );
  end if;

  if v_scope_type='platform' then
    if v_role='super_admin' then
      return exists (
        select 1
        from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and lower(r.role)='super_admin'
          and lower(r.scope_type)='platform'
      );
    end if;
    return security.is_admin();
  end if;

  return false;
end;
$$;

create or replace function security.can_manage_user_invitation(
  p_invitation_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or exists (
      select 1
      from public.wf_user_invitations i
      where i.invitation_id=p_invitation_id
        and security.can_create_user_invitation(
          i.role,i.scope_type,i.scope_id,i.institution_id,i.contractor_id
        )
    ),
    false
  );
$$;

create or replace function security.workforce_invitation_json(
  p_invitation public.wf_user_invitations
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'invitationId',p_invitation.invitation_id,
    'email',p_invitation.email,
    'role',p_invitation.role,
    'scopeType',p_invitation.scope_type,
    'scopeId',p_invitation.scope_id,
    'institutionId',p_invitation.institution_id,
    'contractorId',p_invitation.contractor_id,
    'targetUserId',p_invitation.target_user_id,
    'targetAuthUserId',p_invitation.target_auth_user_id,
    'status',case
      when p_invitation.status='pending' and p_invitation.expires_at<=now()
        then 'expired'
      else p_invitation.status
    end,
    'source',p_invitation.source,
    'expiresAt',p_invitation.expires_at,
    'acceptedAt',p_invitation.accepted_at,
    'closedAt',p_invitation.closed_at,
    'lastSentAt',p_invitation.last_sent_at,
    'sendCount',p_invitation.send_count,
    'deliveryStatus',p_invitation.delivery_status,
    'deliveryError',p_invitation.delivery_error,
    'createdAt',p_invitation.created_at,
    'updatedAt',p_invitation.updated_at,
    'existingAccount',p_invitation.target_auth_user_id is not null
  );
$$;

create or replace function public.workforce_invitation_create(
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
  v_target_user_id text;
  v_target_auth_user_id uuid;
  v_existing public.wf_user_invitations%rowtype;
  v_result public.wf_user_invitations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if v_email='' or position('@' in v_email)<=1 then
    raise exception 'A valid email address is required';
  end if;
  if v_expires_at is null or v_expires_at<=now() then
    raise exception 'Invitation expiration must be in the future';
  end if;

  if v_scope_type='institution' and v_scope_id is null then
    v_scope_id:=p_institution_id;
  elsif v_scope_type='employer' and v_scope_id is null then
    v_scope_id:=p_contractor_id;
  end if;

  if not security.invitation_target_valid(
    v_role,v_scope_type,v_scope_id,p_institution_id,p_contractor_id
  ) then
    raise exception 'Invalid invitation role or scope';
  end if;

  if not security.can_create_user_invitation(
    v_role,v_scope_type,v_scope_id,p_institution_id,p_contractor_id
  ) then
    raise exception 'Invitation scope denied';
  end if;

  select u.user_id,u.auth_user_id
  into v_target_user_id,v_target_auth_user_id
  from public.users u
  where lower(btrim(coalesce(u.email,'')))=v_email
  limit 1;

  if v_target_user_id is not null and exists (
    select 1
    from public.app_role_memberships r
    where r.user_id=v_target_user_id
      and lower(r.role)=v_role
      and lower(r.scope_type)=v_scope_type
      and coalesce(r.scope_id,'')=coalesce(v_scope_id,'')
      and lower(r.status)='active'
  ) then
    raise exception 'Membership already active for this role and scope';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_email||'|'||v_role||'|'||v_scope_type||'|'||coalesce(v_scope_id,''),
      0
    )
  );

  select *
  into v_existing
  from public.wf_user_invitations i
  where lower(btrim(i.email))=v_email
    and lower(i.role)=v_role
    and lower(i.scope_type)=v_scope_type
    and coalesce(i.scope_id,'')=coalesce(v_scope_id,'')
    and i.status='pending'
  order by i.created_at desc
  limit 1
  for update;

  if found and v_existing.expires_at<=now() then
    update public.wf_user_invitations
    set status='expired',closed_at=now(),updated_at=now()
    where invitation_id=v_existing.invitation_id;
    update public.app_role_memberships
    set status='expired',updated_at=now()
    where source='user_invitation:'||v_existing.invitation_id
      and lower(status)<>'active';
    v_existing.id:=null;
  end if;

  if v_existing.id is not null then
    update public.wf_user_invitations
    set expires_at=v_expires_at,
        target_user_id=coalesce(v_target_user_id,target_user_id),
        target_auth_user_id=coalesce(v_target_auth_user_id,target_auth_user_id),
        source=coalesce(nullif(btrim(coalesce(p_source,'')),''),source),
        metadata=coalesce(p_metadata,'{}'::jsonb),
        delivery_status='pending',
        delivery_error=null,
        updated_at=now()
    where invitation_id=v_existing.invitation_id
    returning * into v_result;
  else
    insert into public.wf_user_invitations(
      email,role,scope_type,scope_id,institution_id,contractor_id,
      target_user_id,target_auth_user_id,status,source,expires_at,
      invited_by_auth_user_id,invited_by_user_id,metadata
    ) values(
      v_email,v_role,v_scope_type,v_scope_id,p_institution_id,p_contractor_id,
      v_target_user_id,v_target_auth_user_id,'pending',
      coalesce(nullif(btrim(coalesce(p_source,'')),''),'individual'),
      v_expires_at,(select auth.uid()),security.current_legacy_user_id(),
      coalesce(p_metadata,'{}'::jsonb)
    )
    returning * into v_result;
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,metadata
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),
    'USER_INVITATION_CREATED','user_invitation',v_result.invitation_id,
    'workforce-web',v_result.institution_id,v_result.contractor_id,
    jsonb_build_object(
      'role',v_result.role,
      'scopeType',v_result.scope_type,
      'scopeId',v_result.scope_id,
      'source',v_result.source
    )
  );

  return security.workforce_invitation_json(v_result);
end;
$$;

create or replace function public.workforce_invitations_expire()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_count integer:=0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  for v_inv in
    select *
    from public.wf_user_invitations i
    where i.status='pending'
      and i.expires_at<=now()
      and security.can_manage_user_invitation(i.invitation_id)
    for update
  loop
    update public.wf_user_invitations
    set status='expired',closed_at=now(),
        closed_by_auth_user_id=(select auth.uid()),
        closed_by_user_id=security.current_legacy_user_id(),
        updated_at=now()
    where invitation_id=v_inv.invitation_id;

    update public.app_role_memberships
    set status='expired',updated_at=now()
    where source='user_invitation:'||v_inv.invitation_id
      and lower(status)<>'active';

    insert into public.platform_audit_events(
      actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
      institution_id,employer_id,metadata
    ) values(
      (select auth.uid()),security.current_legacy_user_id(),
      'USER_INVITATION_EXPIRED','user_invitation',v_inv.invitation_id,
      'workforce-web',v_inv.institution_id,v_inv.contractor_id,
      jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.workforce_invitations_list(
  p_institution_id text default null,
  p_contractor_id text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  perform public.workforce_invitations_expire();

  return coalesce((
    select jsonb_agg(
      security.workforce_invitation_json(i)
      || jsonb_build_object(
        'institutionName',ins.name,
        'contractorName',c.business_name,
        'scopeLabel',coalesce(
          case when lower(i.scope_type)='cohort' then coh.name end,
          case when lower(i.scope_type)='program' then i.scope_id end,
          case when lower(i.scope_type)='institution' then ins.name end,
          case when lower(i.scope_type)='employer' then c.business_name end,
          case when lower(i.scope_type)='platform' then 'TXKPRO Platform' end,
          i.scope_id
        )
      )
      order by i.created_at desc
    )
    from public.wf_user_invitations i
    left join public.wf_institutions ins on ins.institution_id=i.institution_id
    left join public.contractors c on c.contractor_id=i.contractor_id
    left join public.wf_cohorts coh
      on lower(i.scope_type)='cohort' and coh.cohort_id=i.scope_id
    where security.can_manage_user_invitation(i.invitation_id)
      and (p_institution_id is null or i.institution_id=p_institution_id)
      and (p_contractor_id is null or i.contractor_id=p_contractor_id)
      and (
        p_status is null
        or lower(i.status)=lower(p_status)
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.workforce_my_invitation(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_email text;
  v_payload jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select lower(btrim(coalesce(u.email,''))) into v_email
  from auth.users u
  where u.id=(select auth.uid());

  select * into v_inv
  from public.wf_user_invitations i
  where i.invitation_id=p_invitation_id;

  if not found then raise exception 'Invitation not found'; end if;
  if v_email='' or lower(btrim(v_inv.email))<>v_email then
    raise exception 'Invitation does not belong to this account';
  end if;

  v_payload:=security.workforce_invitation_json(v_inv);

  if v_inv.institution_id is not null then
    v_payload:=v_payload||jsonb_build_object(
      'institutionName',(select name from public.wf_institutions where institution_id=v_inv.institution_id)
    );
  end if;
  if v_inv.contractor_id is not null then
    v_payload:=v_payload||jsonb_build_object(
      'contractorName',(select business_name from public.contractors where contractor_id=v_inv.contractor_id)
    );
  end if;
  if lower(v_inv.scope_type)='cohort' then
    v_payload:=v_payload||jsonb_build_object(
      'scopeLabel',(select name from public.wf_cohorts where cohort_id=v_inv.scope_id)
    );
  elsif lower(v_inv.scope_type)='institution' then
    v_payload:=v_payload||jsonb_build_object(
      'scopeLabel',(select name from public.wf_institutions where institution_id=v_inv.institution_id)
    );
  elsif lower(v_inv.scope_type)='employer' then
    v_payload:=v_payload||jsonb_build_object(
      'scopeLabel',(select business_name from public.contractors where contractor_id=v_inv.contractor_id)
    );
  else
    v_payload:=v_payload||jsonb_build_object('scopeLabel',v_inv.scope_id);
  end if;

  return v_payload;
end;
$$;

create or replace function public.workforce_invitation_action(
  p_invitation_id text,
  p_action text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_action text:=lower(btrim(coalesce(p_action,'')));
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if not security.can_manage_user_invitation(p_invitation_id) then
    raise exception 'Invitation scope denied';
  end if;
  if v_inv.status='accepted' then
    raise exception 'Accepted invitations are managed through membership controls';
  end if;

  if v_action='resend' then
    if v_inv.status in ('revoked','cancelled') then
      raise exception 'Revoked or cancelled invitations cannot be resent';
    end if;
    if p_expires_at is null or p_expires_at<=now() then
      raise exception 'Invitation expiration must be in the future';
    end if;

    update public.wf_user_invitations
    set status='pending',expires_at=p_expires_at,
        closed_at=null,closed_by_auth_user_id=null,closed_by_user_id=null,
        delivery_status='pending',delivery_error=null,updated_at=now()
    where invitation_id=p_invitation_id
    returning * into v_inv;

    update public.app_role_memberships
    set status='pending',updated_at=now()
    where source='user_invitation:'||p_invitation_id
      and lower(status)<>'active';
  elsif v_action in ('revoke','cancel') then
    update public.wf_user_invitations
    set status=case when v_action='revoke' then 'revoked' else 'cancelled' end,
        closed_at=now(),
        closed_by_auth_user_id=(select auth.uid()),
        closed_by_user_id=security.current_legacy_user_id(),
        updated_at=now()
    where invitation_id=p_invitation_id
    returning * into v_inv;

    update public.app_role_memberships
    set status=v_inv.status,updated_at=now()
    where source='user_invitation:'||p_invitation_id
      and lower(status)<>'active';
  else
    raise exception 'Unsupported invitation action';
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,employer_id,metadata
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),
    case
      when v_action='resend' then 'USER_INVITATION_RESEND_REQUESTED'
      when v_action='revoke' then 'USER_INVITATION_REVOKED'
      else 'USER_INVITATION_CANCELLED'
    end,
    'user_invitation',v_inv.invitation_id,'workforce-web',
    v_inv.institution_id,v_inv.contractor_id,
    jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
  );

  return security.workforce_invitation_json(v_inv);
end;
$$;

create or replace function public.workforce_invitation_link_identity(
  p_invitation_id text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_auth_email text;
  v_user_id text;
  v_membership public.app_role_memberships%rowtype;
begin
  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if v_inv.status<>'pending' then raise exception 'Invitation is not pending'; end if;

  select lower(btrim(coalesce(a.email,''))) into v_auth_email
  from auth.users a where a.id=p_auth_user_id;
  if v_auth_email='' or v_auth_email<>lower(btrim(v_inv.email)) then
    raise exception 'Invitation identity email mismatch';
  end if;

  select u.user_id into v_user_id
  from public.users u
  where u.auth_user_id=p_auth_user_id
  limit 1;

  if v_user_id is null then
    raise exception 'Workforce user bridge missing for invited identity';
  end if;

  update public.wf_user_invitations
  set target_auth_user_id=p_auth_user_id,
      target_user_id=v_user_id,
      updated_at=now()
  where invitation_id=p_invitation_id
  returning * into v_inv;

  select * into v_membership
  from public.app_role_memberships r
  where r.user_id=v_user_id
    and lower(r.role)=lower(v_inv.role)
    and lower(r.scope_type)=lower(v_inv.scope_type)
    and coalesce(r.scope_id,'')=coalesce(v_inv.scope_id,'')
  limit 1
  for update;

  if found then
    update public.app_role_memberships
    set auth_user_id=p_auth_user_id,
        status=case when lower(v_membership.status)='active' then v_membership.status else 'pending' end,
        source=case
          when lower(v_membership.status)='active' then v_membership.source
          else 'user_invitation:'||v_inv.invitation_id
        end,
        updated_at=now()
    where id=v_membership.id;
  else
    insert into public.app_role_memberships(
      membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source
    ) values(
      'INVITE:'||v_inv.invitation_id,p_auth_user_id,v_user_id,
      v_inv.role,v_inv.scope_type,v_inv.scope_id,'pending',
      'user_invitation:'||v_inv.invitation_id
    );
  end if;

  insert into public.platform_audit_events(
    action,entity_type,entity_id,source,institution_id,employer_id,metadata
  ) values(
    'USER_INVITATION_IDENTITY_LINKED','user_invitation',v_inv.invitation_id,
    'workforce-web-service',v_inv.institution_id,v_inv.contractor_id,
    jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
  );

  return security.workforce_invitation_json(v_inv);
end;
$$;

create or replace function public.workforce_invitation_mark_delivery(
  p_invitation_id text,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_inv public.wf_user_invitations%rowtype;
begin
  if v_status not in ('sent','failed') then
    raise exception 'Invalid delivery status';
  end if;

  update public.wf_user_invitations
  set delivery_status=v_status,
      delivery_error=case
        when v_status='failed' then left(nullif(btrim(coalesce(p_error,'')),''),500)
        else null
      end,
      last_sent_at=now(),
      send_count=send_count+1,
      updated_at=now()
  where invitation_id=p_invitation_id
  returning * into v_inv;

  if not found then raise exception 'Invitation not found'; end if;

  insert into public.platform_audit_events(
    action,entity_type,entity_id,source,institution_id,employer_id,result,metadata
  ) values(
    case when v_status='sent' then 'USER_INVITATION_SENT' else 'USER_INVITATION_DELIVERY_FAILED' end,
    'user_invitation',v_inv.invitation_id,'workforce-web-service',
    v_inv.institution_id,v_inv.contractor_id,
    case when v_status='sent' then 'success' else 'failed' end,
    jsonb_build_object('role',v_inv.role,'scopeType',v_inv.scope_type,'scopeId',v_inv.scope_id)
  );

  return security.workforce_invitation_json(v_inv);
end;
$$;

create or replace function public.workforce_invitation_accept(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_inv public.wf_user_invitations%rowtype;
  v_email text;
  v_user_id text;
  v_membership public.app_role_memberships%rowtype;
  v_membership_key text;
  v_redirect text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select lower(btrim(coalesce(a.email,''))) into v_email
  from auth.users a
  where a.id=(select auth.uid());

  select * into v_inv
  from public.wf_user_invitations
  where invitation_id=p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found'; end if;

  if v_inv.status='accepted'
    and v_inv.accepted_by_auth_user_id=(select auth.uid()) then
    v_redirect:=case
      when lower(v_inv.role)='student' then '/onboarding?role=student&invitation='||v_inv.invitation_id
      when security.canonical_institution_role(v_inv.role) is not null then '/institution'
      when lower(v_inv.scope_type)='employer' then '/employer'
      when lower(v_inv.role) in ('super_admin','admin') then '/admin'
      else '/'
    end;
    return security.workforce_invitation_json(v_inv)
      || jsonb_build_object('ok',true,'redirectTo',v_redirect,'idempotent',true);
  end if;

  if v_inv.status<>'pending' then
    return security.workforce_invitation_json(v_inv)
      || jsonb_build_object('ok',false,'message','Invitation is no longer pending');
  end if;

  if v_inv.expires_at<=now() then
    update public.wf_user_invitations
    set status='expired',closed_at=now(),
        closed_by_auth_user_id=(select auth.uid()),
        closed_by_user_id=security.current_legacy_user_id(),
        updated_at=now()
    where invitation_id=v_inv.invitation_id
    returning * into v_inv;

    update public.app_role_memberships
    set status='expired',updated_at=now()
    where source='user_invitation:'||v_inv.invitation_id
      and lower(status)<>'active';

    return security.workforce_invitation_json(v_inv)
      || jsonb_build_object('ok',false,'message','Invitation has expired');
  end if;

  if v_email='' or v_email<>lower(btrim(v_inv.email)) then
    raise exception 'Invitation does not belong to this account';
  end if;

  if v_inv.target_auth_user_id is not null
    and v_inv.target_auth_user_id<>(select auth.uid()) then
    raise exception 'Invitation identity mismatch';
  end if;

  if not security.invitation_target_valid(
    v_inv.role,v_inv.scope_type,v_inv.scope_id,v_inv.institution_id,v_inv.contractor_id
  ) then
    raise exception 'Invitation target is no longer valid';
  end if;

  select u.user_id into v_user_id
  from public.users u
  where u.auth_user_id=(select auth.uid())
  limit 1;

  if v_user_id is null then
    raise exception 'Workforce user bridge missing for this account';
  end if;

  select * into v_membership
  from public.app_role_memberships r
  where r.user_id=v_user_id
    and lower(r.role)=lower(v_inv.role)
    and lower(r.scope_type)=lower(v_inv.scope_type)
    and coalesce(r.scope_id,'')=coalesce(v_inv.scope_id,'')
  limit 1
  for update;

  if found then
    update public.app_role_memberships
    set auth_user_id=(select auth.uid()),
        status='active',
        source=case
          when source like 'user_invitation:%' then 'user_invitation:'||v_inv.invitation_id
          else source
        end,
        updated_at=now()
    where id=v_membership.id
    returning membership_key into v_membership_key;
  else
    v_membership_key:='INVITE:'||v_inv.invitation_id;
    insert into public.app_role_memberships(
      membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source
    ) values(
      v_membership_key,(select auth.uid()),v_user_id,v_inv.role,
      v_inv.scope_type,v_inv.scope_id,'active',
      'user_invitation:'||v_inv.invitation_id
    );
  end if;

  update public.wf_user_invitations
  set status='accepted',
      target_user_id=v_user_id,
      target_auth_user_id=(select auth.uid()),
      accepted_at=now(),
      accepted_by_auth_user_id=(select auth.uid()),
      accepted_by_user_id=v_user_id,
      closed_at=null,
      closed_by_auth_user_id=null,
      closed_by_user_id=null,
      updated_at=now()
  where invitation_id=v_inv.invitation_id
  returning * into v_inv;

  perform security.emit_workforce_event(
    'ROLE_MEMBERSHIP_APPROVED',
    'role_membership',
    v_membership_key,
    v_inv.contractor_id,
    v_inv.institution_id,
    null,
    null,
    jsonb_build_object(
      'membershipKey',v_membership_key,
      'role',v_inv.role,
      'scopeType',v_inv.scope_type,
      'scopeId',v_inv.scope_id,
      'status','active'
    ),
    jsonb_build_object(
      'invitationId',v_inv.invitation_id,
      'source','user_invitation'
    ),
    'success',
    'role_membership_approved:'||v_inv.invitation_id,
    null
  );

  v_redirect:=case
    when lower(v_inv.role)='student' then '/onboarding?role=student&invitation='||v_inv.invitation_id
    when security.canonical_institution_role(v_inv.role) is not null then '/institution'
    when lower(v_inv.scope_type)='employer' then '/employer'
    when lower(v_inv.role) in ('super_admin','admin') then '/admin'
    else '/'
  end;

  return security.workforce_invitation_json(v_inv)
    || jsonb_build_object('ok',true,'redirectTo',v_redirect,'idempotent',false);
end;
$$;

revoke all on function security.invitation_target_valid(text,text,text,text,text) from public;
revoke all on function security.can_invite_student(text,text,text) from public;
revoke all on function security.can_create_user_invitation(text,text,text,text,text) from public;
revoke all on function security.can_manage_user_invitation(text) from public;
revoke all on function security.workforce_invitation_json(public.wf_user_invitations) from public;

revoke all on function public.workforce_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb) from public,anon;
revoke all on function public.workforce_invitations_expire() from public,anon;
revoke all on function public.workforce_invitations_list(text,text,text) from public,anon;
revoke all on function public.workforce_my_invitation(text) from public,anon;
revoke all on function public.workforce_invitation_action(text,text,timestamptz) from public,anon;
revoke all on function public.workforce_invitation_accept(text) from public,anon;
revoke all on function public.workforce_invitation_link_identity(text,uuid) from public,anon,authenticated;
revoke all on function public.workforce_invitation_mark_delivery(text,text,text) from public,anon,authenticated;

grant execute on function public.workforce_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb) to authenticated;
grant execute on function public.workforce_invitations_expire() to authenticated;
grant execute on function public.workforce_invitations_list(text,text,text) to authenticated;
grant execute on function public.workforce_my_invitation(text) to authenticated;
grant execute on function public.workforce_invitation_action(text,text,timestamptz) to authenticated;
grant execute on function public.workforce_invitation_accept(text) to authenticated;
grant execute on function public.workforce_invitation_link_identity(text,uuid) to service_role;
grant execute on function public.workforce_invitation_mark_delivery(text,text,text) to service_role;
