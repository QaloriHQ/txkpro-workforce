-- TXKPRO Workforce — Wave 7 Production Integration
-- Employer foundation: schema reconciliation, canonical membership helpers,
-- RLS, persistent Employer profile/Hiring Needs, domain events, audit fields,
-- and safe draft seed data for the existing Acme Company demo tenant.

-- 43 / 46: reconcile onboarding with the canonical status dictionary.
alter table public.wf_onboarding_accounts
  drop constraint if exists wf_onboarding_accounts_status_check;

alter table public.wf_onboarding_accounts
  add constraint wf_onboarding_accounts_status_check
  check (status in ('not_started','in_progress','pending_review','complete','blocked','cancelled'));

alter table public.wf_onboarding_accounts
  add column if not exists employer_id text references public.contractors(contractor_id) on delete set null;

create index if not exists wf_onboarding_accounts_employer_idx
  on public.wf_onboarding_accounts(employer_id)
  where employer_id is not null;

-- 47: extend the existing Workforce contractor profile instead of creating
-- a competing Employer profile system of record.
alter table public.wf_contractor_profiles
  add column if not exists service_area_json jsonb not null default '{}'::jsonb,
  add column if not exists hiring_roles_json jsonb not null default '[]'::jsonb,
  add column if not exists annual_hiring_volume integer,
  add column if not exists hiring_horizon text,
  add column if not exists workforce_description text,
  add column if not exists profile_metadata jsonb not null default '{}'::jsonb,
  add column if not exists profile_version integer not null default 1,
  add column if not exists updated_by_user_id text references public.users(user_id) on delete set null;

alter table public.wf_contractor_profiles
  drop constraint if exists wf_contractor_profiles_annual_hiring_volume_check;

alter table public.wf_contractor_profiles
  add constraint wf_contractor_profiles_annual_hiring_volume_check
  check (annual_hiring_volume is null or annual_hiring_volume >= 0);

create index if not exists wf_contractor_profiles_contractor_idx
  on public.wf_contractor_profiles(contractor_id);

create index if not exists app_role_memberships_auth_scope_idx
  on public.app_role_memberships(auth_user_id, status, role, scope_type, scope_id);

-- 44 / 45: canonical Employer membership resolution.
create or replace function security.current_employer_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select r.scope_id
      from public.app_role_memberships r
      where r.auth_user_id = (select auth.uid())
        and lower(r.status) = 'active'
        and lower(r.role) in (
          'employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only',
          'contractor_owner','contractor_recruiter'
        )
        and lower(r.scope_type) in ('employer','contractor')
        and nullif(btrim(coalesce(r.scope_id,'')),'') is not null
      order by
        case lower(r.role)
          when 'employer_owner' then 1
          when 'contractor_owner' then 2
          when 'employer_admin' then 3
          when 'recruiter' then 4
          when 'contractor_recruiter' then 5
          when 'hiring_manager' then 6
          when 'employer_read_only' then 7
          else 99
        end,
        r.created_at
      limit 1
    ),
    (
      select c.contractor_id
      from public.contractors c
      where c.owner_user_id = security.current_legacy_user_id()
      order by c.created_at nulls last, c.contractor_id
      limit 1
    )
  );
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
      select 1
      from public.contractors c
      where c.contractor_id = p_employer_id
        and c.owner_user_id = security.current_legacy_user_id()
    )
    or exists (
      select 1
      from public.contractor_team_members tm
      where tm.contractor_id = p_employer_id
        and tm.user_id = security.current_legacy_user_id()
        and lower(coalesce(tm.status,'active')) = 'active'
    )
    or exists (
      select 1
      from public.app_role_memberships r
      where r.auth_user_id = (select auth.uid())
        and lower(r.status) = 'active'
        and lower(r.role) in (
          'employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only',
          'contractor_owner','contractor_recruiter'
        )
        and lower(r.scope_type) in ('employer','contractor')
        and r.scope_id = p_employer_id
    ),
    false
  );
$$;

create or replace function security.has_employer_role(
  p_employer_id text,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    security.is_admin()
    or exists (
      select 1
      from public.app_role_memberships r
      where r.auth_user_id = (select auth.uid())
        and lower(r.status) = 'active'
        and lower(r.scope_type) in ('employer','contractor')
        and r.scope_id = p_employer_id
        and (
          lower(r.role) = any (select lower(x) from unnest(p_roles) x)
          or (lower(r.role) = 'contractor_owner' and 'employer_owner' = any (select lower(x) from unnest(p_roles) x))
          or (lower(r.role) = 'contractor_recruiter' and 'recruiter' = any (select lower(x) from unnest(p_roles) x))
        )
    )
    or (
      'employer_owner' = any (select lower(x) from unnest(p_roles) x)
      and exists (
        select 1 from public.contractors c
        where c.contractor_id = p_employer_id
          and c.owner_user_id = security.current_legacy_user_id()
      )
    ),
    false
  );
$$;

create or replace function security.owns_contractor(p_contractor_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.member_of_employer(p_contractor_id);
$$;

revoke all on function security.current_employer_id() from public;
revoke all on function security.member_of_employer(text) from public;
revoke all on function security.has_employer_role(text,text[]) from public;
grant execute on function security.current_employer_id() to authenticated, service_role;
grant execute on function security.member_of_employer(text) to authenticated, service_role;
grant execute on function security.has_employer_role(text,text[]) to authenticated, service_role;

-- Preserve legacy role rows while adding canonical Employer aliases.
insert into public.app_role_memberships(
  membership_key, auth_user_id, user_id, role, scope_type, scope_id, status, source
)
select
  'wave7:canonical:' || r.id::text,
  r.auth_user_id,
  r.user_id,
  case lower(r.role)
    when 'contractor_owner' then 'employer_owner'
    when 'contractor_recruiter' then 'recruiter'
  end,
  'employer',
  r.scope_id,
  r.status,
  'wave7_role_alias'
from public.app_role_memberships r
where lower(r.role) in ('contractor_owner','contractor_recruiter')
  and lower(r.status) = 'active'
  and nullif(btrim(coalesce(r.scope_id,'')),'') is not null
  and not exists (
    select 1
    from public.app_role_memberships x
    where x.user_id = r.user_id
      and lower(x.role) = case lower(r.role)
        when 'contractor_owner' then 'employer_owner'
        when 'contractor_recruiter' then 'recruiter'
      end
      and lower(x.scope_type) = 'employer'
      and x.scope_id = r.scope_id
  )
on conflict do nothing;

-- Keep Workforce role -> shared app membership synchronization semantic and idempotent.
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
begin
  select u.auth_user_id
  into v_auth
  from public.users u
  where u.user_id::text = new.user_id::text
  limit 1;

  v_scope_type :=
    case
      when nullif(trim(new.institution_id::text),'') is not null then 'institution'
      when nullif(trim(new.contractor_id::text),'') is not null
        and lower(coalesce(new.role,'')) in ('employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only')
        then 'employer'
      when nullif(trim(new.contractor_id::text),'') is not null then 'contractor'
      else 'workforce'
    end;

  v_scope_id := coalesce(
    nullif(trim(new.institution_id::text),''),
    nullif(trim(new.contractor_id::text),'')
  );

  perform security.ensure_app_role_semantic(
    'WFROLE:' || new.membership_id::text,
    v_auth,
    new.user_id::text,
    new.role::text,
    v_scope_type,
    v_scope_id,
    coalesce(nullif(trim(new.status::text),''),'active'),
    'wf_role_memberships'
  );

  return new;
end;
$$;

-- Approval fields stay TXKPRO-controlled even when Employer profile fields are editable.
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

  if tg_table_name = 'contractors' then
    if new.approval_status is distinct from old.approval_status
       or new.account_status is distinct from old.account_status then
      raise exception 'Employer approval/account status is TXKPRO-controlled';
    end if;
  elsif tg_table_name = 'wf_contractor_profiles' then
    if new.workforce_status is distinct from old.workforce_status then
      raise exception 'Workforce approval status is TXKPRO-controlled';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists contractors_protect_employer_approval on public.contractors;
create trigger contractors_protect_employer_approval
before update of approval_status, account_status on public.contractors
for each row execute function security.protect_employer_approval_fields();

drop trigger if exists wf_contractor_profiles_protect_status on public.wf_contractor_profiles;
create trigger wf_contractor_profiles_protect_status
before update of workforce_status on public.wf_contractor_profiles
for each row execute function security.protect_employer_approval_fields();

-- Company Profile RLS. Recruiter/Hiring Manager/Read-Only may read but not edit.
drop policy if exists contractors_employer_insert on public.contractors;
create policy contractors_employer_insert
on public.contractors
for insert
to authenticated
with check (
  owner_user_id = security.current_legacy_user_id()
  and lower(coalesce(approval_status,'pending')) = 'pending'
  and lower(coalesce(account_status,'active')) = 'active'
);

drop policy if exists contractors_employer_update on public.contractors;
create policy contractors_employer_update
on public.contractors
for update
to authenticated
using (
  security.has_employer_role(contractor_id, array['employer_owner','employer_admin'])
)
with check (
  security.has_employer_role(contractor_id, array['employer_owner','employer_admin'])
);

drop policy if exists wf_contractor_profiles_employer_insert on public.wf_contractor_profiles;
create policy wf_contractor_profiles_employer_insert
on public.wf_contractor_profiles
for insert
to authenticated
with check (security.owns_contractor(contractor_id));

drop policy if exists wf_contractor_profiles_employer_update on public.wf_contractor_profiles;
create policy wf_contractor_profiles_employer_update
on public.wf_contractor_profiles
for update
to authenticated
using (
  security.has_employer_role(contractor_id, array['employer_owner','employer_admin'])
)
with check (
  security.has_employer_role(contractor_id, array['employer_owner','employer_admin'])
);

grant select, insert, update on public.contractors to authenticated;
grant select, insert, update on public.wf_contractor_profiles to authenticated;

-- 48: canonical Hiring Needs. This is structured Employer demand, not a public job board.
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

comment on table public.wf_hiring_needs is
  'Canonical Employer Hiring Needs: structured demand/filter criteria, not a public job board or ATS job posting.';

create index if not exists wf_hiring_needs_employer_status_idx
  on public.wf_hiring_needs(employer_id, status, updated_at desc);

create index if not exists wf_hiring_needs_recruiter_idx
  on public.wf_hiring_needs(assigned_recruiter_user_id)
  where assigned_recruiter_user_id is not null;

create index if not exists wf_hiring_needs_hiring_manager_idx
  on public.wf_hiring_needs(assigned_hiring_manager_user_id)
  where assigned_hiring_manager_user_id is not null;

alter table public.wf_hiring_needs enable row level security;

drop policy if exists wf_hiring_needs_employer_read on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_read
on public.wf_hiring_needs
for select
to authenticated
using (security.member_of_employer(employer_id));

drop policy if exists wf_hiring_needs_employer_insert on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_insert
on public.wf_hiring_needs
for insert
to authenticated
with check (
  security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
  and (
    created_by_user_id is null
    or created_by_user_id = security.current_legacy_user_id()
  )
);

drop policy if exists wf_hiring_needs_employer_update on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_update
on public.wf_hiring_needs
for update
to authenticated
using (
  security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
  or (
    security.has_employer_role(employer_id, array['hiring_manager'])
    and assigned_hiring_manager_user_id = security.current_legacy_user_id()
  )
)
with check (
  security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
  or (
    security.has_employer_role(employer_id, array['hiring_manager'])
    and assigned_hiring_manager_user_id = security.current_legacy_user_id()
  )
);

drop policy if exists wf_hiring_needs_employer_delete on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_delete
on public.wf_hiring_needs
for delete
to authenticated
using (
  security.has_employer_role(employer_id, array['employer_owner','employer_admin'])
);

grant select, insert, update, delete on public.wf_hiring_needs to authenticated;

create or replace function security.touch_wf_hiring_need()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists wf_hiring_needs_touch on public.wf_hiring_needs;
create trigger wf_hiring_needs_touch
before update on public.wf_hiring_needs
for each row execute function security.touch_wf_hiring_need();

-- 49 / 50: shared append-only event infrastructure + enriched audit fields.
alter table public.platform_audit_events
  add column if not exists employer_id text,
  add column if not exists institution_id text,
  add column if not exists student_id text,
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists result text not null default 'success',
  add column if not exists before_json jsonb,
  add column if not exists after_json jsonb;

alter table public.platform_audit_events
  drop constraint if exists platform_audit_events_result_check;

alter table public.platform_audit_events
  add constraint platform_audit_events_result_check
  check (result in ('success','denied','failed'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='platform_audit_events' and column_name='event_type'
  ) then
    alter table public.platform_audit_events
      add column event_type text generated always as (action) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='platform_audit_events' and column_name='target_type'
  ) then
    alter table public.platform_audit_events
      add column target_type text generated always as (entity_type) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='platform_audit_events' and column_name='target_id'
  ) then
    alter table public.platform_audit_events
      add column target_id text generated always as (entity_id) stored;
  end if;
end
$$;

create index if not exists platform_audit_events_event_created_idx
  on public.platform_audit_events(action, created_at desc);

create index if not exists platform_audit_events_employer_created_idx
  on public.platform_audit_events(employer_id, created_at desc)
  where employer_id is not null;

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

comment on table public.wf_domain_events is
  'Append-only shared Workforce domain-event stream. Notifications are consequences of these/domain records, never competing state.';

create index if not exists wf_domain_events_type_created_idx
  on public.wf_domain_events(event_type, created_at desc);

create index if not exists wf_domain_events_employer_created_idx
  on public.wf_domain_events(employer_id, created_at desc)
  where employer_id is not null;

create index if not exists wf_domain_events_target_idx
  on public.wf_domain_events(target_type, target_id, created_at desc);

alter table public.wf_domain_events enable row level security;

drop policy if exists wf_domain_events_admin_read on public.wf_domain_events;
create policy wf_domain_events_admin_read
on public.wf_domain_events
for select
to authenticated
using (security.is_admin());

grant select on public.wf_domain_events to authenticated;

create or replace function security.prevent_wf_domain_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'wf_domain_events is append-only';
end;
$$;

drop trigger if exists wf_domain_events_immutable on public.wf_domain_events;
create trigger wf_domain_events_immutable
before update or delete on public.wf_domain_events
for each row execute function security.prevent_wf_domain_event_mutation();

create or replace function security.emit_workforce_event(
  p_event_type text,
  p_target_type text,
  p_target_id text default null,
  p_employer_id text default null,
  p_institution_id text default null,
  p_student_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success',
  p_event_key text default null,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_correlation_id uuid := coalesce(p_correlation_id, gen_random_uuid());
  v_event_key text := coalesce(nullif(btrim(coalesce(p_event_key,'')),''), gen_random_uuid()::text);
begin
  if nullif(btrim(coalesce(p_event_type,'')),'') is null then
    raise exception 'event_type is required';
  end if;
  if nullif(btrim(coalesce(p_target_type,'')),'') is null then
    raise exception 'target_type is required';
  end if;
  if p_result not in ('success','denied','failed') then
    raise exception 'invalid event result';
  end if;

  insert into public.wf_domain_events(
    event_key, event_type,
    actor_auth_user_id, actor_user_id,
    target_type, target_id,
    employer_id, institution_id, student_id,
    correlation_id, result,
    before_json, after_json, metadata
  ) values (
    v_event_key, p_event_type,
    (select auth.uid()), security.current_legacy_user_id(),
    p_target_type, p_target_id,
    p_employer_id, p_institution_id, p_student_id,
    v_correlation_id, p_result,
    p_before, p_after, coalesce(p_metadata,'{}'::jsonb)
  )
  returning event_id into v_event_id;

  insert into public.platform_audit_events(
    actor_auth_user_id, actor_user_id,
    action, entity_type, entity_id,
    source, metadata,
    employer_id, institution_id, student_id,
    correlation_id, result, before_json, after_json
  ) values (
    (select auth.uid()), security.current_legacy_user_id(),
    p_event_type, p_target_type, p_target_id,
    'workforce-domain-event', coalesce(p_metadata,'{}'::jsonb),
    p_employer_id, p_institution_id, p_student_id,
    v_correlation_id, p_result, p_before, p_after
  );

  return v_event_id;
end;
$$;

revoke all on function security.emit_workforce_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) from public, anon, authenticated;
grant execute on function security.emit_workforce_event(
  text,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,uuid
) to service_role;

create or replace function security.emit_hiring_need_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'HIRING_NEED_CREATED';
  elsif new.status is distinct from old.status then
    v_type := 'HIRING_NEED_STATUS_CHANGED';
  else
    v_type := 'HIRING_NEED_UPDATED';
  end if;

  perform security.emit_workforce_event(
    v_type,
    'hiring_need',
    new.hiring_need_id,
    new.employer_id,
    null,
    null,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    jsonb_build_object('table','wf_hiring_needs','version',new.version),
    'success',
    'hiring_need:' || new.hiring_need_id || ':' || new.version::text || ':' || v_type,
    null
  );

  return new;
end;
$$;

drop trigger if exists wf_hiring_needs_emit_event on public.wf_hiring_needs;
create trigger wf_hiring_needs_emit_event
after insert or update on public.wf_hiring_needs
for each row execute function security.emit_hiring_need_event();

create or replace function security.emit_employer_approval_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.approval_status,'')) = 'approved'
     and lower(coalesce(old.approval_status,'')) <> 'approved'
     and exists (
       select 1 from public.wf_contractor_profiles p
       where p.contractor_id = new.contractor_id
     ) then
    perform security.emit_workforce_event(
      'EMPLOYER_APPROVED',
      'employer',
      new.contractor_id,
      new.contractor_id,
      null,
      null,
      jsonb_build_object('approval_status', old.approval_status),
      jsonb_build_object('approval_status', new.approval_status),
      '{}'::jsonb,
      'success',
      'employer_approved:' || new.contractor_id || ':' || coalesce(new.updated_at::text,now()::text),
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists contractors_emit_employer_approval on public.contractors;
create trigger contractors_emit_employer_approval
after update of approval_status on public.contractors
for each row execute function security.emit_employer_approval_event();

-- Keep the existing audit helper compatible while populating canonical fields.
create or replace function security.audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
begin
  insert into public.platform_audit_events(
    actor_auth_user_id, actor_user_id,
    action, entity_type, entity_id, metadata,
    employer_id, institution_id, student_id,
    result, before_json, after_json
  ) values (
    (select auth.uid()), security.current_legacy_user_id(),
    p_action, p_entity_type, p_entity_id, v_metadata,
    nullif(v_metadata->>'employer_id',''),
    nullif(v_metadata->>'institution_id',''),
    nullif(v_metadata->>'student_id',''),
    coalesce(nullif(v_metadata->>'result',''),'success'),
    v_metadata->'before',
    v_metadata->'after'
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- 52: safe production seed data in the clearly synthetic Acme Company tenant.
-- Draft-only records create no public opportunity or automated hiring action.
insert into public.wf_hiring_needs(
  employer_id, created_by_user_id, title, trade_id, role_type,
  target_hires, target_hire_date, service_area_json,
  work_types_json, shifts_json,
  required_verified_skills_json, optional_verified_skills_json,
  minimum_verified_skill_count,
  requires_drivers_license, requires_driving_record_attestation,
  requires_background_willingness, requires_drug_screen_willingness,
  shared_notes, status, visibility, seed_key
)
select
  c.contractor_id,
  c.owner_user_id,
  seed.title,
  seed.trade_id,
  seed.role_type,
  seed.target_hires,
  seed.target_hire_date,
  seed.service_area_json,
  seed.work_types_json,
  seed.shifts_json,
  seed.required_skills,
  seed.optional_skills,
  seed.minimum_skill_count,
  seed.requires_license,
  seed.requires_driving_attestation,
  seed.requires_background,
  seed.requires_drug,
  seed.shared_notes,
  'draft',
  'employer_private',
  seed.seed_key
from public.contractors c
cross join (
  values
    (
      'Residential Service Technician',
      'electrical',
      'technician',
      3,
      current_date + 60,
      '{"cities":["Texarkana"],"radius_miles":45}'::jsonb,
      '["Full-time"]'::jsonb,
      '["Day"]'::jsonb,
      '["Residential Troubleshooting","Electrical Safety"]'::jsonb,
      '["Customer Service"]'::jsonb,
      2,
      true,true,true,true,
      'Wave 7 seed: explicit Employer demand criteria for end-to-end production smoke testing.',
      'wave7_acme_residential_service_technician'
    ),
    (
      'Commercial Electrical Apprentice',
      'electrical',
      'apprentice',
      2,
      current_date + 90,
      '{"cities":["Texarkana"],"radius_miles":60}'::jsonb,
      '["Full-time","Apprenticeship"]'::jsonb,
      '["Day"]'::jsonb,
      '["Electrical Safety"]'::jsonb,
      '["Commercial Construction"]'::jsonb,
      1,
      true,false,true,true,
      'Wave 7 seed: draft Hiring Need used to verify repository, RLS, event, and audit plumbing.',
      'wave7_acme_commercial_electrical_apprentice'
    )
) as seed(
  title,trade_id,role_type,target_hires,target_hire_date,service_area_json,
  work_types_json,shifts_json,required_skills,optional_skills,minimum_skill_count,
  requires_license,requires_driving_attestation,requires_background,requires_drug,
  shared_notes,seed_key
)
where lower(coalesce(c.business_name,'')) = 'acme company'
on conflict (seed_key) do nothing;
