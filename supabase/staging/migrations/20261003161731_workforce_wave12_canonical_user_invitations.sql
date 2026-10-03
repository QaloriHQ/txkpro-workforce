-- W12-05A: canonical User Invitation & Activation System.
-- Invitations are the reusable lifecycle record for Student, Institution team,
-- Employer team, and TXKPRO provisioning flows. Authorization is always derived
-- from server-side role/scope policy, never from editable client metadata.

create extension if not exists pgcrypto;

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_id text not null unique default security.new_legacy_id('INV'),
  email text not null check (btrim(email) <> ''),
  email_normalized text generated always as (lower(btrim(email))) stored,
  role text not null,
  scope_type text not null,
  scope_id text,
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked','cancelled')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by_auth_user_id uuid,
  created_by_user_id text,
  accepted_by_auth_user_id uuid,
  accepted_user_id text,
  membership_id uuid references public.app_role_memberships(id) on delete set null,
  wf_membership_id uuid references public.wf_role_memberships(id) on delete set null,
  resend_count integer not null default 0 check (resend_count >= 0),
  last_sent_at timestamptz,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','sent','delivered','failed','suppressed')),
  delivery_error text,
  activation_redirect text,
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invitations_pending_semantic_key
  on public.user_invitations(
    email_normalized,role,scope_type,coalesce(scope_id,'')
  )
  where status='pending';
create index if not exists user_invitations_scope_status_idx
  on public.user_invitations(scope_type,scope_id,status,created_at desc);
create index if not exists user_invitations_delivery_idx
  on public.user_invitations(delivery_status,updated_at desc);

alter table public.user_invitations enable row level security;
revoke all on public.user_invitations from public,anon,authenticated;
grant select,insert,update,delete on public.user_invitations to service_role;

create or replace function security.canonical_invitation_role(p_role text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(btrim(coalesce(p_role,'')))
    when 'educator' then 'instructor'
    when 'institution' then 'instructor'
    when 'contractor_owner' then 'employer_owner'
    when 'contractor_recruiter' then 'recruiter'
    else lower(btrim(coalesce(p_role,'')))
  end;
$$;

create or replace function security.invitation_role_group(p_role text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when security.canonical_invitation_role(p_role)='student' then 'student'
    when security.canonical_invitation_role(p_role) in (
      'institution_super_admin','institution_admin','department_head',
      'program_coordinator','instructor','assistant_instructor',
      'career_services','read_only_analyst'
    ) then 'institution'
    when security.canonical_invitation_role(p_role) in (
      'employer_owner','employer_admin','recruiter','hiring_manager',
      'employer_read_only'
    ) then 'employer'
    when security.canonical_invitation_role(p_role) in (
      'super_admin','admin','platform_admin'
    ) then 'platform'
    else null
  end;
$$;

create or replace function security.invitation_scope_institution_id(
  p_scope_type text,
  p_scope_id text
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case lower(coalesce(p_scope_type,''))
    when 'institution' then p_scope_id
    when 'cohort' then (
      select c.institution_id
      from public.wf_cohorts c
      where c.cohort_id=p_scope_id
      limit 1
    )
    when 'program' then (
      select c.institution_id
      from public.wf_cohorts c
      where lower(coalesce(c.trade_id,''))=lower(coalesce(p_scope_id,''))
         or lower(coalesce(c.program_name,''))=lower(coalesce(p_scope_id,''))
      order by c.institution_id
      limit 1
    )
    when 'department' then (
      select b.institution_id
      from public.wf_institution_scope_bindings b
      where b.scope_type='department'
        and lower(b.scope_id)=lower(coalesce(p_scope_id,''))
        and b.active=true
      order by b.institution_id
      limit 1
    )
    else null
  end;
$$;

create or replace function security.invitation_scope_valid(
  p_role text,
  p_scope_type text,
  p_scope_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(case security.invitation_role_group(p_role)
    when 'student' then
      lower(coalesce(p_scope_type,'')) in ('institution','program','cohort')
      and security.invitation_scope_institution_id(p_scope_type,p_scope_id) is not null
    when 'institution' then
      security.institution_role_scope_valid(
        security.canonical_invitation_role(p_role),
        p_scope_type
      )
      and security.invitation_scope_institution_id(p_scope_type,p_scope_id) is not null
    when 'employer' then
      lower(coalesce(p_scope_type,''))='employer'
      and exists(
        select 1
        from public.contractors c
        where c.contractor_id=p_scope_id
          and lower(coalesce(c.account_status,'active'))='active'
      )
    when 'platform' then
      lower(coalesce(p_scope_type,''))='platform'
    else false
  end,false);
$$;

create or replace function security.can_invite_user(
  p_role text,
  p_scope_type text,
  p_scope_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.invitation_scope_valid(p_role,p_scope_type,p_scope_id)
    and case security.invitation_role_group(p_role)
      when 'student' then (
        security.is_admin()
        or exists(
          select 1
          from public.app_role_memberships r
          where r.auth_user_id=(select auth.uid())
            and lower(r.status)='active'
            and security.canonical_institution_role(r.role) in (
              'institution_super_admin','institution_admin',
              'department_head','program_coordinator','career_services'
            )
            and security.institution_role_scope_valid(r.role,r.scope_type)
            and security.institution_scope_contains(
              security.invitation_scope_institution_id(p_scope_type,p_scope_id),
              r.scope_type,
              r.scope_id,
              p_scope_type,
              p_scope_id
            )
        )
      )
      when 'institution' then security.can_invite_institution_member(
        security.invitation_scope_institution_id(p_scope_type,p_scope_id),
        security.canonical_invitation_role(p_role),
        p_scope_type,
        p_scope_id
      )
      when 'employer' then (
        case
          when security.canonical_invitation_role(p_role)='employer_owner'
            then security.is_admin()
          else security.has_employer_role(
            p_scope_id,
            array['employer_owner','employer_admin']
          )
        end
      )
      when 'platform' then security.is_admin()
      else false
    end,
    false
  );
$$;

create or replace function security.can_view_invitation(
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_email_normalized text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.can_invite_user(p_role,p_scope_type,p_scope_id)
    or exists(
      select 1
      from public.users u
      where u.auth_user_id=(select auth.uid())
        and lower(btrim(coalesce(u.email,'')))=lower(btrim(coalesce(p_email_normalized,'')))
    ),
    false
  );
$$;

create or replace function security.invitation_onboarding_role(p_role text)
returns text
language sql
immutable
set search_path=''
as $$
  select case security.invitation_role_group(p_role)
    when 'student' then 'student'
    when 'institution' then 'educator'
    when 'employer' then 'employer'
    when 'platform' then 'admin'
    else null
  end;
$$;

create or replace function security.ensure_invitation_user(
  p_email text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_user_id text;
begin
  if v_email='' then
    raise exception 'Invitation email is required';
  end if;

  select u.user_id into v_user_id
  from public.users u
  where lower(btrim(coalesce(u.email,'')))=v_email
  order by u.auth_user_id nulls last,u.created_at nulls last
  limit 1;

  if v_user_id is not null then return v_user_id; end if;

  insert into public.users(
    user_id,email,status,bridge_source_key,bridge_source_sheet
  ) values(
    security.new_legacy_id('USR'),v_email,'invited',
    'user_invitation:'||gen_random_uuid()::text,'user_invitations'
  ) returning user_id into v_user_id;

  return v_user_id;
end;
$$;

create or replace function security.ensure_invitation_membership(
  p_invitation_id text,
  p_auth_user_id uuid,
  p_user_id text,
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_role text:=security.canonical_invitation_role(p_role);
  v_scope_id text:=nullif(btrim(coalesce(p_scope_id,'')),'');
begin
  update public.app_role_memberships
  set auth_user_id=coalesce(p_auth_user_id,auth_user_id),
      status=case when lower(status)='active' then 'active' else p_status end,
      source='user_invitation',
      updated_at=now()
  where user_id=p_user_id
    and role=v_role
    and scope_type=lower(p_scope_type)
    and coalesce(scope_id,'')=coalesce(v_scope_id,'')
  returning id into v_id;

  if v_id is not null then return v_id; end if;

  insert into public.app_role_memberships(
    membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source
  ) values(
    'INVITE:'||p_invitation_id,p_auth_user_id,p_user_id,v_role,
    lower(p_scope_type),v_scope_id,p_status,'user_invitation'
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function security.ensure_invitation_wf_membership(
  p_user_id text,
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_role text:=security.canonical_invitation_role(p_role);
  v_institution_id text:=null;
  v_employer_id text:=null;
begin
  if security.invitation_role_group(v_role) in ('student','institution') then
    v_institution_id:=security.invitation_scope_institution_id(p_scope_type,p_scope_id);
  elsif security.invitation_role_group(v_role)='employer' then
    v_employer_id:=p_scope_id;
  end if;

  insert into public.wf_role_memberships(
    membership_id,user_id,role,institution_id,contractor_id,status,
    bridge_source_key,bridge_source_sheet
  ) values(
    security.new_legacy_id('WFR'),p_user_id,v_role,v_institution_id,
    v_employer_id,p_status,
    'user_invitation:'||p_user_id||':'||v_role||':'||
      coalesce(v_institution_id,v_employer_id,'platform'),
    'user_invitations'
  )
  on conflict do nothing;

  select id into v_id
  from public.wf_role_memberships m
  where m.user_id=p_user_id
    and lower(m.role)=v_role
    and coalesce(m.institution_id,'')=coalesce(v_institution_id,'')
    and coalesce(m.contractor_id,'')=coalesce(v_employer_id,'')
  order by m.created_at desc nulls last
  limit 1;

  if v_id is not null then
    update public.wf_role_memberships
    set status=case when lower(status)='active' then 'active' else p_status end,
        updated_at=now()
    where id=v_id;
  end if;

  return v_id;
end;
$$;

create or replace function security.ensure_invited_student_profile(
  p_user_id text,
  p_scope_type text,
  p_scope_id text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student_id text;
  v_institution_id text:=security.invitation_scope_institution_id(p_scope_type,p_scope_id);
  v_cohort_id text:=case when lower(p_scope_type)='cohort' then p_scope_id else null end;
  v_program text:=case when lower(p_scope_type)='program' then p_scope_id else null end;
begin
  select s.student_id into v_student_id
  from public.wf_student_profiles s
  where s.user_id=p_user_id
  limit 1;

  if v_student_id is null then
    v_student_id:=security.new_legacy_id('STU');
    insert into public.wf_student_profiles(
      student_id,user_id,profile_status,profile_visibility,school_id,cohort_id,
      program_type,institution_validation_status,created_at,updated_at,
      bridge_source_key,bridge_source_sheet
    ) values(
      v_student_id,p_user_id,'invited','private',v_institution_id,v_cohort_id,
      v_program,'pending',now(),now(),
      'user_invitation:student:'||v_student_id,'user_invitations'
    );
  else
    update public.wf_student_profiles
    set school_id=coalesce(school_id,v_institution_id),
        cohort_id=coalesce(cohort_id,v_cohort_id),
        program_type=coalesce(program_type,v_program),
        profile_status=case
          when lower(coalesce(profile_status,'')) in ('','pending','invited')
            then 'invited'
          else profile_status
        end,
        institution_validation_status=coalesce(institution_validation_status,'pending'),
        updated_at=now()
    where student_id=v_student_id;
  end if;

  return v_student_id;
end;
$$;

create or replace function public.invitation_create(
  p_email text,
  p_role text,
  p_scope_type text,
  p_scope_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_expires_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=security.canonical_invitation_role(p_role);
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
  v_scope_id text:=nullif(btrim(coalesce(p_scope_id,'')),'');
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_token text:=encode(gen_random_bytes(32),'hex');
  v_token_hash text:=encode(digest(v_token,'sha256'),'hex');
  v_user_id text;
  v_membership_id uuid;
  v_wf_membership_id uuid;
  v_invitation public.user_invitations%rowtype;
  v_existing public.user_invitations%rowtype;
  v_existing_membership public.app_role_memberships%rowtype;
  v_expires_at timestamptz:=now()+make_interval(hours=>greatest(1,least(coalesce(p_expires_hours,168),720)));
  v_institution_id text:=null;
  v_employer_id text:=null;
  v_student_id text:=null;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if v_email='' then raise exception 'Invitation email is required'; end if;
  if not security.can_invite_user(v_role,v_scope_type,v_scope_id) then
    raise exception 'Invitation permission denied for role and scope';
  end if;

  update public.user_invitations
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  select * into v_existing
  from public.user_invitations i
  where i.email_normalized=v_email
    and i.role=v_role
    and i.scope_type=v_scope_type
    and coalesce(i.scope_id,'')=coalesce(v_scope_id,'')
    and i.status='pending'
    and i.expires_at>now()
  order by i.created_at desc
  limit 1;

  if found then
    update public.user_invitations
    set updated_at=now()
    where invitation_id=v_existing.invitation_id
    returning * into v_invitation;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'invitationId',v_invitation.invitation_id,
      'status',v_invitation.status,'email',v_invitation.email,
      'role',v_invitation.role,'scopeType',v_invitation.scope_type,
      'scopeId',v_invitation.scope_id,'expiresAt',v_invitation.expires_at,
      'activationToken',null,'activationPath',null,
      'deliveryStatus',v_invitation.delivery_status
    );
  end if;

  v_user_id:=security.ensure_invitation_user(v_email);

  select * into v_existing_membership
  from public.app_role_memberships m
  where m.user_id=v_user_id
    and m.role=v_role
    and m.scope_type=v_scope_type
    and coalesce(m.scope_id,'')=coalesce(v_scope_id,'')
    and lower(m.status)='active'
  limit 1;
  if found then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'alreadyMember',true,
      'membershipId',v_existing_membership.id,'status','active',
      'email',v_email,'role',v_role,'scopeType',v_scope_type,
      'scopeId',v_scope_id,'activationToken',null,'activationPath',null
    );
  end if;

  v_membership_id:=security.ensure_invitation_membership(
    security.new_legacy_id('INVKEY'),null,v_user_id,v_role,v_scope_type,
    v_scope_id,'pending'
  );

  v_wf_membership_id:=security.ensure_invitation_wf_membership(
    v_user_id,v_role,v_scope_type,v_scope_id,'pending'
  );

  if security.invitation_role_group(v_role)='student' then
    v_student_id:=security.ensure_invited_student_profile(v_user_id,v_scope_type,v_scope_id);
  end if;

  insert into public.user_invitations(
    email,role,scope_type,scope_id,status,token_hash,expires_at,
    created_by_auth_user_id,created_by_user_id,membership_id,wf_membership_id,
    last_sent_at,delivery_status,activation_redirect,metadata
  ) values(
    v_email,v_role,v_scope_type,v_scope_id,'pending',v_token_hash,v_expires_at,
    (select auth.uid()),security.current_legacy_user_id(),v_membership_id,
    v_wf_membership_id,now(),'queued',
    case security.invitation_role_group(v_role)
      when 'student' then '/onboarding?role=student'
      when 'institution' then '/onboarding?role=educator'
      when 'employer' then '/onboarding?role=employer'
      when 'platform' then '/admin'
      else '/onboarding'
    end,
    coalesce(p_metadata,'{}'::jsonb)
  ) returning * into v_invitation;

  update public.app_role_memberships
  set membership_key='INVITE:'||v_invitation.invitation_id,
      updated_at=now()
  where id=v_membership_id;

  v_institution_id:=case
    when security.invitation_role_group(v_role) in ('student','institution')
      then security.invitation_scope_institution_id(v_scope_type,v_scope_id)
    else null
  end;
  v_employer_id:=case
    when security.invitation_role_group(v_role)='employer' then v_scope_id
    else null
  end;

  perform security.emit_workforce_event(
    'USER_INVITATION_CREATED','user_invitation',v_invitation.invitation_id,
    v_employer_id,v_institution_id,v_student_id,
    null,
    jsonb_build_object(
      'email',v_invitation.email_normalized,'role',v_role,
      'scopeType',v_scope_type,'scopeId',v_scope_id,'status','pending'
    ),
    jsonb_build_object('source','canonical_invitation','deliveryStatus','queued'),
    'success',
    'user_invitation_created:'||v_invitation.invitation_id,
    null
  );

  return jsonb_build_object(
    'ok',true,'idempotent',false,'invitationId',v_invitation.invitation_id,
    'status',v_invitation.status,'email',v_invitation.email,
    'role',v_invitation.role,'scopeType',v_invitation.scope_type,
    'scopeId',v_invitation.scope_id,'expiresAt',v_invitation.expires_at,
    'activationToken',v_token,
    'activationPath','/activate/'||v_token,
    'deliveryStatus',v_invitation.delivery_status
  );
end;
$$;

create or replace function public.invitation_bulk_create(
  p_invitations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_results jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_invitations)<>'array' then
    raise exception 'Bulk invitations must be an array';
  end if;

  for v_item in select value from jsonb_array_elements(p_invitations) loop
    begin
      v_result:=public.invitation_create(
        v_item->>'email',
        v_item->>'role',
        v_item->>'scopeType',
        v_item->>'scopeId',
        coalesce(v_item->'metadata','{}'::jsonb),
        coalesce((v_item->>'expiresHours')::integer,168)
      );
      v_results:=v_results||jsonb_build_array(v_result);
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'ok',false,'email',v_item->>'email','error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object('ok',true,'results',v_results);
end;
$$;

create or replace function public.invitation_list(
  p_scope_type text default null,
  p_scope_id text default null,
  p_status text default null,
  p_query text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_query text:=lower(nullif(btrim(coalesce(p_query,'')),''));
begin
  update public.user_invitations
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'invitationId',i.invitation_id,
      'email',i.email,
      'role',i.role,
      'roleGroup',security.invitation_role_group(i.role),
      'scopeType',i.scope_type,
      'scopeId',i.scope_id,
      'status',i.status,
      'expiresAt',i.expires_at,
      'createdAt',i.created_at,
      'updatedAt',i.updated_at,
      'acceptedAt',i.accepted_at,
      'resendCount',i.resend_count,
      'deliveryStatus',i.delivery_status,
      'deliveryError',i.delivery_error,
      'membershipId',i.membership_id,
      'acceptedUserId',i.accepted_user_id,
      'canManage',security.can_invite_user(i.role,i.scope_type,i.scope_id)
    ) order by i.created_at desc)
    from public.user_invitations i
    where security.can_view_invitation(i.role,i.scope_type,i.scope_id,i.email_normalized)
      and (p_scope_type is null or i.scope_type=lower(p_scope_type))
      and (p_scope_id is null or coalesce(i.scope_id,'')=coalesce(nullif(p_scope_id,''),''))
      and (p_status is null or i.status=lower(p_status))
      and (
        v_query is null
        or i.email_normalized like '%'||v_query||'%'
        or i.role like '%'||v_query||'%'
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.invitation_resend(
  p_invitation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invitation public.user_invitations%rowtype;
  v_token text:=encode(gen_random_bytes(32),'hex');
  v_token_hash text:=encode(digest(v_token,'sha256'),'hex');
begin
  update public.user_invitations
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  select * into v_invitation
  from public.user_invitations
  where invitation_id=p_invitation_id
  for update;
  if not found then raise exception 'Invitation not found'; end if;
  if not security.can_invite_user(v_invitation.role,v_invitation.scope_type,v_invitation.scope_id) then
    raise exception 'Invitation permission denied';
  end if;
  if v_invitation.status<>'pending' then
    raise exception 'Only pending invitations can be resent';
  end if;

  update public.user_invitations
  set token_hash=v_token_hash,
      expires_at=now()+interval '7 days',
      resend_count=resend_count+1,
      last_sent_at=now(),
      delivery_status='queued',
      delivery_error=null,
      updated_at=now()
  where invitation_id=p_invitation_id
  returning * into v_invitation;

  perform security.emit_workforce_event(
    'USER_INVITATION_RESENT','user_invitation',v_invitation.invitation_id,
    case when security.invitation_role_group(v_invitation.role)='employer' then v_invitation.scope_id else null end,
    case when security.invitation_role_group(v_invitation.role) in ('student','institution')
      then security.invitation_scope_institution_id(v_invitation.scope_type,v_invitation.scope_id) else null end,
    null,null,
    jsonb_build_object('resendCount',v_invitation.resend_count,'deliveryStatus','queued'),
    jsonb_build_object('source','canonical_invitation'),
    'success','user_invitation_resent:'||v_invitation.invitation_id||':'||v_invitation.resend_count,null
  );

  return jsonb_build_object(
    'ok',true,'invitationId',v_invitation.invitation_id,
    'activationToken',v_token,'activationPath','/activate/'||v_token,
    'expiresAt',v_invitation.expires_at,'deliveryStatus',v_invitation.delivery_status
  );
end;
$$;

create or replace function public.invitation_revoke(
  p_invitation_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  select * into v_invitation
  from public.user_invitations
  where invitation_id=p_invitation_id
  for update;
  if not found then raise exception 'Invitation not found'; end if;
  if not security.can_invite_user(v_invitation.role,v_invitation.scope_type,v_invitation.scope_id) then
    raise exception 'Invitation permission denied';
  end if;
  if v_invitation.status not in ('pending','expired') then
    raise exception 'Only pending or expired invitations can be revoked';
  end if;

  update public.user_invitations
  set status='revoked',
      revoked_at=now(),
      revoked_by_user_id=security.current_legacy_user_id(),
      updated_at=now(),
      metadata=metadata||jsonb_build_object('revocationReason',nullif(btrim(coalesce(p_reason,'')),''))
  where invitation_id=p_invitation_id
  returning * into v_invitation;

  update public.app_role_memberships
  set status='cancelled',updated_at=now()
  where id=v_invitation.membership_id
    and lower(status)='pending';

  update public.wf_role_memberships
  set status='cancelled',updated_at=now()
  where id=v_invitation.wf_membership_id
    and lower(status)='pending';

  perform security.emit_workforce_event(
    'USER_INVITATION_REVOKED','user_invitation',v_invitation.invitation_id,
    case when security.invitation_role_group(v_invitation.role)='employer' then v_invitation.scope_id else null end,
    case when security.invitation_role_group(v_invitation.role) in ('student','institution')
      then security.invitation_scope_institution_id(v_invitation.scope_type,v_invitation.scope_id) else null end,
    null,null,
    jsonb_build_object('status','revoked','reason',p_reason),
    jsonb_build_object('source','canonical_invitation'),
    'success','user_invitation_revoked:'||v_invitation.invitation_id,null
  );

  return jsonb_build_object(
    'ok',true,'invitationId',v_invitation.invitation_id,'status',v_invitation.status
  );
end;
$$;

create or replace function public.invitation_accept(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_token_hash text:=encode(digest(coalesce(p_token,''),'sha256'),'hex');
  v_invitation public.user_invitations%rowtype;
  v_auth_email text;
  v_user_id text;
  v_user public.users%rowtype;
  v_membership_id uuid;
  v_wf_membership_id uuid;
  v_student_id text:=null;
  v_onboarding_role text;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.user_invitations
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  select * into v_invitation
  from public.user_invitations
  where token_hash=v_token_hash
  for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_invitation.status='accepted' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'invitationId',v_invitation.invitation_id,
      'status','accepted','redirectTo',coalesce(v_invitation.activation_redirect,'/onboarding')
    );
  end if;
  if v_invitation.status<>'pending' or v_invitation.expires_at<=now() then
    raise exception 'Invitation is no longer active';
  end if;

  select lower(btrim(email::text)) into v_auth_email
  from auth.users
  where id=v_auth_user_id;
  if v_auth_email is null or v_auth_email<>v_invitation.email_normalized then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  select * into v_user
  from public.users u
  where u.auth_user_id=v_auth_user_id
     or lower(btrim(coalesce(u.email,'')))=v_invitation.email_normalized
  order by case when u.auth_user_id=v_auth_user_id then 0 else 1 end,u.created_at nulls last
  limit 1;

  if found then
    v_user_id:=v_user.user_id;
    update public.users
    set auth_user_id=coalesce(auth_user_id,v_auth_user_id),
        email=coalesce(email,v_invitation.email_normalized),
        status=case when lower(coalesce(status,''))='invited' then 'active' else status end,
        updated_at=now()
    where user_id=v_user_id;
  else
    insert into public.users(
      user_id,email,status,auth_user_id,bridge_source_key,bridge_source_sheet
    ) values(
      security.new_legacy_id('USR'),v_invitation.email_normalized,'active',
      v_auth_user_id,'user_invitation_accept:'||v_invitation.invitation_id,
      'user_invitations'
    ) returning user_id into v_user_id;
  end if;

  v_membership_id:=security.ensure_invitation_membership(
    v_invitation.invitation_id,v_auth_user_id,v_user_id,v_invitation.role,
    v_invitation.scope_type,v_invitation.scope_id,'active'
  );
  v_wf_membership_id:=security.ensure_invitation_wf_membership(
    v_user_id,v_invitation.role,v_invitation.scope_type,v_invitation.scope_id,'active'
  );

  if security.invitation_role_group(v_invitation.role)='student' then
    v_student_id:=security.ensure_invited_student_profile(
      v_user_id,v_invitation.scope_type,v_invitation.scope_id
    );
  end if;

  v_onboarding_role:=security.invitation_onboarding_role(v_invitation.role);
  if v_onboarding_role is not null and v_onboarding_role<>'admin' then
    insert into public.wf_onboarding_accounts(
      auth_user_id,user_id,selected_role,status,current_step,profile_data,updated_at
    ) values(
      v_auth_user_id,v_user_id,v_onboarding_role,'in_progress',1,
      jsonb_build_object(
        'invitationId',v_invitation.invitation_id,
        'invitedRole',v_invitation.role,
        'scopeType',v_invitation.scope_type,
        'scopeId',v_invitation.scope_id
      ),
      now()
    )
    on conflict (auth_user_id) do update
    set selected_role=coalesce(public.wf_onboarding_accounts.selected_role,v_onboarding_role),
        status=case
          when public.wf_onboarding_accounts.status='complete' then 'complete'
          else 'in_progress'
        end,
        profile_data=public.wf_onboarding_accounts.profile_data||excluded.profile_data,
        updated_at=now();
  end if;

  update public.user_invitations
  set status='accepted',
      accepted_at=now(),
      accepted_by_auth_user_id=v_auth_user_id,
      accepted_user_id=v_user_id,
      membership_id=v_membership_id,
      wf_membership_id=v_wf_membership_id,
      updated_at=now()
  where invitation_id=v_invitation.invitation_id
  returning * into v_invitation;

  perform security.emit_workforce_event(
    'USER_INVITATION_ACCEPTED','user_invitation',v_invitation.invitation_id,
    case when security.invitation_role_group(v_invitation.role)='employer' then v_invitation.scope_id else null end,
    case when security.invitation_role_group(v_invitation.role) in ('student','institution')
      then security.invitation_scope_institution_id(v_invitation.scope_type,v_invitation.scope_id) else null end,
    v_student_id,
    null,
    jsonb_build_object(
      'status','accepted','role',v_invitation.role,
      'scopeType',v_invitation.scope_type,'scopeId',v_invitation.scope_id,
      'userId',v_user_id
    ),
    jsonb_build_object('source','canonical_invitation'),
    'success','user_invitation_accepted:'||v_invitation.invitation_id,null
  );

  return jsonb_build_object(
    'ok',true,'idempotent',false,'invitationId',v_invitation.invitation_id,
    'status','accepted','role',v_invitation.role,
    'roleGroup',security.invitation_role_group(v_invitation.role),
    'scopeType',v_invitation.scope_type,'scopeId',v_invitation.scope_id,
    'userId',v_user_id,'membershipId',v_membership_id,
    'redirectTo',coalesce(v_invitation.activation_redirect,'/onboarding')
  );
end;
$$;

revoke all on function security.canonical_invitation_role(text) from public,anon,authenticated;
revoke all on function security.invitation_role_group(text) from public,anon,authenticated;
revoke all on function security.invitation_scope_institution_id(text,text) from public,anon,authenticated;
revoke all on function security.invitation_scope_valid(text,text,text) from public,anon,authenticated;
revoke all on function security.can_invite_user(text,text,text) from public,anon,authenticated;
revoke all on function security.can_view_invitation(text,text,text,text) from public,anon,authenticated;
revoke all on function security.invitation_onboarding_role(text) from public,anon,authenticated;
revoke all on function security.ensure_invitation_user(text) from public,anon,authenticated;
revoke all on function security.ensure_invitation_membership(text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function security.ensure_invitation_wf_membership(text,text,text,text,text) from public,anon,authenticated;
revoke all on function security.ensure_invited_student_profile(text,text,text) from public,anon,authenticated;
grant execute on function security.canonical_invitation_role(text) to service_role;
grant execute on function security.invitation_role_group(text) to service_role;
grant execute on function security.invitation_scope_institution_id(text,text) to service_role;
grant execute on function security.invitation_scope_valid(text,text,text) to service_role;
grant execute on function security.can_invite_user(text,text,text) to service_role;
grant execute on function security.can_view_invitation(text,text,text,text) to service_role;
grant execute on function security.invitation_onboarding_role(text) to service_role;
grant execute on function security.ensure_invitation_user(text) to service_role;
grant execute on function security.ensure_invitation_membership(text,uuid,text,text,text,text,text) to service_role;
grant execute on function security.ensure_invitation_wf_membership(text,text,text,text,text) to service_role;
grant execute on function security.ensure_invited_student_profile(text,text,text) to service_role;

revoke all on function public.invitation_create(text,text,text,text,jsonb,integer) from public,anon;
revoke all on function public.invitation_bulk_create(jsonb) from public,anon;
revoke all on function public.invitation_list(text,text,text,text) from public,anon;
revoke all on function public.invitation_resend(text) from public,anon;
revoke all on function public.invitation_revoke(text,text) from public,anon;
revoke all on function public.invitation_accept(text) from public,anon;
grant execute on function public.invitation_create(text,text,text,text,jsonb,integer) to authenticated,service_role;
grant execute on function public.invitation_bulk_create(jsonb) to authenticated,service_role;
grant execute on function public.invitation_list(text,text,text,text) to authenticated,service_role;
grant execute on function public.invitation_resend(text) to authenticated,service_role;
grant execute on function public.invitation_revoke(text,text) to authenticated,service_role;
grant execute on function public.invitation_accept(text) to authenticated,service_role;

comment on table public.user_invitations is
  'W12-05A canonical invitation lifecycle for Student, Institution, Employer, and TXKPRO provisioning. Tokens are stored only as hashes; membership activation is server-authorized.';
comment on function public.invitation_create(text,text,text,text,jsonb,integer) is
  'Creates or idempotently returns a pending invitation and pending membership in an authorized role/scope. Returns the one-time activation token only on first create/resend.';
comment on function public.invitation_accept(text) is
  'Accepts a pending non-expired invitation for the authenticated account email, links existing identity, activates scoped membership, and creates onboarding handoff without trusting client role metadata.';
