-- ATS-02 / #329. STAGING REVIEW ONLY. Pipeline drafts and immutable published snapshots.
-- Deliberately does not alter the ATS-01 Job publication guard until the cross-domain
-- assignment transaction, public projection and owner UAT are reviewed separately.
-- No provider execution, automatic hiring decisions or applicant records.
create table public.wf_ats_pipeline_templates (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references public.contractors(contractor_id),
  name text not null check (length(btrim(name)) between 3 and 140),
  description text not null default '' check (length(description) <= 600),
  graph_json jsonb not null,
  source_template_id uuid references public.wf_ats_pipeline_templates(id) on delete set null,
  created_by_user_id text not null references public.users(user_id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_ats_pipeline_template_employer_unique unique (id, employer_id),
  constraint wf_ats_pipeline_template_graph_object check (jsonb_typeof(graph_json) = 'object')
);
create index wf_ats_pipeline_templates_employer_updated
  on public.wf_ats_pipeline_templates(employer_id, updated_at desc);
create index wf_ats_pipeline_templates_source_fk_idx
  on public.wf_ats_pipeline_templates(source_template_id) where source_template_id is not null;
comment on table public.wf_ats_pipeline_templates is
  'Employer-owned ATS pipeline draft configurations; versions are separately immutable. Not the legacy derived candidate pipeline.';

create table public.wf_ats_pipeline_versions (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references public.contractors(contractor_id),
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_revision integer not null check (source_revision > 0),
  graph_json jsonb not null check (jsonb_typeof(graph_json) = 'object'),
  published_by_user_id text not null references public.users(user_id),
  published_at timestamptz not null default now(),
  constraint wf_ats_version_same_employer foreign key (template_id, employer_id)
    references public.wf_ats_pipeline_templates(id, employer_id) on delete restrict,
  constraint wf_ats_version_number_unique unique (template_id, version_number),
  constraint wf_ats_version_source_revision_unique unique (template_id, source_revision),
  constraint wf_ats_version_employer_unique unique (id, employer_id)
);
create index wf_ats_pipeline_versions_employer_idx
  on public.wf_ats_pipeline_versions(employer_id, published_at desc);
comment on table public.wf_ats_pipeline_versions is
  'Immutable snapshots, writable only through security.wf_ats_publish_pipeline. Applications must pin the version present on submission in ATS-03.';

create table security.wf_ats_pipeline_audit (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null,
  template_id uuid not null,
  version_id uuid,
  operation text not null check (operation in ('created','updated','duplicated','version_published')),
  actor_user_id text,
  revision integer,
  at timestamptz not null default now()
);
create index wf_ats_pipeline_audit_subject_idx on security.wf_ats_pipeline_audit(employer_id, template_id, at desc);
alter table security.wf_ats_pipeline_audit enable row level security;
revoke all on security.wf_ats_pipeline_audit from public, anon, authenticated;

-- Reuse the ATS-01 role helper rather than generic platform-admin grants.
alter table public.wf_ats_pipeline_templates enable row level security;
revoke all on public.wf_ats_pipeline_templates from public, anon, authenticated;
grant select, insert, update on public.wf_ats_pipeline_templates to authenticated;
create policy wf_ats_pipeline_template_read on public.wf_ats_pipeline_templates
  for select to authenticated using (
    security.wf_ats_has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter','employer_read_only'])
    and exists (select 1 from public.contractors c
      where c.contractor_id=employer_id and c.approval_status='approved' and c.account_status='active')
  );
create policy wf_ats_pipeline_template_insert on public.wf_ats_pipeline_templates
  for insert to authenticated with check (
    security.wf_ats_has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    and created_by_user_id=security.current_legacy_user_id()
    and exists (select 1 from public.contractors c
      where c.contractor_id=employer_id and c.approval_status='approved' and c.account_status='active')
  );
create policy wf_ats_pipeline_template_update on public.wf_ats_pipeline_templates
  for update to authenticated using (
    security.wf_ats_has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    and exists (select 1 from public.contractors c
      where c.contractor_id=employer_id and c.approval_status='approved' and c.account_status='active')
  ) with check (
    security.wf_ats_has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    and exists (select 1 from public.contractors c
      where c.contractor_id=employer_id and c.approval_status='approved' and c.account_status='active')
  );

alter table public.wf_ats_pipeline_versions enable row level security;
revoke all on public.wf_ats_pipeline_versions from public, anon, authenticated;
grant select on public.wf_ats_pipeline_versions to authenticated;
create policy wf_ats_pipeline_versions_read on public.wf_ats_pipeline_versions
  for select to authenticated using (
    security.wf_ats_has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter','employer_read_only'])
    and exists (select 1 from public.contractors c
      where c.contractor_id=employer_id and c.approval_status='approved' and c.account_status='active')
  );

create or replace function security.wf_ats_pipeline_template_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_actor text := security.current_legacy_user_id();
begin
  if new.source_template_id is not null and not exists (
    select 1 from public.wf_ats_pipeline_templates t
    where t.id=new.source_template_id and t.employer_id=new.employer_id
  ) then raise exception 'Pipeline source must belong to this employer'; end if;
  if tg_op='INSERT' then
    if new.created_by_user_id is distinct from v_actor then raise exception 'Invalid creator'; end if;
    new.id:=gen_random_uuid();
    new.revision:=1;
    new.created_at:=now();
    new.updated_at:=now();
    insert into security.wf_ats_pipeline_audit
      (employer_id,template_id,operation,actor_user_id,revision)
      values (new.employer_id,new.id,
        case when new.source_template_id is null then 'created' else 'duplicated' end,
        v_actor,1);
  else
    if new.id is distinct from old.id or new.employer_id is distinct from old.employer_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.source_template_id is distinct from old.source_template_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Pipeline identity and tenant are immutable';
    end if;
    new.revision:=old.revision+1;
    new.updated_at:=now();
    insert into security.wf_ats_pipeline_audit
      (employer_id,template_id,operation,actor_user_id,revision)
      values (new.employer_id,new.id,'updated',v_actor,new.revision);
  end if;
  return new;
end;
$$;
revoke all on function security.wf_ats_pipeline_template_guard() from public, anon, authenticated;
create trigger wf_ats_pipeline_template_guard_trigger
  before insert or update on public.wf_ats_pipeline_templates
  for each row execute function security.wf_ats_pipeline_template_guard();

-- Independently validate the persisted graph at the database publication boundary.
-- This protects against directly writing an invalid draft through the authenticated Data API.
create or replace function security.wf_ats_graph_publishable(p_graph jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $
#variable_conflict use_column
declare
  v_nodes jsonb; v_edges jsonb; n jsonb; e jsonb; v_id text; v_kind text;
  v_ids text[] := array[]::text[]; v_remaining text[]; v_selected text;
  v_starts integer := 0; v_ends integer := 0; v_count integer;
  v_entry text; v_allowed text[] := array[
    'start','end','application_form','assessment','video','consent',
    'contract_signature','interview_in_person','interview_online',
    'background_check','fingerprinting','drug_test','manual_review','decision','notification'];
begin
  if p_graph is null or jsonb_typeof(p_graph) is distinct from 'object'
    or p_graph->>'schemaVersion'<>'1'
    or jsonb_typeof(p_graph->'nodes') is distinct from 'array'
    or jsonb_typeof(p_graph->'edges') is distinct from 'array' then return false; end if;
  v_nodes:=p_graph->'nodes'; v_edges:=p_graph->'edges';
  if jsonb_array_length(v_nodes) not between 2 and 100 or jsonb_array_length(v_edges)>200 then return false; end if;
  v_entry:=p_graph->>'entryNodeId';
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    if v_id is null or v_id !~ '^[a-z][a-z0-9_-]{0,59}$' or v_id=any(v_ids)
      or not (v_kind=any(v_allowed))
      or jsonb_typeof(n->'config') is distinct from 'object'
      or jsonb_typeof(n->'required') is distinct from 'boolean'
      or jsonb_typeof(n->'candidateVisible') is distinct from 'boolean'
      or jsonb_typeof(n->'x') is distinct from 'number'
      or jsonb_typeof(n->'y') is distinct from 'number' then return false; end if;
    if exists(select 1 from jsonb_object_keys(n->'config') k
      where k not in ('instructions','url','fields','disclosure','expectedMinutes')) then return false; end if;
    if v_kind='consent' and nullif(btrim(n->'config'->>'disclosure'),'') is null then return false; end if;
    if v_kind<>'application_form' and n->'config' ? 'fields' then return false; end if;
    if v_kind='application_form' and n->'config' ? 'fields' and
      (jsonb_typeof(n->'config'->'fields') is distinct from 'array' or jsonb_array_length(n->'config'->'fields')>35) then return false; end if;
    v_ids:=array_append(v_ids,v_id);
    if v_kind='start' then v_starts:=v_starts+1; end if;
    if v_kind='end' then v_ends:=v_ends+1; end if;
  end loop;
  if v_starts<>1 or v_ends<1 or not v_entry=any(v_ids) then return false; end if;
  if not exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=v_entry and n->>'kind'='start') then return false; end if;
  for e in select value from jsonb_array_elements(v_edges) loop
    if e->>'source' is null or e->>'target' is null
      or not (e->>'source'=any(v_ids)) or not (e->>'target'=any(v_ids))
      or e->>'source'=e->>'target' then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'source' and n->>'kind'='end') then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'target' and n->>'kind'='start') then return false; end if;
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(v_edges) e)<>jsonb_array_length(v_edges) then return false; end if;
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    v_count:=(select count(*) from jsonb_array_elements(v_edges) e where e->>'source'=v_id);
    if v_kind='end' and v_count<>0 then return false; end if;
    if v_kind not in ('end','decision') and v_count<>1 then return false; end if;
    if v_kind='decision' then
      if v_count<>2 or
        (select count(distinct e->>'outcome') from jsonb_array_elements(v_edges) e
         where e->>'source'=v_id and e->>'outcome' in ('yes','no'))<>2 then return false; end if;
    elsif exists(select 1 from jsonb_array_elements(v_edges) e where e->>'source'=v_id and e ? 'outcome') then return false;
    end if;
    if v_kind<>'start' and not exists (
      select 1 from jsonb_array_elements(v_edges) e where e->>'target'=v_id
    ) then return false; end if;
  end loop;
  -- Topological elimination rejects cycles. Acyclic + unique Start +
  -- incoming edge for all other nodes ensures full reachability.
  v_remaining:=v_ids;
  while cardinality(v_remaining)>0 loop
    v_selected:=null;
    select candidate into v_selected from unnest(v_remaining) candidate
      where not exists (select 1 from jsonb_array_elements(v_edges) e
        where e->>'target'=candidate and e->>'source'=any(v_remaining))
      limit 1;
    if v_selected is null then return false; end if;
    v_remaining:=array_remove(v_remaining,v_selected);
  end loop;
  return true;
exception when others then
  raise;
end;
$$;
revoke all on function security.wf_ats_graph_publishable(jsonb) from public, anon, authenticated;

create or replace function security.wf_ats_publish_pipeline(
  p_employer_id text, p_template_id uuid, p_revision integer)
returns public.wf_ats_pipeline_versions
language plpgsql security definer set search_path = ''
as $$
declare v_template public.wf_ats_pipeline_templates%rowtype;
  v_number integer; v_version public.wf_ats_pipeline_versions%rowtype;
begin
  if not security.wf_ats_has_employer_role(p_employer_id,array['employer_owner','employer_admin'])
    or not exists(select 1 from public.contractors c
      where c.contractor_id=p_employer_id and c.approval_status='approved' and c.account_status='active')
  then raise exception 'Pipeline publication requires authorized Employer Owner/Admin' using errcode='42501'; end if;
  select * into v_template from public.wf_ats_pipeline_templates
    where id=p_template_id and employer_id=p_employer_id for update;
  if not found then raise exception 'Pipeline not found or unauthorized' using errcode='42501'; end if;
  if v_template.revision<>p_revision then raise exception 'Pipeline revision conflict' using errcode='40001'; end if;
  if not security.wf_ats_graph_publishable(v_template.graph_json) then
    raise exception 'Invalid pipeline graph; publication refused' using errcode='23514'; end if;
  select coalesce(max(version_number),0)+1 into v_number
    from public.wf_ats_pipeline_versions where template_id=p_template_id;
  insert into public.wf_ats_pipeline_versions
    (employer_id,template_id,version_number,source_revision,graph_json,published_by_user_id)
    values (p_employer_id,p_template_id,v_number,v_template.revision,v_template.graph_json,security.current_legacy_user_id())
    returning * into v_version;
  insert into security.wf_ats_pipeline_audit
    (employer_id,template_id,version_id,operation,actor_user_id,revision)
    values(p_employer_id,p_template_id,v_version.id,'version_published',security.current_legacy_user_id(),v_template.revision);
  return v_version;
end;
$$;
revoke all on function security.wf_ats_publish_pipeline(text,uuid,integer) from public, anon;
grant execute on function security.wf_ats_publish_pipeline(text,uuid,integer) to authenticated;

-- Expose only a narrowly scoped authenticated RPC through PostgREST.
-- The security-schema implementation independently authenticates and verifies role/tenant.
create or replace function public.wf_ats_publish_pipeline(
  p_employer_id text, p_template_id uuid, p_revision integer)
returns public.wf_ats_pipeline_versions
language sql security definer set search_path = ''
as $$
  select security.wf_ats_publish_pipeline(p_employer_id,p_template_id,p_revision);
$$;
revoke all on function public.wf_ats_publish_pipeline(text,uuid,integer) from public, anon;
grant execute on function public.wf_ats_publish_pipeline(text,uuid,integer) to authenticated;
