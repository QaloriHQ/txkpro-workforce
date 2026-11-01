-- ATS-03 / #330: candidate invitations, canonical applications and guarded lifecycle actions.
-- The Supabase CLI is unavailable in this execution environment, so this additive
-- migration uses the same timestamped repository convention as CLI-created files.
-- STAGING ONLY until separately authorized. Provider nodes remain inert.

alter table public.wf_ats_job_listings
  add constraint wf_ats_job_employer_unique unique (id, employer_id);

create table public.wf_ats_candidate_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_id text not null unique default ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  employer_id text not null references public.contractors(contractor_id),
  job_id uuid not null,
  pipeline_version_id uuid not null,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  student_id text references public.wf_student_profiles(student_id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed')),
  delivery_error_code text,
  send_count integer not null default 0 check (send_count >= 0),
  last_sent_at timestamptz,
  expires_at timestamptz not null,
  created_by_user_id text references public.users(user_id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_ats_invitation_job_tenant_fk foreign key (job_id, employer_id)
    references public.wf_ats_job_listings(id, employer_id) on delete restrict,
  constraint wf_ats_invitation_version_tenant_fk foreign key (pipeline_version_id, employer_id)
    references public.wf_ats_pipeline_versions(id, employer_id) on delete restrict,
  constraint wf_ats_invitation_timestamps check (
    (status <> 'accepted' or accepted_at is not null) and
    (status <> 'revoked' or revoked_at is not null)
  )
);
create unique index wf_ats_invitation_one_pending_email
  on public.wf_ats_candidate_invitations(job_id, lower(email)) where status='pending';
create index wf_ats_invitation_employer_status
  on public.wf_ats_candidate_invitations(employer_id, status, created_at desc);
create index wf_ats_invitation_recipient
  on public.wf_ats_candidate_invitations(lower(email), status, expires_at);
create index wf_ats_invitation_job_fk on public.wf_ats_candidate_invitations(job_id);
create index wf_ats_invitation_version_fk on public.wf_ats_candidate_invitations(pipeline_version_id);

create table public.wf_ats_applications (
  id uuid primary key default gen_random_uuid(),
  application_id text not null unique default ('APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  employer_id text not null references public.contractors(contractor_id),
  job_id uuid not null,
  pipeline_version_id uuid not null,
  invitation_id uuid references public.wf_ats_candidate_invitations(id) on delete set null,
  applicant_auth_user_id uuid not null references auth.users(id) on delete restrict,
  identity_type text not null check (identity_type in ('student','external')),
  student_id text references public.wf_student_profiles(student_id) on delete restrict,
  external_email text,
  status text not null default 'submitted' check (status in ('draft','submitted','withdrawn','employer_closed')),
  answers_json jsonb not null default '{}'::jsonb check (jsonb_typeof(answers_json)='object'),
  privacy_notice_version text not null,
  privacy_accepted_at timestamptz not null,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  closed_at timestamptz,
  lifecycle_reason text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_ats_application_job_tenant_fk foreign key (job_id, employer_id)
    references public.wf_ats_job_listings(id, employer_id) on delete restrict,
  constraint wf_ats_application_version_tenant_fk foreign key (pipeline_version_id, employer_id)
    references public.wf_ats_pipeline_versions(id, employer_id) on delete restrict,
  constraint wf_ats_application_identity check (
    (identity_type='student' and student_id is not null and external_email is null) or
    (identity_type='external' and student_id is null and external_email is not null)
  ),
  constraint wf_ats_application_lifecycle_timestamps check (
    (status <> 'submitted' or submitted_at is not null) and
    (status <> 'withdrawn' or withdrawn_at is not null) and
    (status <> 'employer_closed' or closed_at is not null)
  ),
  constraint wf_ats_application_candidate_job_unique unique (job_id, applicant_auth_user_id)
);
create index wf_ats_application_employer_status
  on public.wf_ats_applications(employer_id, status, submitted_at desc);
create index wf_ats_application_candidate
  on public.wf_ats_applications(applicant_auth_user_id, submitted_at desc);
create index wf_ats_application_job_fk on public.wf_ats_applications(job_id);
create index wf_ats_application_version_fk on public.wf_ats_applications(pipeline_version_id);
create index wf_ats_application_invitation_fk on public.wf_ats_applications(invitation_id) where invitation_id is not null;

create table public.wf_ats_application_tasks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.wf_ats_applications(id) on delete restrict,
  pipeline_version_id uuid not null references public.wf_ats_pipeline_versions(id) on delete restrict,
  node_id text not null,
  stage_id text,
  node_kind text not null,
  label text not null,
  instructions text not null default '',
  owner_role text not null check (owner_role in ('candidate','recruiter','hiring_manager','employer_admin')),
  candidate_visible boolean not null default false,
  required boolean not null default true,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','submitted','completed','skipped','review_required')),
  target_hours integer check (target_hours between 1 and 2160),
  assigned_at timestamptz,
  due_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_ats_application_task_unique unique (application_id, node_id),
  constraint wf_ats_task_due_requires_assignment check (due_at is null or assigned_at is not null)
);
create index wf_ats_task_application_status
  on public.wf_ats_application_tasks(application_id, status, created_at);
create index wf_ats_task_version_fk on public.wf_ats_application_tasks(pipeline_version_id);

create table security.wf_ats_application_audit (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null,
  application_id uuid,
  invitation_id uuid,
  task_id uuid,
  actor_auth_user_id uuid,
  actor_user_id text,
  operation text not null check (operation in (
    'invited','invitation_resent','invitation_revoked','invitation_expired','invitation_accepted',
    'application_submitted','application_withdrawn','application_employer_closed',
    'task_submitted','task_transitioned'
  )),
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  at timestamptz not null default now()
);
create index wf_ats_application_audit_subject
  on security.wf_ats_application_audit(employer_id, application_id, at desc);
alter table security.wf_ats_application_audit enable row level security;
revoke all on security.wf_ats_application_audit from public, anon, authenticated;

alter table public.wf_ats_candidate_invitations enable row level security;
alter table public.wf_ats_applications enable row level security;
alter table public.wf_ats_application_tasks enable row level security;
revoke all on public.wf_ats_candidate_invitations from public, anon, authenticated;
revoke all on public.wf_ats_applications from public, anon, authenticated;
revoke all on public.wf_ats_application_tasks from public, anon, authenticated;
grant select on public.wf_ats_candidate_invitations to authenticated;
grant select on public.wf_ats_applications to authenticated;
grant select on public.wf_ats_application_tasks to authenticated;

create policy wf_ats_invitation_employer_read on public.wf_ats_candidate_invitations
for select to authenticated using (
  security.wf_ats_has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
  or exists (
    select 1 from public.wf_ats_job_listings j
    where j.id=job_id and j.employer_id=employer_id
      and j.assigned_hiring_manager_user_id=security.current_legacy_user_id()
      and security.wf_ats_has_employer_role(employer_id,array['hiring_manager'])
  )
);
create policy wf_ats_invitation_recipient_read on public.wf_ats_candidate_invitations
for select to authenticated using (
  lower(email)=lower(coalesce((select auth.jwt()->>'email'),''))
);

create policy wf_ats_application_employer_read on public.wf_ats_applications
for select to authenticated using (
  security.wf_ats_has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
  or exists (
    select 1 from public.wf_ats_job_listings j
    where j.id=job_id and j.employer_id=employer_id
      and j.assigned_hiring_manager_user_id=security.current_legacy_user_id()
      and security.wf_ats_has_employer_role(employer_id,array['hiring_manager'])
  )
);
create policy wf_ats_application_candidate_read on public.wf_ats_applications
for select to authenticated using (applicant_auth_user_id=(select auth.uid()));

create policy wf_ats_task_employer_read on public.wf_ats_application_tasks
for select to authenticated using (
  exists (
    select 1 from public.wf_ats_applications a
    join public.wf_ats_job_listings j on j.id=a.job_id and j.employer_id=a.employer_id
    where a.id=public.wf_ats_application_tasks.application_id and (
      security.wf_ats_has_employer_role(a.employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
      or (j.assigned_hiring_manager_user_id=security.current_legacy_user_id()
        and security.wf_ats_has_employer_role(a.employer_id,array['hiring_manager']))
    )
  )
);
create policy wf_ats_task_candidate_read on public.wf_ats_application_tasks
for select to authenticated using (
  candidate_visible and exists (
    select 1 from public.wf_ats_applications a
    where a.id=public.wf_ats_application_tasks.application_id and a.applicant_auth_user_id=(select auth.uid())
  )
);

create or replace function security.wf_ats_can_manage_application(p_employer_id text,p_job_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select security.wf_ats_has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter'])
    or exists (
      select 1 from public.wf_ats_job_listings j
      where j.id=p_job_id and j.employer_id=p_employer_id
        and j.assigned_hiring_manager_user_id=security.current_legacy_user_id()
        and security.wf_ats_has_employer_role(p_employer_id,array['hiring_manager'])
    );
$$;
revoke all on function security.wf_ats_can_manage_application(text,uuid) from public,anon,authenticated;

create or replace function public.wf_ats_candidate_invitation_create(
  p_employer_id text,p_job_id uuid,p_email text,p_student_id text default null
) returns public.wf_ats_candidate_invitations
language plpgsql security definer set search_path=''
as $$
declare v_job public.wf_ats_job_listings%rowtype;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_invite public.wf_ats_candidate_invitations%rowtype;
  v_existing boolean:=false;
begin
  select * into v_job from public.wf_ats_job_listings
    where id=p_job_id and employer_id=p_employer_id and status='published' for share;
  if not found then raise exception 'Published job not found' using errcode='P0002'; end if;
  if not security.wf_ats_can_manage_application(p_employer_id,p_job_id) then
    raise exception 'Candidate invitation denied' using errcode='42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_email)>320 then
    raise exception 'Valid candidate email required' using errcode='22023';
  end if;
  select exists(select 1 from public.wf_ats_candidate_invitations where job_id=p_job_id and lower(email)=v_email and status='pending') into v_existing;
  insert into public.wf_ats_candidate_invitations
    (employer_id,job_id,pipeline_version_id,email,student_id,expires_at,created_by_user_id)
  values(p_employer_id,p_job_id,v_job.pipeline_version_id,v_email,nullif(btrim(p_student_id),''),now()+interval '7 days',security.current_legacy_user_id())
  on conflict (job_id,lower(email)) where status='pending'
  do update set updated_at=now()
  returning * into v_invite;
  insert into security.wf_ats_application_audit
    (employer_id,invitation_id,actor_auth_user_id,actor_user_id,operation,new_status)
  values(p_employer_id,v_invite.id,(select auth.uid()),security.current_legacy_user_id(),case when v_existing then 'invitation_resent' else 'invited' end,'pending');
  return v_invite;
end;
$$;
revoke all on function public.wf_ats_candidate_invitation_create(text,uuid,text,text) from public,anon;
grant execute on function public.wf_ats_candidate_invitation_create(text,uuid,text,text) to authenticated;

create or replace function public.wf_ats_candidate_invitation_revoke(p_employer_id text,p_invitation_id uuid,p_reason text)
returns public.wf_ats_candidate_invitations
language plpgsql security definer set search_path=''
as $$
declare v_invite public.wf_ats_candidate_invitations%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  select * into v_invite from public.wf_ats_candidate_invitations
    where id=p_invitation_id and employer_id=p_employer_id for update;
  if not found then raise exception 'Invitation not found' using errcode='P0002'; end if;
  if not security.wf_ats_can_manage_application(v_invite.employer_id,v_invite.job_id) then
    raise exception 'Candidate invitation denied' using errcode='42501';
  end if;
  if v_invite.status<>'pending' then raise exception 'Only pending invitations may be revoked' using errcode='23514'; end if;
  if length(v_reason)<3 or length(v_reason)>500 then raise exception 'Revocation reason required' using errcode='22023'; end if;
  update public.wf_ats_candidate_invitations set status='revoked',revoked_at=now(),updated_at=now()
    where id=v_invite.id returning * into v_invite;
  insert into security.wf_ats_application_audit
    (employer_id,invitation_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status,reason)
  values(v_invite.employer_id,v_invite.id,(select auth.uid()),security.current_legacy_user_id(),'invitation_revoked','pending','revoked',v_reason);
  return v_invite;
end;
$$;
revoke all on function public.wf_ats_candidate_invitation_revoke(text,uuid,text) from public,anon;
grant execute on function public.wf_ats_candidate_invitation_revoke(text,uuid,text) to authenticated;

create or replace function public.wf_ats_candidate_invitations_expire(p_employer_id text)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer:=0;
begin
  if not security.wf_ats_has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']) then
    raise exception 'Invitation reconciliation denied' using errcode='42501';
  end if;
  with expired as (
    update public.wf_ats_candidate_invitations set status='expired',updated_at=now()
      where employer_id=p_employer_id and status='pending' and expires_at<=now()
      returning id
  ), audited as (
    insert into security.wf_ats_application_audit(employer_id,invitation_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status)
      select p_employer_id,id,(select auth.uid()),security.current_legacy_user_id(),'invitation_expired','pending','expired' from expired
      returning 1
  ) select count(*) into v_count from audited;
  return v_count;
end;
$$;
revoke all on function public.wf_ats_candidate_invitations_expire(text) from public,anon;
grant execute on function public.wf_ats_candidate_invitations_expire(text) to authenticated;

create or replace function public.wf_ats_application_submit(
  p_job_listing_id text,p_invitation_id uuid,p_answers jsonb,p_privacy_notice_version text
) returns public.wf_ats_applications
language plpgsql security definer set search_path=''
as $$
declare v_job public.wf_ats_job_listings%rowtype;
  v_version public.wf_ats_pipeline_versions%rowtype;
  v_invite public.wf_ats_candidate_invitations%rowtype;
  v_application public.wf_ats_applications%rowtype;
  v_auth uuid:=(select auth.uid()); v_email text:=lower(coalesce((select auth.jwt()->>'email'),''));
  v_student_id text; v_node jsonb; v_field jsonb; v_owner text;
begin
  if v_auth is null or v_email='' then raise exception 'Verified email session required' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_answers,'{}'::jsonb))<>'object' then raise exception 'Application answers must be an object' using errcode='22023'; end if;
  if length(btrim(coalesce(p_privacy_notice_version,'')))<3 then raise exception 'Privacy notice acceptance required' using errcode='22023'; end if;
  select * into v_job from public.wf_ats_job_listings
    where job_listing_id=p_job_listing_id and status='published' and not is_template for share;
  if not found then raise exception 'Published job not found' using errcode='P0002'; end if;
  select * into v_version from public.wf_ats_pipeline_versions
    where id=v_job.pipeline_version_id and employer_id=v_job.employer_id;
  if not found then raise exception 'Published pipeline unavailable' using errcode='23503'; end if;
  if p_invitation_id is not null then
    select * into v_invite from public.wf_ats_candidate_invitations
      where id=p_invitation_id and job_id=v_job.id and employer_id=v_job.employer_id for update;
    if not found or v_invite.status<>'pending' or v_invite.expires_at<=now() or lower(v_invite.email)<>v_email then
      raise exception 'Invitation is unavailable for this verified recipient' using errcode='42501';
    end if;
  end if;
  select p.student_id into v_student_id from public.wf_student_profiles p
    where p.user_id=security.current_legacy_user_id() limit 1;
  for v_node in select value from jsonb_array_elements(v_version.graph_json->'nodes') loop
    if v_node->>'kind'='application_form' then
      for v_field in select value from jsonb_array_elements(coalesce(v_node->'config'->'fields','[]'::jsonb)) loop
        if coalesce((v_field->>'required')::boolean,false) and (
          not coalesce(p_answers,'{}'::jsonb) ? (v_field->>'id') or
          coalesce(btrim(coalesce(p_answers->>(v_field->>'id'),'')),'')='' or
          (v_field->>'type'='checkbox' and coalesce((p_answers->>(v_field->>'id'))::boolean,false)=false)
        ) then raise exception 'Complete all required application fields' using errcode='22023'; end if;
      end loop;
    end if;
  end loop;
  insert into public.wf_ats_applications
    (employer_id,job_id,pipeline_version_id,invitation_id,applicant_auth_user_id,
     identity_type,student_id,external_email,status,answers_json,privacy_notice_version,
     privacy_accepted_at,submitted_at)
  values(v_job.employer_id,v_job.id,v_version.id,case when p_invitation_id is null then null else v_invite.id end,
    v_auth,case when v_student_id is null then 'external' else 'student' end,
    v_student_id,case when v_student_id is null then v_email else null end,'submitted',coalesce(p_answers,'{}'::jsonb),
    btrim(p_privacy_notice_version),now(),now())
  returning * into v_application;
  for v_node in select value from jsonb_array_elements(v_version.graph_json->'nodes') loop
    if v_node->>'kind' not in ('start','end','decision','notification') then
      v_owner:=coalesce(nullif(v_node->'config'->>'ownerRole',''),case when coalesce((v_node->>'candidateVisible')::boolean,false) then 'candidate' else 'recruiter' end);
      insert into public.wf_ats_application_tasks
        (application_id,pipeline_version_id,node_id,stage_id,node_kind,label,instructions,owner_role,
         candidate_visible,required,status,target_hours,submitted_at,evidence_json)
      values(v_application.id,v_version.id,v_node->>'id',nullif(v_node->>'stageId',''),v_node->>'kind',v_node->>'label',
        coalesce(v_node->'config'->>'instructions',''),v_owner,
        coalesce((v_node->>'candidateVisible')::boolean,false),coalesce((v_node->>'required')::boolean,true),
        case when v_node->>'kind'='application_form' then 'submitted' else 'not_started' end,
        nullif(v_node->'config'->>'targetHours','')::integer,
        case when v_node->>'kind'='application_form' then now() else null end,
        case when v_node->>'kind'='application_form' then jsonb_build_object('answerFieldIds',(select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_object_keys(coalesce(p_answers,'{}'::jsonb)) key)) else '{}'::jsonb end);
    end if;
  end loop;
  if p_invitation_id is not null then
    update public.wf_ats_candidate_invitations set status='accepted',accepted_at=now(),updated_at=now() where id=v_invite.id;
    insert into security.wf_ats_application_audit
      (employer_id,application_id,invitation_id,actor_auth_user_id,operation,previous_status,new_status)
    values(v_job.employer_id,v_application.id,v_invite.id,v_auth,'invitation_accepted','pending','accepted');
  end if;
  insert into security.wf_ats_application_audit
    (employer_id,application_id,invitation_id,actor_auth_user_id,actor_user_id,operation,new_status,metadata)
  values(v_job.employer_id,v_application.id,case when p_invitation_id is null then null else v_invite.id end,
    v_auth,security.current_legacy_user_id(),'application_submitted','submitted',jsonb_build_object('pipelineVersionId',v_version.id));
  return v_application;
exception when unique_violation then
  raise exception 'An application already exists for this candidate and job' using errcode='23505';
end;
$$;
revoke all on function public.wf_ats_application_submit(text,uuid,jsonb,text) from public,anon;
grant execute on function public.wf_ats_application_submit(text,uuid,jsonb,text) to authenticated;

create or replace function public.wf_ats_application_withdraw(p_application_id uuid,p_revision integer,p_reason text)
returns public.wf_ats_applications language plpgsql security definer set search_path=''
as $$
declare v_app public.wf_ats_applications%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  select * into v_app from public.wf_ats_applications where id=p_application_id for update;
  if not found or v_app.applicant_auth_user_id<>(select auth.uid()) then raise exception 'Application not found' using errcode='42501'; end if;
  if v_app.status<>'submitted' or v_app.revision<>p_revision then raise exception 'Application is not withdrawable or changed' using errcode='40001'; end if;
  if length(v_reason)<3 or length(v_reason)>500 then raise exception 'Withdrawal reason required' using errcode='22023'; end if;
  update public.wf_ats_applications set status='withdrawn',withdrawn_at=now(),lifecycle_reason=v_reason,
    revision=revision+1,updated_at=now() where id=v_app.id returning * into v_app;
  insert into security.wf_ats_application_audit
    (employer_id,application_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status,reason)
  values(v_app.employer_id,v_app.id,(select auth.uid()),security.current_legacy_user_id(),'application_withdrawn','submitted','withdrawn',v_reason);
  return v_app;
end;
$$;
revoke all on function public.wf_ats_application_withdraw(uuid,integer,text) from public,anon;
grant execute on function public.wf_ats_application_withdraw(uuid,integer,text) to authenticated;

create or replace function public.wf_ats_application_employer_close(
  p_employer_id text,p_application_id uuid,p_revision integer,p_reason text
) returns public.wf_ats_applications language plpgsql security definer set search_path=''
as $$
declare v_app public.wf_ats_applications%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  select * into v_app from public.wf_ats_applications
    where id=p_application_id and employer_id=p_employer_id for update;
  if not found then raise exception 'Application not found' using errcode='P0002'; end if;
  if not security.wf_ats_can_manage_application(v_app.employer_id,v_app.job_id) then raise exception 'Application action denied' using errcode='42501'; end if;
  if v_app.status<>'submitted' or v_app.revision<>p_revision then raise exception 'Application is not closable or changed' using errcode='40001'; end if;
  if length(v_reason)<3 or length(v_reason)>500 then raise exception 'Closure reason required' using errcode='22023'; end if;
  update public.wf_ats_applications set status='employer_closed',closed_at=now(),lifecycle_reason=v_reason,
    revision=revision+1,updated_at=now() where id=v_app.id returning * into v_app;
  insert into security.wf_ats_application_audit
    (employer_id,application_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status,reason)
  values(v_app.employer_id,v_app.id,(select auth.uid()),security.current_legacy_user_id(),'application_employer_closed','submitted','employer_closed',v_reason);
  return v_app;
end;
$$;
revoke all on function public.wf_ats_application_employer_close(text,uuid,integer,text) from public,anon;
grant execute on function public.wf_ats_application_employer_close(text,uuid,integer,text) to authenticated;

create or replace function public.wf_ats_candidate_task_submit(p_task_id uuid,p_revision integer,p_evidence jsonb)
returns public.wf_ats_application_tasks language plpgsql security definer set search_path=''
as $$
declare v_task public.wf_ats_application_tasks%rowtype; v_employer text;
begin
  select t.* into v_task from public.wf_ats_application_tasks t
    join public.wf_ats_applications a on a.id=t.application_id
    where t.id=p_task_id and a.applicant_auth_user_id=(select auth.uid()) and a.status='submitted' for update of t;
  if not found or not v_task.candidate_visible or v_task.owner_role<>'candidate' then raise exception 'Candidate task unavailable' using errcode='42501'; end if;
  select employer_id into v_employer from public.wf_ats_applications where id=v_task.application_id;
  if v_task.revision<>p_revision or v_task.status not in ('not_started','in_progress','review_required') then raise exception 'Task changed or is not submittable' using errcode='40001'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' then raise exception 'Task evidence must be an object' using errcode='22023'; end if;
  update public.wf_ats_application_tasks set status='submitted',evidence_json=coalesce(p_evidence,'{}'::jsonb),
    submitted_at=now(),revision=revision+1,updated_at=now() where id=v_task.id returning * into v_task;
  insert into security.wf_ats_application_audit
    (employer_id,application_id,task_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status)
  values(v_employer,v_task.application_id,v_task.id,(select auth.uid()),security.current_legacy_user_id(),'task_submitted',v_task.status,'submitted');
  return v_task;
end;
$$;
revoke all on function public.wf_ats_candidate_task_submit(uuid,integer,jsonb) from public,anon;
grant execute on function public.wf_ats_candidate_task_submit(uuid,integer,jsonb) to authenticated;

create or replace function public.wf_ats_employer_task_transition(
  p_employer_id text,p_task_id uuid,p_revision integer,p_status text,p_reason text
) returns public.wf_ats_application_tasks language plpgsql security definer set search_path=''
as $$
declare v_task public.wf_ats_application_tasks%rowtype; v_app public.wf_ats_applications%rowtype;
  v_reason text:=btrim(coalesce(p_reason,'')); v_allowed boolean:=false; v_previous text;
begin
  select * into v_task from public.wf_ats_application_tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found' using errcode='P0002'; end if;
  select * into v_app from public.wf_ats_applications where id=v_task.application_id and employer_id=p_employer_id;
  if not found or not security.wf_ats_can_manage_application(v_app.employer_id,v_app.job_id) then raise exception 'Task action denied' using errcode='42501'; end if;
  if v_app.status<>'submitted' or v_task.revision<>p_revision then raise exception 'Task or application changed' using errcode='40001'; end if;
  v_allowed:=(v_task.status='not_started' and p_status in ('in_progress','skipped','review_required'))
    or (v_task.status='in_progress' and p_status in ('completed','skipped','review_required'))
    or (v_task.status='submitted' and p_status in ('completed','in_progress','review_required'))
    or (v_task.status='review_required' and p_status in ('in_progress','completed','skipped'));
  if not v_allowed then raise exception 'Invalid task status transition' using errcode='23514'; end if;
  if length(v_reason)<3 or length(v_reason)>500 then raise exception 'Audit reason required' using errcode='22023'; end if;
  v_previous:=v_task.status;
  update public.wf_ats_application_tasks set status=p_status,revision=revision+1,updated_at=now(),
    completed_at=case when p_status='completed' then now() else null end
    where id=v_task.id returning * into v_task;
  insert into security.wf_ats_application_audit
    (employer_id,application_id,task_id,actor_auth_user_id,actor_user_id,operation,previous_status,new_status,reason)
  values(v_app.employer_id,v_app.id,v_task.id,(select auth.uid()),security.current_legacy_user_id(),'task_transitioned',v_previous,p_status,v_reason);
  return v_task;
end;
$$;
revoke all on function public.wf_ats_employer_task_transition(text,uuid,integer,text,text) from public,anon;
grant execute on function public.wf_ats_employer_task_transition(text,uuid,integer,text,text) to authenticated;

comment on table public.wf_ats_candidate_invitations is 'ATS-03 candidate invitations to apply; never employer membership invitations.';
comment on table public.wf_ats_applications is 'Canonical applicant submission pinned permanently to one published pipeline version.';
comment on table public.wf_ats_application_tasks is 'Per-application node state; target_hours is planning metadata and never an actual deadline until separately assigned.';
