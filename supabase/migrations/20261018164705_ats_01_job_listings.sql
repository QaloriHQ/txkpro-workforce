-- ATS-01 / #332: employer-owned job listing drafts. Post-MVP and staging only.
-- Created using Supabase CLI: supabase migration new ats_01_job_listings
-- This deliberately does NOT publish jobs until ATS-02 provides immutable pipeline versions.
-- Do not conflate Job Listings with existing wf_hiring_needs.

create table if not exists public.wf_ats_job_listings (
  id uuid primary key default gen_random_uuid(),
  job_listing_id text not null unique default ('JOB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  employer_id text not null references public.contractors(contractor_id),
  created_by_user_id text references public.users(user_id) on delete set null,
  assigned_hiring_manager_user_id text references public.users(user_id) on delete set null,
  hiring_need_id text references public.wf_hiring_needs(hiring_need_id) on delete set null,
  source_job_listing_id uuid references public.wf_ats_job_listings(id) on delete set null,
  is_template boolean not null default false,
  title text not null default '',
  summary text not null default '',
  description text not null default '',
  location_city text not null default '',
  location_state text not null default '',
  remote_policy text not null default 'onsite'
    check (remote_policy in ('onsite', 'hybrid', 'remote')),
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','internship','temporary')),
  pay_min numeric(12,2),
  pay_max numeric(12,2),
  pay_period text not null default 'year'
    check (pay_period in ('hour','week','month','year')),
  shift_text text not null default '',
  requirements_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(requirements_json) = 'array'),
  benefits_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(benefits_json) = 'array'),
  skills_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(skills_json) = 'array'),
  application_instructions text not null default '',
  pipeline_version_id uuid,
  status text not null default 'draft'
    check (status in ('draft','published','paused','closed','archived')),
  revision integer not null default 1 check (revision > 0),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_ats_job_pay_range check (
    (pay_min is null or pay_min >= 0) and
    (pay_max is null or pay_max >= 0) and
    (pay_min is null or pay_max is null or pay_min <= pay_max)
  ),
  constraint wf_ats_job_published_requirements check (
    status not in ('published','paused','closed') or
    (nullif(btrim(title),'') is not null and pipeline_version_id is not null and published_at is not null)
  ),
  constraint wf_ats_job_templates_draft check (not is_template or status in ('draft','archived'))
);

comment on table public.wf_ats_job_listings is
  'Employer-owned ATS Job Listings. Distinct from wf_hiring_needs; published pipeline assignment is deferred to ATS-02.';

create index if not exists wf_ats_jobs_employer_updated_idx
  on public.wf_ats_job_listings(employer_id, updated_at desc);
create index if not exists wf_ats_jobs_employer_status_idx
  on public.wf_ats_job_listings(employer_id, status, updated_at desc);
create index if not exists wf_ats_jobs_hiring_manager_idx
  on public.wf_ats_job_listings(employer_id, assigned_hiring_manager_user_id)
  where assigned_hiring_manager_user_id is not null;
create index if not exists wf_ats_jobs_hiring_need_idx
  on public.wf_ats_job_listings(hiring_need_id)
  where hiring_need_id is not null;
create index if not exists wf_ats_jobs_source_idx
  on public.wf_ats_job_listings(source_job_listing_id)
  where source_job_listing_id is not null;

alter table public.wf_ats_job_listings enable row level security;
revoke all on public.wf_ats_job_listings from anon, authenticated;
grant select, insert, update on public.wf_ats_job_listings to authenticated;

create policy wf_ats_jobs_read_employer on public.wf_ats_job_listings
  for select to authenticated
  using (
    security.member_of_employer(employer_id)
    and (
      not security.has_employer_role(employer_id, array['hiring_manager'])
      or security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter','employer_read_only'])
      or assigned_hiring_manager_user_id = security.current_legacy_user_id()
    )
  );

create policy wf_ats_jobs_insert_employer on public.wf_ats_job_listings
  for insert to authenticated
  with check (
    security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    and created_by_user_id = security.current_legacy_user_id()
    and status = 'draft'
    and pipeline_version_id is null
    and exists (
      select 1 from public.contractors c
      where c.contractor_id = employer_id
        and c.approval_status = 'approved'
        and c.account_status = 'active'
    )
  );

create policy wf_ats_jobs_update_employer on public.wf_ats_job_listings
  for update to authenticated
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

-- A security-schema audit ledger is intentionally not exposed to Data API roles.
create table if not exists security.wf_ats_job_audit (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null,
  job_listing_id text not null,
  actor_user_id text,
  operation text not null check (operation in ('created','updated','status_changed')),
  previous_status text,
  new_status text,
  revision integer not null,
  at timestamptz not null default now()
);
create index if not exists wf_ats_job_audit_subject_idx
  on security.wf_ats_job_audit(employer_id, job_listing_id, at desc);
alter table security.wf_ats_job_audit enable row level security;
revoke all on security.wf_ats_job_audit from public, anon, authenticated;

create or replace function security.wf_ats_job_guard_and_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_owner_admin boolean;
begin
  v_actor := security.current_legacy_user_id();
  v_owner_admin := security.has_employer_role(new.employer_id, array['employer_owner','employer_admin']);
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.pipeline_version_id is not null then
      raise exception 'ATS jobs must start as unpublished drafts';
    end if;
  else
    if new.id is distinct from old.id
      or new.job_listing_id is distinct from old.job_listing_id
      or new.employer_id is distinct from old.employer_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.source_job_listing_id is distinct from old.source_job_listing_id then
      raise exception 'ATS job identity and ownership are immutable';
    end if;
    if new.assigned_hiring_manager_user_id is distinct from old.assigned_hiring_manager_user_id
      and not v_owner_admin then
      raise exception 'Only Employer Owner/Admin may change job assignment';
    end if;
    if old.status <> 'draft' and
      (new.title, new.summary, new.description, new.location_city, new.location_state,
       new.remote_policy, new.employment_type, new.pay_min, new.pay_max, new.pay_period,
       new.shift_text, new.requirements_json, new.benefits_json, new.skills_json,
       new.application_instructions, new.is_template, new.hiring_need_id)
      is distinct from
      (old.title, old.summary, old.description, old.location_city, old.location_state,
       old.remote_policy, old.employment_type, old.pay_min, old.pay_max, old.pay_period,
       old.shift_text, old.requirements_json, old.benefits_json, old.skills_json,
       old.application_instructions, old.is_template, old.hiring_need_id) then
      raise exception 'Published/closed job content cannot be edited as a draft';
    end if;
    if new.status is distinct from old.status and not v_owner_admin then
      raise exception 'Only Employer Owner/Admin may transition job status';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  -- ATS-02 owns version publication. Fail closed on all public activation paths until
  -- that migration replaces this guard with a validated immutable version FK/check.
  if new.status in ('published','paused','closed') or new.pipeline_version_id is not null then
    raise exception 'Published pipeline versions are required; ATS-02 is not enabled';
  end if;
  if tg_op = 'INSERT' then
    insert into security.wf_ats_job_audit
      (employer_id, job_listing_id, actor_user_id, operation, new_status, revision)
    values (new.employer_id, new.job_listing_id, v_actor, 'created', new.status, new.revision);
  else
    insert into security.wf_ats_job_audit
      (employer_id, job_listing_id, actor_user_id, operation, previous_status, new_status, revision)
    values (new.employer_id, new.job_listing_id, v_actor,
      case when new.status is distinct from old.status then 'status_changed' else 'updated' end,
      old.status, new.status, new.revision);
  end if;
  return new;
end;
$$;

revoke all on function security.wf_ats_job_guard_and_audit() from public;
drop trigger if exists wf_ats_jobs_guard on public.wf_ats_job_listings;
create trigger wf_ats_jobs_guard
before insert or update on public.wf_ats_job_listings
for each row execute function security.wf_ats_job_guard_and_audit();

-- Curated public read model. Contains no employer-private notes or draft data.
-- Empty in ATS-01; a separately reviewed ATS-02 publication transaction will sync it.
create table if not exists public.wf_ats_public_jobs (
  job_listing_id text primary key,
  title text not null,
  summary text not null,
  description text not null,
  location_city text not null,
  location_state text not null,
  remote_policy text not null,
  employment_type text not null,
  pay_min numeric(12,2),
  pay_max numeric(12,2),
  pay_period text not null,
  shift_text text not null,
  benefits_json jsonb not null default '[]'::jsonb,
  requirements_json jsonb not null default '[]'::jsonb,
  skills_json jsonb not null default '[]'::jsonb,
  employer_display_name text not null,
  published_at timestamptz not null
);
create index if not exists wf_ats_public_jobs_published_idx
  on public.wf_ats_public_jobs(published_at desc);
alter table public.wf_ats_public_jobs enable row level security;
revoke all on public.wf_ats_public_jobs from anon, authenticated;
grant select on public.wf_ats_public_jobs to anon, authenticated;
create policy wf_ats_public_jobs_read on public.wf_ats_public_jobs
  for select to anon, authenticated using (true);
