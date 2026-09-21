create schema if not exists security;

create or replace function security.new_legacy_id(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(coalesce(nullif(btrim(p_prefix),''),'ID')) || '-' ||
         upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique default security.new_legacy_id('USR'),
  role text not null default 'user',
  email text,
  phone text,
  first_name text,
  last_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  bridge_source_key text not null default ('supabase_auth:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'supabase_auth',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now(),
  auth_user_id uuid unique references auth.users(id) on delete cascade
);

create unique index if not exists users_normalized_email_key
  on public.users(lower(btrim(email)))
  where email is not null;

create table if not exists public.app_role_memberships (
  id uuid primary key default gen_random_uuid(),
  membership_key text not null unique,
  auth_user_id uuid references auth.users(id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  role text not null,
  scope_type text not null default 'platform',
  scope_id text,
  status text not null default 'active',
  source text not null default 'foundation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_role_memberships_semantic_key
  on public.app_role_memberships(user_id, role, scope_type, coalesce(scope_id,''));

create index if not exists app_role_memberships_auth_scope_idx
  on public.app_role_memberships(auth_user_id, status, role, scope_type, scope_id);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  contractor_id text not null unique default security.new_legacy_id('CON'),
  owner_user_id text references public.users(user_id) on delete set null,
  business_name text,
  business_phone text,
  business_email text,
  website text,
  description text,
  years_in_business text,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','suspended','rejected','closed')),
  account_status text not null default 'active'
    check (account_status in ('active','suspended','closed')),
  average_rating text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

create table if not exists public.contractor_team_members (
  id uuid primary key default gen_random_uuid(),
  team_member_id text not null unique default security.new_legacy_id('CTM'),
  contractor_id text not null references public.contractors(contractor_id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  title text,
  status text not null default 'active',
  created_at text,
  updated_at text,
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

create table if not exists public.wf_contractor_profiles (
  id uuid primary key default gen_random_uuid(),
  workforce_contractor_id text not null unique default security.new_legacy_id('WFC'),
  contractor_id text not null unique references public.contractors(contractor_id) on delete cascade,
  primary_recruiter_user_id text references public.users(user_id) on delete set null,
  workforce_status text not null default 'pending'
    check (workforce_status in ('pending','approved','suspended','rejected','inactive')),
  operating_base_zip text,
  city text,
  state text,
  county text,
  latitude text,
  longitude text,
  dispatch_radius_miles numeric,
  default_drive_minutes numeric,
  states_hiring_json jsonb default '[]'::jsonb,
  trade_ids_json jsonb default '[]'::jsonb,
  operating_license_summary_json text,
  founding_partner_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now(),
  service_area_json jsonb not null default '{}'::jsonb,
  hiring_roles_json jsonb not null default '[]'::jsonb,
  annual_hiring_volume integer check (annual_hiring_volume is null or annual_hiring_volume >= 0),
  hiring_horizon text,
  workforce_description text,
  profile_metadata jsonb not null default '{}'::jsonb,
  profile_version integer not null default 1,
  updated_by_user_id text references public.users(user_id) on delete set null
);

create table if not exists public.wf_role_memberships (
  id uuid primary key default gen_random_uuid(),
  membership_id text not null unique default security.new_legacy_id('WFR'),
  user_id text not null references public.users(user_id) on delete cascade,
  role text not null,
  institution_id text,
  contractor_id text references public.contractors(contractor_id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

create table if not exists public.wf_onboarding_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  user_id text not null unique references public.users(user_id) on delete cascade,
  selected_role text check (selected_role in ('student','educator','employer','admin')),
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','pending_review','complete','blocked','cancelled')),
  current_step integer not null default 1 check (current_step between 1 and 6),
  profile_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  employer_id text references public.contractors(contractor_id) on delete set null
);

create index if not exists wf_onboarding_accounts_status_idx
  on public.wf_onboarding_accounts(status, selected_role);
create index if not exists wf_onboarding_accounts_employer_idx
  on public.wf_onboarding_accounts(employer_id)
  where employer_id is not null;

create table if not exists public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  source text not null default 'supabase',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  employer_id text,
  institution_id text,
  student_id text,
  correlation_id uuid not null default gen_random_uuid(),
  result text not null default 'success'
    check (result in ('success','denied','failed')),
  before_json jsonb,
  after_json jsonb,
  event_type text generated always as (action) stored,
  target_type text generated always as (entity_type) stored,
  target_id text generated always as (entity_id) stored
);

create index if not exists platform_audit_events_event_created_idx
  on public.platform_audit_events(action, created_at desc);
create index if not exists platform_audit_events_employer_created_idx
  on public.platform_audit_events(employer_id, created_at desc)
  where employer_id is not null;

create table if not exists public.wf_hiring_needs (
  id uuid primary key default gen_random_uuid(),
  hiring_need_id text not null unique default ('HNE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  created_by_user_id text references public.users(user_id) on delete set null,
  assigned_recruiter_user_id text references public.users(user_id) on delete set null,
  assigned_hiring_manager_user_id text references public.users(user_id) on delete set null,
  title text not null,
  trade_id text,
  role_type text,
  target_hires integer not null default 1 check (target_hires > 0),
  target_hire_date date,
  service_area_json jsonb not null default '{}'::jsonb,
  work_types_json jsonb not null default '[]'::jsonb,
  shifts_json jsonb not null default '[]'::jsonb,
  program_eligibility_json jsonb not null default '[]'::jsonb,
  graduation_timing text,
  required_verified_skills_json jsonb not null default '[]'::jsonb,
  optional_verified_skills_json jsonb not null default '[]'::jsonb,
  minimum_verified_skill_count integer not null default 0 check (minimum_verified_skill_count >= 0),
  requires_drivers_license boolean not null default false,
  requires_driving_record_attestation boolean not null default false,
  requires_background_willingness boolean not null default false,
  requires_drug_screen_willingness boolean not null default false,
  shared_notes text,
  status text not null default 'draft' check (status in ('draft','active','paused','closed')),
  visibility text not null default 'employer_private' check (visibility in ('employer_private','institution_shared')),
  seed_key text unique,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_hiring_needs_employer_status_idx
  on public.wf_hiring_needs(employer_id, status, updated_at desc);
create index if not exists wf_hiring_needs_recruiter_idx
  on public.wf_hiring_needs(assigned_recruiter_user_id)
  where assigned_recruiter_user_id is not null;
create index if not exists wf_hiring_needs_hiring_manager_idx
  on public.wf_hiring_needs(assigned_hiring_manager_user_id)
  where assigned_hiring_manager_user_id is not null;

create table if not exists public.wf_domain_events (
  event_id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (btrim(event_type) <> ''),
  actor_auth_user_id uuid,
  actor_user_id text,
  target_type text not null,
  target_id text,
  employer_id text,
  institution_id text,
  student_id text,
  correlation_id uuid not null default gen_random_uuid(),
  result text not null default 'success' check (result in ('success','denied','failed')),
  before_json jsonb,
  after_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wf_domain_events_type_created_idx
  on public.wf_domain_events(event_type, created_at desc);
create index if not exists wf_domain_events_employer_created_idx
  on public.wf_domain_events(employer_id, created_at desc)
  where employer_id is not null;
create index if not exists wf_domain_events_target_idx
  on public.wf_domain_events(target_type, target_id, created_at desc);

create or replace function security.current_legacy_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id
  from public.users u
  where u.auth_user_id=(select auth.uid())
  order by u.created_at nulls last, u.user_id
  limit 1;
$$;

create or replace function security.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists(
    select 1
    from public.app_role_memberships r
    where r.auth_user_id=(select auth.uid())
      and lower(r.status)='active'
      and lower(r.role) in ('super_admin','admin','platform_admin')
  ), false);
$$;

create or replace function security.ensure_app_role_semantic(
  p_membership_key text,
  p_auth_user_id uuid,
  p_user_id text,
  p_role text,
  p_scope_type text,
  p_scope_id text,
  p_status text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope_id text := nullif(btrim(coalesce(p_scope_id,'')),'');
begin
  update public.app_role_memberships
  set auth_user_id=coalesce(p_auth_user_id,auth_user_id),
      status=coalesce(nullif(btrim(coalesce(p_status,'')),''),status),
      source=coalesce(nullif(btrim(coalesce(p_source,'')),''),source),
      updated_at=now()
  where user_id=p_user_id
    and role=p_role
    and scope_type=p_scope_type
    and coalesce(scope_id,'')=coalesce(v_scope_id,'');
  if found then return; end if;

  insert into public.app_role_memberships(
    membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source
  ) values(
    p_membership_key,p_auth_user_id,p_user_id,p_role,p_scope_type,v_scope_id,
    coalesce(nullif(btrim(coalesce(p_status,'')),''),'active'),
    coalesce(nullif(btrim(coalesce(p_source,'')),''),'foundation')
  ) on conflict do nothing;
end;
$$;

create or replace function security.member_of_employer(p_employer_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    security.is_admin()
    or exists (
      select 1 from public.contractors c
      where c.contractor_id=p_employer_id
        and c.owner_user_id=security.current_legacy_user_id()
    )
    or exists (
      select 1 from public.contractor_team_members tm
      where tm.contractor_id=p_employer_id
        and tm.user_id=security.current_legacy_user_id()
        and lower(coalesce(tm.status,'active'))='active'
    )
    or exists (
      select 1 from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and lower(r.role) in (
          'employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only',
          'contractor_owner','contractor_recruiter'
        )
        and lower(r.scope_type) in ('employer','contractor')
        and r.scope_id=p_employer_id
    ), false
  );
$$;

create or replace function security.has_employer_role(p_employer_id text,p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    security.is_admin()
    or exists (
      select 1 from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and lower(r.scope_type) in ('employer','contractor')
        and r.scope_id=p_employer_id
        and (
          lower(r.role)=any(select lower(x) from unnest(p_roles) x)
          or (lower(r.role)='contractor_owner' and 'employer_owner'=any(select lower(x) from unnest(p_roles) x))
          or (lower(r.role)='contractor_recruiter' and 'recruiter'=any(select lower(x) from unnest(p_roles) x))
        )
    )
    or (
      'employer_owner'=any(select lower(x) from unnest(p_roles) x)
      and exists (
        select 1 from public.contractors c
        where c.contractor_id=p_employer_id
          and c.owner_user_id=security.current_legacy_user_id()
      )
    ), false
  );
$$;

create or replace function security.owns_contractor(p_contractor_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select security.member_of_employer(p_contractor_id); $$;

create or replace function security.employer_is_approved(p_employer_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists(
    select 1 from public.contractors c
    where c.contractor_id=p_employer_id
      and lower(coalesce(c.approval_status,''))='approved'
      and lower(coalesce(c.account_status,'active'))='active'
  ), false);
$$;

create or replace function security.protect_employer_approval_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') or security.is_admin() then
    return new;
  end if;
  if tg_table_name='contractors' then
    if new.approval_status is distinct from old.approval_status
       or new.account_status is distinct from old.account_status then
      raise exception 'Employer approval/account status is TXKPRO-controlled';
    end if;
  elsif tg_table_name='wf_contractor_profiles' then
    if new.workforce_status is distinct from old.workforce_status then
      raise exception 'Workforce approval status is TXKPRO-controlled';
    end if;
  end if;
  return new;
end;
$$;

create or replace function security.sync_wf_role_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid;
  v_scope_type text;
  v_scope_id text;
  v_canonical_role text;
begin
  select u.auth_user_id into v_auth
  from public.users u where u.user_id=new.user_id limit 1;

  v_scope_type:=case
    when nullif(trim(coalesce(new.institution_id,'')),'') is not null then 'institution'
    when nullif(trim(coalesce(new.contractor_id,'')),'') is not null
      and lower(coalesce(new.role,'')) in ('employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only')
      then 'employer'
    when nullif(trim(coalesce(new.contractor_id,'')),'') is not null then 'contractor'
    else 'workforce'
  end;
  v_scope_id:=coalesce(nullif(trim(coalesce(new.institution_id,'')),''),nullif(trim(coalesce(new.contractor_id,'')),''));

  perform security.ensure_app_role_semantic(
    'WFROLE:'||new.membership_id,v_auth,new.user_id,new.role,v_scope_type,v_scope_id,
    coalesce(nullif(trim(coalesce(new.status,'')),''),'active'),'wf_role_memberships'
  );

  v_canonical_role:=case lower(coalesce(new.role,''))
    when 'contractor_owner' then 'employer_owner'
    when 'contractor_recruiter' then 'recruiter'
    else null
  end;
  if v_canonical_role is not null and nullif(trim(coalesce(new.contractor_id,'')),'') is not null then
    perform security.ensure_app_role_semantic(
      'WFROLECANON:'||new.membership_id,v_auth,new.user_id,v_canonical_role,'employer',new.contractor_id,
      coalesce(nullif(trim(coalesce(new.status,'')),''),'active'),'wf_role_memberships_canonical_bridge'
    );
  end if;
  return new;
end;
$$;

create or replace function security.sync_employer_onboarding_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employer_id text;
  v_approval_status text;
begin
  if lower(coalesce(new.selected_role,''))<>'employer' or new.user_id is null then return new; end if;

  select c.contractor_id,lower(coalesce(c.approval_status,'pending'))
    into v_employer_id,v_approval_status
  from public.contractors c
  where c.owner_user_id=new.user_id
  order by c.created_at desc nulls last,c.contractor_id
  limit 1;

  if v_employer_id is not null then
    new.employer_id:=coalesce(new.employer_id,v_employer_id);
    if new.status='complete' and v_approval_status<>'approved' then
      new.status:='pending_review'; new.completed_at:=null;
    elsif new.status='pending_review' and v_approval_status='approved' then
      new.status:='complete'; new.completed_at:=coalesce(new.completed_at,now());
    end if;
  end if;
  return new;
end;
$$;

create or replace function security.touch_wf_hiring_need()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at:=now();
  if tg_op='UPDATE' then new.version:=old.version+1; end if;
  return new;
end;
$$;

create or replace function security.prevent_wf_domain_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$ begin raise exception 'wf_domain_events is append-only'; end; $$;

create or replace function security.emit_workforce_event(
  p_event_type text,p_target_type text,p_target_id text default null,
  p_employer_id text default null,p_institution_id text default null,p_student_id text default null,
  p_before jsonb default null,p_after jsonb default null,p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success',p_event_key text default null,p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_correlation_id uuid:=coalesce(p_correlation_id,gen_random_uuid());
  v_event_key text:=coalesce(nullif(btrim(coalesce(p_event_key,'')),''),gen_random_uuid()::text);
begin
  insert into public.wf_domain_events(
    event_key,event_type,actor_auth_user_id,actor_user_id,target_type,target_id,
    employer_id,institution_id,student_id,correlation_id,result,before_json,after_json,metadata
  ) values(
    v_event_key,p_event_type,(select auth.uid()),security.current_legacy_user_id(),p_target_type,p_target_id,
    p_employer_id,p_institution_id,p_student_id,v_correlation_id,p_result,p_before,p_after,coalesce(p_metadata,'{}'::jsonb)
  ) returning event_id into v_event_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata,
    employer_id,institution_id,student_id,correlation_id,result,before_json,after_json
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),p_event_type,p_target_type,p_target_id,
    'workforce-domain-event',coalesce(p_metadata,'{}'::jsonb),
    p_employer_id,p_institution_id,p_student_id,v_correlation_id,p_result,p_before,p_after
  );
  return v_event_id;
end;
$$;

create or replace function security.emit_hiring_need_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_type text;
begin
  if tg_op='INSERT' then v_type:='HIRING_NEED_CREATED';
  elsif new.status is distinct from old.status then v_type:='HIRING_NEED_STATUS_CHANGED';
  else v_type:='HIRING_NEED_UPDATED';
  end if;

  perform security.emit_workforce_event(
    v_type,'hiring_need',new.hiring_need_id,new.employer_id,null,null,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),
    jsonb_build_object('table','wf_hiring_needs','version',new.version),
    'success','hiring_need:'||new.hiring_need_id||':'||new.version::text||':'||v_type,null
  );
  return new;
end;
$$;

create or replace function security.emit_employer_approval_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.approval_status,''))='approved'
     and lower(coalesce(old.approval_status,''))<>'approved'
     and exists(select 1 from public.wf_contractor_profiles p where p.contractor_id=new.contractor_id) then
    update public.wf_onboarding_accounts
    set status='complete',current_step=6,completed_at=coalesce(completed_at,now()),updated_at=now()
    where employer_id=new.contractor_id and selected_role='employer' and status in ('pending_review','in_progress');

    perform security.emit_workforce_event(
      'EMPLOYER_APPROVED','employer',new.contractor_id,new.contractor_id,null,null,
      jsonb_build_object('approval_status',old.approval_status),
      jsonb_build_object('approval_status',new.approval_status),
      jsonb_build_object('onboarding_completed',true),'success',
      'employer_approved:'||new.contractor_id||':'||coalesce(new.updated_at::text,now()::text),null
    );
  end if;
  return new;
end;
$$;

create or replace function public.wf_emit_event(
  p_event_type text,p_target_type text,p_target_id text default null,
  p_employer_id text default null,p_institution_id text default null,p_student_id text default null,
  p_before jsonb default null,p_after jsonb default null,p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success',p_event_key text default null,p_correlation_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select security.emit_workforce_event(
    p_event_type,p_target_type,p_target_id,p_employer_id,p_institution_id,p_student_id,
    p_before,p_after,p_metadata,p_result,p_event_key,p_correlation_id
  );
$$;

create or replace function security.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_first text;
  v_last text;
  v_email text;
begin
  if new.email is null then return new; end if;
  v_email:=lower(btrim(new.email::text));

  select u.user_id into v_user_id
  from public.users u
  where lower(btrim(coalesce(u.email,'')))=v_email
  limit 1;

  if v_user_id is null then
    v_user_id:=security.new_legacy_id('USR');
    v_first:=coalesce(new.raw_user_meta_data->>'first_name',new.raw_user_meta_data->>'firstName','');
    v_last:=coalesce(new.raw_user_meta_data->>'last_name',new.raw_user_meta_data->>'lastName','');
    insert into public.users(user_id,role,email,first_name,last_name,status,auth_user_id)
    values(v_user_id,'user',new.email,v_first,v_last,'active',new.id);
  else
    update public.users set auth_user_id=new.id,updated_at=now() where user_id=v_user_id;
  end if;

  update public.app_role_memberships
  set auth_user_id=new.id,updated_at=now()
  where user_id=v_user_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_txkpro on auth.users;
create trigger on_auth_user_created_txkpro
after insert on auth.users
for each row execute function security.handle_auth_user_created();

drop trigger if exists trg_wf_roles_sync_app_roles on public.wf_role_memberships;
create trigger trg_wf_roles_sync_app_roles
after insert or update on public.wf_role_memberships
for each row execute function security.sync_wf_role_membership();

drop trigger if exists wf_onboarding_accounts_sync_employer_link on public.wf_onboarding_accounts;
create trigger wf_onboarding_accounts_sync_employer_link
before insert or update of selected_role,user_id,status,employer_id
on public.wf_onboarding_accounts
for each row execute function security.sync_employer_onboarding_link();

drop trigger if exists contractors_protect_employer_approval on public.contractors;
create trigger contractors_protect_employer_approval
before update of approval_status,account_status on public.contractors
for each row execute function security.protect_employer_approval_fields();

drop trigger if exists wf_contractor_profiles_protect_status on public.wf_contractor_profiles;
create trigger wf_contractor_profiles_protect_status
before update of workforce_status on public.wf_contractor_profiles
for each row execute function security.protect_employer_approval_fields();

drop trigger if exists contractors_emit_employer_approval on public.contractors;
create trigger contractors_emit_employer_approval
after update of approval_status on public.contractors
for each row execute function security.emit_employer_approval_event();

drop trigger if exists wf_hiring_needs_touch on public.wf_hiring_needs;
create trigger wf_hiring_needs_touch
before update on public.wf_hiring_needs
for each row execute function security.touch_wf_hiring_need();

drop trigger if exists wf_hiring_needs_emit_event on public.wf_hiring_needs;
create trigger wf_hiring_needs_emit_event
after insert or update on public.wf_hiring_needs
for each row execute function security.emit_hiring_need_event();

drop trigger if exists wf_domain_events_immutable on public.wf_domain_events;
create trigger wf_domain_events_immutable
before update or delete on public.wf_domain_events
for each row execute function security.prevent_wf_domain_event_mutation();

alter table public.users enable row level security;
alter table public.app_role_memberships enable row level security;
alter table public.contractors enable row level security;
alter table public.contractor_team_members enable row level security;
alter table public.wf_contractor_profiles enable row level security;
alter table public.wf_role_memberships enable row level security;
alter table public.wf_onboarding_accounts enable row level security;
alter table public.platform_audit_events enable row level security;
alter table public.wf_hiring_needs enable row level security;
alter table public.wf_domain_events enable row level security;

create policy users_read_self_or_admin on public.users
for select to authenticated
using (auth_user_id=(select auth.uid()) or security.is_admin());

create policy memberships_read_self_or_admin on public.app_role_memberships
for select to authenticated
using (auth_user_id=(select auth.uid()) or security.is_admin());

create policy contractors_read_member_or_admin on public.contractors
for select to authenticated
using (security.member_of_employer(contractor_id));

create policy contractors_employer_insert on public.contractors
for insert to authenticated
with check (
  owner_user_id=security.current_legacy_user_id()
  and lower(coalesce(approval_status,'pending'))='pending'
  and lower(coalesce(account_status,'active'))='active'
);

create policy contractors_employer_update on public.contractors
for update to authenticated
using (security.has_employer_role(contractor_id,array['employer_owner','employer_admin']))
with check (security.has_employer_role(contractor_id,array['employer_owner','employer_admin']));

create policy team_members_read_employer on public.contractor_team_members
for select to authenticated
using (security.member_of_employer(contractor_id));

create policy profiles_read_employer on public.wf_contractor_profiles
for select to authenticated
using (security.member_of_employer(contractor_id));

create policy profiles_employer_insert on public.wf_contractor_profiles
for insert to authenticated
with check (security.owns_contractor(contractor_id));

create policy profiles_employer_update on public.wf_contractor_profiles
for update to authenticated
using (security.has_employer_role(contractor_id,array['employer_owner','employer_admin']))
with check (security.has_employer_role(contractor_id,array['employer_owner','employer_admin']));

create policy wf_roles_read_self_or_admin on public.wf_role_memberships
for select to authenticated
using (
  user_id=security.current_legacy_user_id()
  or security.is_admin()
  or (contractor_id is not null and security.member_of_employer(contractor_id))
);

create policy wf_onboarding_read_self_or_admin on public.wf_onboarding_accounts
for select to authenticated
using (auth_user_id=(select auth.uid()) or security.is_admin());

create policy audit_admin_read on public.platform_audit_events
for select to authenticated
using (security.is_admin());

create policy wf_hiring_needs_employer_read on public.wf_hiring_needs
for select to authenticated
using (security.member_of_employer(employer_id));

create policy wf_hiring_needs_employer_insert on public.wf_hiring_needs
for insert to authenticated
with check (
  security.employer_is_approved(employer_id)
  and security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter'])
  and (created_by_user_id is null or created_by_user_id=security.current_legacy_user_id())
);

create policy wf_hiring_needs_employer_update on public.wf_hiring_needs
for update to authenticated
using (
  security.employer_is_approved(employer_id)
  and (
    security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter'])
    or (
      security.has_employer_role(employer_id,array['hiring_manager'])
      and assigned_hiring_manager_user_id=security.current_legacy_user_id()
    )
  )
)
with check (
  security.employer_is_approved(employer_id)
  and (
    security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter'])
    or (
      security.has_employer_role(employer_id,array['hiring_manager'])
      and assigned_hiring_manager_user_id=security.current_legacy_user_id()
    )
  )
);

create policy wf_hiring_needs_employer_delete on public.wf_hiring_needs
for delete to authenticated
using (
  security.employer_is_approved(employer_id)
  and security.has_employer_role(employer_id,array['employer_owner','employer_admin'])
);

create policy wf_domain_events_admin_read on public.wf_domain_events
for select to authenticated
using (security.is_admin());

grant select on public.users,public.app_role_memberships,public.contractors,
  public.contractor_team_members,public.wf_contractor_profiles,public.wf_role_memberships,
  public.wf_onboarding_accounts,public.platform_audit_events,public.wf_hiring_needs,
  public.wf_domain_events to authenticated;

grant insert,update on public.contractors,public.wf_contractor_profiles to authenticated;
grant select,insert,update,delete on public.wf_hiring_needs to authenticated;

revoke all on function public.wf_emit_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) from public,anon,authenticated;
grant execute on function public.wf_emit_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) to service_role;

revoke all on function security.emit_workforce_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) from public,anon,authenticated;
grant execute on function security.emit_workforce_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) to service_role;

grant execute on function security.current_legacy_user_id() to authenticated,service_role;
grant execute on function security.is_admin() to authenticated,service_role;
grant execute on function security.member_of_employer(text) to authenticated,service_role;
grant execute on function security.has_employer_role(text,text[]) to authenticated,service_role;
grant execute on function security.owns_contractor(text) to authenticated,service_role;
grant execute on function security.employer_is_approved(text) to authenticated,service_role;
