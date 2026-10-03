-- W12-05A convergence hardening after canonical invitation merge.
-- Keeps public.user_invitations as the single repository-backed invitation model,
-- closes the live-only legacy RPC path, strengthens tenant resolution, and adds
-- delivery/expiration audit support.

alter table public.user_invitations
  add column if not exists institution_id text
    references public.wf_institutions(institution_id) on delete cascade,
  add column if not exists employer_id text
    references public.contractors(contractor_id) on delete cascade;

create index if not exists user_invitations_institution_status_idx
  on public.user_invitations(institution_id,status,created_at desc)
  where institution_id is not null;
create index if not exists user_invitations_employer_status_idx
  on public.user_invitations(employer_id,status,created_at desc)
  where employer_id is not null;

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
    when 'platform_admin' then 'admin'
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
      'super_admin','admin','support'
    ) then 'platform'
    else null
  end;
$$;

create or replace function security.invitation_scope_institution_id(
  p_scope_type text,
  p_scope_id text
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
  v_scope_id text:=nullif(btrim(coalesce(p_scope_id,'')),'');
  v_id text;
  v_count integer:=0;
begin
  if v_scope_type='institution' then
    select i.institution_id into v_id
    from public.wf_institutions i
    where i.institution_id=v_scope_id and i.active=true
    limit 1;
    return v_id;
  end if;

  if v_scope_type='cohort' then
    select c.institution_id into v_id
    from public.wf_cohorts c
    join public.wf_institutions i on i.institution_id=c.institution_id and i.active=true
    where c.cohort_id=v_scope_id
    limit 1;
    return v_id;
  end if;

  if v_scope_type='program' then
    with candidates as (
      select distinct c.institution_id
      from public.wf_cohorts c
      join public.wf_institutions i
        on i.institution_id=c.institution_id and i.active=true
      where lower(coalesce(c.trade_id,''))=lower(coalesce(v_scope_id,''))
         or lower(coalesce(c.program_name,''))=lower(coalesce(v_scope_id,''))
    ),
    actor_candidates as (
      select c.institution_id
      from candidates c
      where security.is_admin()
         or exists(
           select 1
           from public.app_role_memberships r
           where r.auth_user_id=(select auth.uid())
             and lower(r.status)='active'
             and security.canonical_institution_role(r.role) in (
               'institution_super_admin','institution_admin','department_head',
               'program_coordinator','instructor','assistant_instructor',
               'career_services','read_only_analyst'
             )
             and security.institution_role_scope_valid(r.role,r.scope_type)
             and security.institution_scope_matches(
               c.institution_id,r.scope_type,r.scope_id,null
             )
         )
    )
    select min(institution_id),count(*)::integer
      into v_id,v_count
    from actor_candidates;

    if v_count=1 then return v_id; end if;
    return null;
  end if;

  if v_scope_type='department' then
    with candidates as (
      select distinct b.institution_id
      from public.wf_institution_scope_bindings b
      join public.wf_institutions i
        on i.institution_id=b.institution_id and i.active=true
      where b.scope_type='department'
        and lower(b.scope_id)=lower(coalesce(v_scope_id,''))
        and b.active=true
    ),
    actor_candidates as (
      select c.institution_id
      from candidates c
      where security.is_admin()
         or exists(
           select 1
           from public.app_role_memberships r
           where r.auth_user_id=(select auth.uid())
             and lower(r.status)='active'
             and security.canonical_institution_role(r.role) in (
               'institution_super_admin','institution_admin','department_head',
               'program_coordinator','instructor','assistant_instructor',
               'career_services','read_only_analyst'
             )
             and security.institution_role_scope_valid(r.role,r.scope_type)
             and security.institution_scope_matches(
               c.institution_id,r.scope_type,r.scope_id,null
             )
         )
    )
    select min(institution_id),count(*)::integer
      into v_id,v_count
    from actor_candidates;

    if v_count=1 then return v_id; end if;
    return null;
  end if;

  return null;
end;
$$;

create or replace function security.invitation_scope_valid(
  p_role text,
  p_scope_type text,
  p_scope_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=security.canonical_invitation_role(p_role);
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
  v_group text:=security.invitation_role_group(v_role);
begin
  if v_scope_type='platform'
     and v_role in ('super_admin','admin','support','read_only_analyst') then
    return p_scope_id is null or btrim(coalesce(p_scope_id,''))='';
  end if;

  if v_group='student' then
    return v_scope_type in ('institution','program','cohort')
      and security.invitation_scope_institution_id(v_scope_type,p_scope_id) is not null;
  end if;

  if v_group='institution' then
    return security.institution_role_scope_valid(v_role,v_scope_type)
      and security.invitation_scope_institution_id(v_scope_type,p_scope_id) is not null;
  end if;

  if v_group='employer' then
    return v_scope_type='employer'
      and exists(
        select 1 from public.contractors c
        where c.contractor_id=p_scope_id
          and lower(coalesce(c.account_status,'active'))='active'
      );
  end if;

  if v_group='platform' then
    return v_scope_type='platform'
      and (p_scope_id is null or btrim(coalesce(p_scope_id,''))='');
  end if;

  return false;
end;
$$;

create or replace function security.can_invite_user(
  p_role text,
  p_scope_type text,
  p_scope_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=security.canonical_invitation_role(p_role);
  v_scope_type text:=lower(btrim(coalesce(p_scope_type,'')));
  v_group text:=case
    when v_scope_type='platform'
      and v_role in ('super_admin','admin','support','read_only_analyst')
      then 'platform'
    else security.invitation_role_group(v_role)
  end;
  v_institution_id text;
begin
  if not security.invitation_scope_valid(v_role,v_scope_type,p_scope_id) then
    return false;
  end if;

  if v_group='platform' then
    if not security.is_admin() then return false; end if;
    if v_role='super_admin' then return security.is_super_admin(); end if;
    return true;
  end if;

  if v_group='employer' then
    if v_role='employer_owner' then return security.is_admin(); end if;
    return security.has_employer_role(
      p_scope_id,array['employer_owner','employer_admin']
    );
  end if;

  v_institution_id:=security.invitation_scope_institution_id(
    v_scope_type,p_scope_id
  );
  if v_institution_id is null then return false; end if;

  if v_group='institution' then
    return security.can_invite_institution_member(
      v_institution_id,v_role,v_scope_type,p_scope_id
    );
  end if;

  if v_group='student' then
    if security.is_admin() then return true; end if;
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
          v_institution_id,r.scope_type,r.scope_id,v_scope_type,p_scope_id
        )
    );
  end if;

  return false;
end;
$$;

create or replace function security.stamp_user_invitation_tenant()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=security.canonical_invitation_role(new.role);
  v_scope_type text:=lower(btrim(coalesce(new.scope_type,'')));
  v_group text:=case
    when v_scope_type='platform'
      and v_role in ('super_admin','admin','support','read_only_analyst')
      then 'platform'
    else security.invitation_role_group(v_role)
  end;
begin
  new.role:=v_role;
  new.scope_type:=v_scope_type;

  if v_group in ('student','institution') then
    new.institution_id:=security.invitation_scope_institution_id(
      v_scope_type,new.scope_id
    );
    new.employer_id:=null;
    if new.institution_id is null then
      raise exception 'Invitation Institution scope is ambiguous or invalid';
    end if;
  elsif v_group='employer' then
    new.institution_id:=null;
    new.employer_id:=new.scope_id;
  else
    new.institution_id:=null;
    new.employer_id:=null;
  end if;

  if v_scope_type='platform' then
    new.activation_redirect:='/admin';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_invitations_stamp_tenant
  on public.user_invitations;
create trigger trg_user_invitations_stamp_tenant
before insert or update of role,scope_type,scope_id
on public.user_invitations
for each row execute function security.stamp_user_invitation_tenant();

-- Backfill is safe and idempotent. If ambiguous legacy rows ever exist, keep
-- their tenant null rather than guessing across Institutions.
update public.user_invitations i
set institution_id=case
      when security.invitation_role_group(i.role) in ('student','institution')
        then security.invitation_scope_institution_id(i.scope_type,i.scope_id)
      else null
    end,
    employer_id=case
      when security.invitation_role_group(i.role)='employer' then i.scope_id
      else null
    end
where i.institution_id is null and i.employer_id is null;

create or replace function security.audit_invitation_expiration()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='pending' and new.status='expired' then
    perform security.emit_workforce_event(
      'USER_INVITATION_EXPIRED','user_invitation',new.invitation_id,
      new.employer_id,new.institution_id,null,
      old.metadata,new.metadata,
      jsonb_build_object(
        'source','canonical_invitation',
        'status','expired'
      ),
      'success',
      'user_invitation_expired:'||new.invitation_id,
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_invitation_expiration_audit
  on public.user_invitations;
create trigger trg_user_invitation_expiration_audit
after update of status on public.user_invitations
for each row execute function security.audit_invitation_expiration();

create or replace function public.invitation_mark_delivery(
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
  v_inv public.user_invitations%rowtype;
begin
  if v_status not in ('sent','delivered','failed','suppressed') then
    raise exception 'Invalid invitation delivery status';
  end if;

  update public.user_invitations
  set delivery_status=v_status,
      delivery_error=case
        when v_status='failed'
          then left(nullif(btrim(coalesce(p_error,'')),''),120)
        else null
      end,
      last_sent_at=case
        when v_status in ('sent','delivered') then now()
        else last_sent_at
      end,
      updated_at=now()
  where invitation_id=p_invitation_id
  returning * into v_inv;

  if not found then raise exception 'Invitation not found'; end if;

  perform security.emit_workforce_event(
    case
      when v_status='failed' then 'USER_INVITATION_DELIVERY_FAILED'
      else 'USER_INVITATION_DELIVERY_UPDATED'
    end,
    'user_invitation',v_inv.invitation_id,
    v_inv.employer_id,v_inv.institution_id,null,
    null,
    jsonb_build_object(
      'deliveryStatus',v_status,
      'deliveryError',case when v_status='failed'
        then left(nullif(btrim(coalesce(p_error,'')),''),120)
        else null end
    ),
    jsonb_build_object('source','canonical_invitation_delivery'),
    case when v_status='failed' then 'failed' else 'success' end,
    'user_invitation_delivery:'||v_inv.invitation_id||':'||
      v_status||':'||v_inv.resend_count,
    null
  );

  return jsonb_build_object(
    'ok',true,'invitationId',v_inv.invitation_id,
    'deliveryStatus',v_status
  );
end;
$$;

-- Existing-account acceptance must still prove recipient identity even after a
-- token was already consumed. It also activates the exact pending membership
-- rows stored on the invitation instead of re-resolving an ambiguous scope.
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

  select lower(btrim(email::text)) into v_auth_email
  from auth.users
  where id=v_auth_user_id;
  if v_auth_email is null or v_auth_email<>v_invitation.email_normalized then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  if v_invitation.status='accepted' then
    if v_invitation.accepted_by_auth_user_id<>v_auth_user_id then
      raise exception 'Invitation already accepted by another identity';
    end if;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'invitationId',v_invitation.invitation_id,
      'status','accepted',
      'redirectTo',coalesce(v_invitation.activation_redirect,'/onboarding')
    );
  end if;
  if v_invitation.status<>'pending' or v_invitation.expires_at<=now() then
    raise exception 'Invitation is no longer active';
  end if;

  select * into v_user
  from public.users u
  where u.auth_user_id=v_auth_user_id
     or lower(btrim(coalesce(u.email,'')))=v_invitation.email_normalized
  order by case when u.auth_user_id=v_auth_user_id then 0 else 1 end,
           u.created_at nulls last
  limit 1;

  if found then
    if v_user.auth_user_id is not null
       and v_user.auth_user_id<>v_auth_user_id then
      raise exception 'Invitation identity conflicts with an existing account';
    end if;
    v_user_id:=v_user.user_id;
    update public.users
    set auth_user_id=v_auth_user_id,
        email=coalesce(email,v_invitation.email_normalized),
        status=case when lower(coalesce(status,''))='invited'
          then 'active' else status end,
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

  v_membership_id:=v_invitation.membership_id;
  if v_membership_id is not null then
    update public.app_role_memberships
    set auth_user_id=v_auth_user_id,
        user_id=v_user_id,
        status='active',
        source='user_invitation',
        updated_at=now()
    where id=v_membership_id;
  end if;
  if v_membership_id is null or not found then
    v_membership_id:=security.ensure_invitation_membership(
      v_invitation.invitation_id,v_auth_user_id,v_user_id,v_invitation.role,
      v_invitation.scope_type,v_invitation.scope_id,'active'
    );
  end if;

  v_wf_membership_id:=v_invitation.wf_membership_id;
  if v_wf_membership_id is not null then
    update public.wf_role_memberships
    set user_id=v_user_id,status='active',updated_at=now()
    where id=v_wf_membership_id;
  end if;
  if v_wf_membership_id is null or not found then
    insert into public.wf_role_memberships(
      membership_id,user_id,role,institution_id,contractor_id,status,
      bridge_source_key,bridge_source_sheet
    ) values(
      security.new_legacy_id('WFR'),v_user_id,
      security.canonical_invitation_role(v_invitation.role),
      v_invitation.institution_id,v_invitation.employer_id,'active',
      'user_invitation:'||v_invitation.invitation_id,'user_invitations'
    ) returning id into v_wf_membership_id;
  end if;

  if security.canonical_invitation_role(v_invitation.role)='student' then
    select s.student_id into v_student_id
    from public.wf_student_profiles s
    where s.user_id=v_user_id
    limit 1;

    if v_student_id is null then
      v_student_id:=security.new_legacy_id('STU');
      insert into public.wf_student_profiles(
        student_id,user_id,profile_status,profile_visibility,school_id,cohort_id,
        program_type,institution_validation_status,created_at,updated_at,
        bridge_source_key,bridge_source_sheet
      ) values(
        v_student_id,v_user_id,'invited','private',v_invitation.institution_id,
        case when v_invitation.scope_type='cohort'
          then v_invitation.scope_id else null end,
        case when v_invitation.scope_type='program'
          then v_invitation.scope_id else null end,
        'pending',now(),now(),
        'user_invitation:student:'||v_student_id,'user_invitations'
      );
    end if;
  end if;

  v_onboarding_role:=case
    when v_invitation.scope_type='platform' then 'admin'
    else security.invitation_onboarding_role(v_invitation.role)
  end;

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
    set selected_role=coalesce(
          public.wf_onboarding_accounts.selected_role,v_onboarding_role
        ),
        status=case
          when public.wf_onboarding_accounts.status='complete' then 'complete'
          else 'in_progress'
        end,
        profile_data=public.wf_onboarding_accounts.profile_data
          || excluded.profile_data,
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
    v_invitation.employer_id,v_invitation.institution_id,v_student_id,
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
    'roleGroup',case
      when v_invitation.scope_type='platform' then 'platform'
      else security.invitation_role_group(v_invitation.role)
    end,
    'scopeType',v_invitation.scope_type,'scopeId',v_invitation.scope_id,
    'userId',v_user_id,'membershipId',v_membership_id,
    'redirectTo',coalesce(v_invitation.activation_redirect,'/onboarding')
  );
end;
$$;

-- Platform read-only Analyst is scope-sensitive; render it as Platform when
-- the invitation is platform-scoped without changing Institution Analyst use.
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
      'roleGroup',case
        when i.scope_type='platform' then 'platform'
        else security.invitation_role_group(i.role)
      end,
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
    where security.can_view_invitation(
            i.role,i.scope_type,i.scope_id,i.email_normalized
          )
      and (p_scope_type is null or i.scope_type=lower(p_scope_type))
      and (
        p_scope_id is null
        or coalesce(i.scope_id,'')=coalesce(nullif(p_scope_id,''),'')
      )
      and (p_status is null or i.status=lower(p_status))
      and (
        v_query is null
        or i.email_normalized like '%'||v_query||'%'
        or i.role like '%'||v_query||'%'
      )
  ),'[]'::jsonb);
end;
$$;

-- The old live-only wf_user_invitations path was never repository-backed and
-- is empty in staging. Keep the objects for forensic compatibility, but remove
-- every authenticated EXECUTE grant so it cannot remain a second user-facing
-- invitation API.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','security')
      and (
        p.proname like 'workforce_invitation%'
        or p.proname in (
          'workforce_invitations_list',
          'workforce_invitations_expire',
          'workforce_my_invitation'
        )
      )
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from authenticated',
      r.schema_name,r.proname,r.args
    );
  end loop;
end;
$$;

do $
begin
  if to_regclass('public.wf_user_invitations') is not null then
    execute 'revoke all on table public.wf_user_invitations from public,anon,authenticated';
    execute 'comment on table public.wf_user_invitations is ''DEPRECATED W12-05A staging-only prototype table. No authenticated API grants remain; public.user_invitations is canonical.''';
  end if;
end;
$;

revoke all on function security.is_super_admin()
  from public,anon,authenticated;
revoke all on function security.stamp_user_invitation_tenant()
  from public,anon,authenticated;
revoke all on function security.audit_invitation_expiration()
  from public,anon,authenticated;
revoke all on function public.invitation_mark_delivery(text,text,text)
  from public,anon,authenticated;

grant execute on function security.is_super_admin() to service_role;
grant execute on function security.stamp_user_invitation_tenant() to service_role;
grant execute on function security.audit_invitation_expiration() to service_role;
grant execute on function public.invitation_mark_delivery(text,text,text)
  to service_role;

comment on function public.invitation_mark_delivery(text,text,text) is
  'W12-05A server-only delivery state writer for canonical invitation email delivery.';
