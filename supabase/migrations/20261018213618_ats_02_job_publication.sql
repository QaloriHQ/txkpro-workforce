-- ATS-02 / #329: additive job publication bridge; staging reviewed separately from ATS-01.
-- Status names remain canonical Appendix M. Never edit the applied ATS-01 source migration.
alter table public.wf_ats_job_listings
  add constraint wf_ats_job_pipeline_same_employer_fk
  foreign key (pipeline_version_id, employer_id)
  references public.wf_ats_pipeline_versions(id,employer_id) on delete restrict;
create index wf_ats_jobs_pipeline_version_id_idx on public.wf_ats_job_listings(pipeline_version_id)
  where pipeline_version_id is not null;

create or replace function security.wf_ats_job_guard_and_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_owner_admin boolean;
  v_transition boolean := false;
begin
  v_actor := security.current_legacy_user_id();
  v_owner_admin := security.wf_ats_has_employer_role(new.employer_id, array['employer_owner','employer_admin']);
  -- Optional links are private tenant-owned relationships, never arbitrary
  -- client-supplied cross-employer identifiers.
  if new.hiring_need_id is not null and not exists (
    select 1 from public.wf_hiring_needs hn
    where hn.hiring_need_id = new.hiring_need_id and hn.employer_id = new.employer_id
  ) then
    raise exception 'Hiring Need must belong to the same employer';
  end if;
  if new.source_job_listing_id is not null and not exists (
    select 1 from public.wf_ats_job_listings source
    where source.id = new.source_job_listing_id and source.employer_id = new.employer_id
  ) then
    raise exception 'Job source must belong to the same employer';
  end if;
  if new.assigned_hiring_manager_user_id is not null and not exists (
    select 1 from public.app_role_memberships m
    where m.user_id = new.assigned_hiring_manager_user_id
      and lower(m.status) = 'active'
      and lower(m.scope_type) in ('employer','contractor')
      and m.scope_id = new.employer_id
      and lower(m.role) in ('hiring_manager','employer_owner','employer_admin')
  ) then
    raise exception 'Assigned manager requires an active scoped employer membership';
  end if;
  if tg_op = 'INSERT' then
    if new.assigned_hiring_manager_user_id is not null and not v_owner_admin then
      raise exception 'Only Employer Owner/Admin may assign a hiring manager';
    end if;
    -- Ignore client-controlled identity, revision and lifecycle timestamps.
    new.id := gen_random_uuid();
    new.job_listing_id := 'JOB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    new.published_at := null;
    new.closed_at := null;
    if new.status <> 'draft' or new.pipeline_version_id is not null then
      raise exception 'ATS jobs must start as unpublished drafts';
    end if;
  else
    if new.id is distinct from old.id
      or new.job_listing_id is distinct from old.job_listing_id
      or new.employer_id is distinct from old.employer_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.source_job_listing_id is distinct from old.source_job_listing_id
      or new.created_at is distinct from old.created_at then
      raise exception 'ATS job identity and ownership are immutable';
    end if;
    if new.assigned_hiring_manager_user_id is distinct from old.assigned_hiring_manager_user_id
      and not v_owner_admin then
      raise exception 'Only Employer Owner/Admin may change job assignment';
    end if;
    if (old.status <> 'draft' or new.status <> old.status) and
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
    v_transition := new.status is distinct from old.status;
    if old.pipeline_version_id is not null and
      new.pipeline_version_id is distinct from old.pipeline_version_id then
      raise exception 'Published pipeline binding cannot be changed';
    end if;
    if new.pipeline_version_id is distinct from old.pipeline_version_id
      and not (old.status='draft' and new.status='published' and v_owner_admin) then
      raise exception 'A pipeline version can only be assigned on authorized first publication';
    end if;
    if v_transition then
      if not v_owner_admin then raise exception 'Only Employer Owner/Admin may transition job status'; end if;
      if not (
        (old.status='draft' and new.status in ('published','archived')) or
        (old.status='published' and new.status in ('paused','closed')) or
        (old.status='paused' and new.status in ('published','closed')) or
        (old.status='closed' and new.status='archived')
      ) then raise exception 'Invalid ATS job status transition'; end if;
    end if;
    if old.status='draft' and new.status='published' then
      new.published_at:=now();
    elsif new.published_at is distinct from old.published_at then
      raise exception 'Publication timestamp is immutable';
    end if;
    if old.status in ('published','paused') and new.status='closed' then
      new.closed_at:=now();
    elsif new.closed_at is distinct from old.closed_at then
      raise exception 'Close timestamp is immutable';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  if new.status='draft' and new.pipeline_version_id is not null then
    raise exception 'Draft jobs cannot bind a pipeline version';
  end if;
  if new.status in ('published','paused','closed') then
    if new.pipeline_version_id is null or new.published_at is null or new.is_template
      or nullif(btrim(new.title),'') is null
      or nullif(btrim(new.description),'') is null
      or (new.remote_policy<>'remote' and
        (nullif(btrim(new.location_city),'') is null or nullif(btrim(new.location_state),'') is null))
      or not exists (
        select 1 from public.wf_ats_pipeline_versions v
        where v.id=new.pipeline_version_id and v.employer_id=new.employer_id
      ) then raise exception 'Published jobs require complete content and a same-employer immutable pipeline version'; end if;
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


revoke all on function security.wf_ats_job_guard_and_audit() from public, anon, authenticated;

-- A post-commit trigger projection is part of the same DB transaction. No anonymous
-- or authenticated direct writes to the curated public table are permitted.
create or replace function security.wf_ats_job_public_projection()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status='published' then
    insert into public.wf_ats_public_jobs
      (job_listing_id,title,summary,description,location_city,location_state,
       remote_policy,employment_type,pay_min,pay_max,pay_period,shift_text,
       benefits_json,requirements_json,skills_json,employer_display_name,published_at)
    select new.job_listing_id,new.title,new.summary,new.description,
      new.location_city,new.location_state,new.remote_policy,new.employment_type,
      new.pay_min,new.pay_max,new.pay_period,new.shift_text,new.benefits_json,
      new.requirements_json,new.skills_json,coalesce(c.business_name,'Employer'),new.published_at
    from public.contractors c where c.contractor_id=new.employer_id
    on conflict (job_listing_id) do update set
      title=excluded.title, summary=excluded.summary, description=excluded.description,
      location_city=excluded.location_city,location_state=excluded.location_state,
      remote_policy=excluded.remote_policy, employment_type=excluded.employment_type,
      pay_min=excluded.pay_min,pay_max=excluded.pay_max,pay_period=excluded.pay_period,
      shift_text=excluded.shift_text,benefits_json=excluded.benefits_json,
      requirements_json=excluded.requirements_json,skills_json=excluded.skills_json,
      employer_display_name=excluded.employer_display_name,published_at=excluded.published_at;
  else
    delete from public.wf_ats_public_jobs p where p.job_listing_id=new.job_listing_id;
  end if;
  return null;
end;
$$;
revoke all on function security.wf_ats_job_public_projection() from public,anon,authenticated;
create trigger wf_ats_jobs_public_projection
after insert or update on public.wf_ats_job_listings
for each row execute function security.wf_ats_job_public_projection();

-- Authenticated RPC with defense-in-depth: 403 if not scoped employer owner/admin;
-- optimistic concurrency by exact revision; immutable version same employer.
create or replace function public.wf_ats_publish_job(
  p_employer_id text, p_job_id uuid, p_pipeline_version_id uuid, p_expected_revision integer
) returns public.wf_ats_job_listings
language plpgsql security definer set search_path=''
as $$
declare v_job public.wf_ats_job_listings%rowtype;
begin
  if not security.wf_ats_has_employer_role(p_employer_id,array['employer_owner','employer_admin'])
    or not exists(select 1 from public.contractors c where c.contractor_id=p_employer_id
      and c.approval_status='approved' and c.account_status='active') then
    raise exception 'Employer Owner/Admin role required for job publication' using errcode='42501';
  end if;
  if not exists(select 1 from public.wf_ats_pipeline_versions v
    where v.id=p_pipeline_version_id and v.employer_id=p_employer_id) then
    raise exception 'Published pipeline must belong to this employer' using errcode='42501';
  end if;
  update public.wf_ats_job_listings j
    set status='published',pipeline_version_id=p_pipeline_version_id
    where j.id=p_job_id and j.employer_id=p_employer_id
      and j.status='draft' and j.revision=p_expected_revision and not j.is_template
    returning * into v_job;
  if not found then raise exception 'Job not found, not a draft, or revision conflict' using errcode='40001'; end if;
  return v_job;
end;
$$;
revoke all on function public.wf_ats_publish_job(text,uuid,uuid,integer) from public,anon;
grant execute on function public.wf_ats_publish_job(text,uuid,uuid,integer) to authenticated;
