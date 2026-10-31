-- ATS-01 / #332: tenant-scoped job hiring-team and operational-crew assignments.
-- Assignments communicate responsibility only; they grant no role or data access.
create table public.wf_ats_job_hiring_team (
  job_id uuid not null references public.wf_ats_job_listings(id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id),
  user_id text not null references public.users(user_id),
  responsibility text not null default 'Hiring team' check (length(responsibility) between 1 and 80),
  assigned_by text not null references public.users(user_id),
  assigned_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index wf_ats_job_hiring_team_employer on public.wf_ats_job_hiring_team(employer_id);
create index wf_ats_job_hiring_team_user on public.wf_ats_job_hiring_team(user_id);

create table public.wf_ats_job_crews (
  job_id uuid not null references public.wf_ats_job_listings(id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id),
  crew_id uuid not null references public.wf_employer_crews(id) on delete cascade,
  assigned_by text not null references public.users(user_id),
  assigned_at timestamptz not null default now(),
  primary key (job_id, crew_id)
);
create index wf_ats_job_crews_employer on public.wf_ats_job_crews(employer_id);
create index wf_ats_job_crews_crew on public.wf_ats_job_crews(crew_id);

alter table public.wf_ats_job_hiring_team enable row level security;
alter table public.wf_ats_job_crews enable row level security;
revoke all on public.wf_ats_job_hiring_team, public.wf_ats_job_crews from public, anon, authenticated, service_role;

create function security.wf_ats_job_workspace(p_employer text, p_job uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare can_manage boolean;
begin
  perform security.pro_actor();
  if not exists (
    select 1 from public.wf_ats_job_listings j
    where j.id=p_job and j.employer_id=p_employer
      and (
        security.has_employer_role(p_employer, array['employer_owner','employer_admin','recruiter','employer_read_only'])
        or (
          security.has_employer_role(p_employer, array['hiring_manager'])
          and j.assigned_hiring_manager_user_id = security.current_legacy_user_id()
        )
      )
  ) then
    raise exception 'Job workspace scope denied' using errcode='42501';
  end if;
  can_manage := security.has_employer_role(p_employer, array['employer_owner','employer_admin','recruiter']);
  return jsonb_build_object(
    'canManageAssignments', can_manage,
    'people', coalesce((select jsonb_agg(jsonb_build_object('userId',q.user_id,'name',q.name,'role',q.role) order by q.name) from (
      select distinct on (u.user_id) u.user_id, coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Team member') name, m.role
      from public.app_role_memberships m join public.users u on u.user_id=m.user_id
      where m.scope_id=p_employer and m.scope_type in ('employer','contractor') and lower(m.status)='active' and lower(u.status)='active'
        and m.role in ('employer_owner','contractor_owner','employer_admin','recruiter','contractor_recruiter','hiring_manager')
      order by u.user_id
    ) q), '[]'::jsonb),
    'hiringTeamUserIds', coalesce((select jsonb_agg(t.user_id order by t.assigned_at) from public.wf_ats_job_hiring_team t where t.job_id=p_job and t.employer_id=p_employer), '[]'::jsonb),
    'crews', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'memberCount',(select count(*) from public.wf_employer_crew_members cm where cm.crew_id=c.id)) order by lower(c.name)) from public.wf_employer_crews c where c.employer_id=p_employer), '[]'::jsonb),
    'crewIds', coalesce((select jsonb_agg(jc.crew_id order by jc.assigned_at) from public.wf_ats_job_crews jc where jc.job_id=p_job and jc.employer_id=p_employer), '[]'::jsonb)
  );
end $$;

create function security.wf_ats_job_assignment_action(input jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor text := security.pro_actor(); employer text := input->>'employerId'; job uuid; people text[]; crews uuid[];
begin
  if jsonb_typeof(input) is distinct from 'object' or input->>'op' is distinct from 'replace' then raise exception 'Invalid assignment action'; end if;
  job := (input->>'jobId')::uuid;
  if jsonb_typeof(input->'hiringTeamUserIds') is distinct from 'array' or jsonb_array_length(input->'hiringTeamUserIds') > 100
    or jsonb_typeof(input->'crewIds') is distinct from 'array' or jsonb_array_length(input->'crewIds') > 100 then raise exception 'Invalid assignment selection'; end if;
  if not security.has_employer_role(employer,array['employer_owner','employer_admin','recruiter'])
    or not exists(select 1 from public.wf_ats_job_listings j where j.id=job and j.employer_id=employer) then raise exception 'Assignment scope denied' using errcode='42501'; end if;
  people := array(select jsonb_array_elements_text(input->'hiringTeamUserIds'));
  crews := array(select value::uuid from jsonb_array_elements_text(input->'crewIds') value);
  if cardinality(people) <> (select count(distinct value) from unnest(people) value)
    or exists(select 1 from unnest(people) person where not exists(select 1 from public.app_role_memberships m join public.users u on u.user_id=m.user_id where m.user_id=person and m.scope_id=employer and m.scope_type in ('employer','contractor') and lower(m.status)='active' and lower(u.status)='active' and m.role in ('employer_owner','contractor_owner','employer_admin','recruiter','contractor_recruiter','hiring_manager')))
    or cardinality(crews) <> (select count(distinct value) from unnest(crews) value)
    or exists(select 1 from unnest(crews) crew where not exists(select 1 from public.wf_employer_crews c where c.id=crew and c.employer_id=employer)) then raise exception 'Assignment scope denied' using errcode='42501'; end if;
  delete from public.wf_ats_job_hiring_team where job_id=job and employer_id=employer;
  insert into public.wf_ats_job_hiring_team(job_id,employer_id,user_id,assigned_by) select job,employer,value,actor from unnest(people) value;
  delete from public.wf_ats_job_crews where job_id=job and employer_id=employer;
  insert into public.wf_ats_job_crews(job_id,employer_id,crew_id,assigned_by) select job,employer,value,actor from unnest(crews) value;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,employer_id,result,after_json)
    values(auth.uid(),actor,'ATS_JOB_ASSIGNMENTS_REPLACED','ats_job_listing',job::text,'workforce-employer-jobs',employer,'success',jsonb_build_object('hiringTeamCount',cardinality(people),'crewCount',cardinality(crews)));
  return security.wf_ats_job_workspace(employer,job);
end $$;

create function public.wf_ats_job_workspace(p_employer text,p_job uuid) returns jsonb language sql security invoker set search_path='' as $$select security.wf_ats_job_workspace(p_employer,p_job)$$;
create function public.wf_ats_job_assignment_action(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.wf_ats_job_assignment_action(p_input)$$;
revoke all on function security.wf_ats_job_workspace(text,uuid),security.wf_ats_job_assignment_action(jsonb),public.wf_ats_job_workspace(text,uuid),public.wf_ats_job_assignment_action(jsonb) from public,anon,authenticated,service_role;
grant execute on function security.wf_ats_job_workspace(text,uuid),security.wf_ats_job_assignment_action(jsonb),public.wf_ats_job_workspace(text,uuid),public.wf_ats_job_assignment_action(jsonb) to authenticated;
