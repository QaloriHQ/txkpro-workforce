-- W11-02: Employer Learning role and scope authorization helpers.
-- Reuses canonical app_role_memberships; no duplicate RBAC system.

create or replace function security.has_institution_learning_role(
  p_institution_id text,
  p_cohort_id text,
  p_roles text[]
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
      from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and lower(r.role)=any(select lower(x) from unnest(p_roles) x)
        and (
          (lower(r.scope_type)='institution' and r.scope_id=p_institution_id)
          or (
            lower(r.scope_type)='cohort'
            and p_cohort_id is not null
            and r.scope_id=p_cohort_id
            and exists (
              select 1 from public.wf_cohorts c
              where c.cohort_id=p_cohort_id
                and c.institution_id=p_institution_id
            )
          )
          or (
            lower(r.scope_type)='program'
            and p_cohort_id is not null
            and exists (
              select 1 from public.wf_cohorts c
              where c.cohort_id=p_cohort_id
                and c.institution_id=p_institution_id
                and r.scope_id in (c.trade_id,c.program_name)
            )
          )
        )
    ),
    false
  );
$$;

create or replace function security.can_manage_employer_learning_content(
  p_employer_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or (
      security.employer_is_approved(p_employer_id)
      and security.has_employer_role(
        p_employer_id,
        array['employer_owner','employer_admin']
      )
    ),
    false
  );
$$;

create or replace function security.can_view_employer_learning_as_employer(
  p_employer_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or (
      security.employer_is_approved(p_employer_id)
      and security.has_employer_role(
        p_employer_id,
        array[
          'employer_owner','employer_admin','recruiter',
          'hiring_manager','employer_read_only'
        ]
      )
    ),
    false
  );
$$;

create or replace function security.can_view_institution_employer_learning(
  p_institution_id text,
  p_cohort_id text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select security.has_institution_learning_role(
    p_institution_id,
    p_cohort_id,
    array[
      'institution_admin','department_head','program_coordinator',
      'instructor','assistant_instructor','career_services','read_only_analyst','educator'
    ]
  );
$$;

create or replace function security.can_assign_employer_learning(
  p_institution_id text,
  p_cohort_id text,
  p_student_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.has_institution_learning_role(
      p_institution_id,
      p_cohort_id,
      array['institution_admin','department_head','program_coordinator','career_services']
    )
    and exists (
      select 1
      from public.wf_cohorts c
      where c.cohort_id=p_cohort_id
        and c.institution_id=p_institution_id
    )
    and exists (
      select 1
      from public.wf_student_profiles s
      where s.student_id=p_student_id
        and s.school_id=p_institution_id
        and (s.cohort_id is null or s.cohort_id=p_cohort_id)
    ),
    false
  );
$$;

create or replace function security.can_request_employer_learning_production(
  p_institution_id text,
  p_cohort_id text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select security.has_institution_learning_role(
    p_institution_id,
    p_cohort_id,
    array['institution_admin','department_head','program_coordinator','career_services']
  );
$$;

create or replace function security.can_monitor_student_employer_learning(
  p_institution_id text,
  p_cohort_id text,
  p_student_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.can_view_institution_employer_learning(p_institution_id,p_cohort_id)
    and exists (
      select 1
      from public.wf_student_profiles s
      where s.student_id=p_student_id
        and s.school_id=p_institution_id
        and (p_cohort_id is null or s.cohort_id=p_cohort_id)
    ),
    false
  );
$$;

create or replace function security.student_can_access_learning_assignment(
  p_assignment_id text
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
      from public.wf_micro_cert_assignments a
      where a.assignment_id=p_assignment_id
        and a.student_id=security.current_student_id()
    ),
    false
  );
$$;

create or replace function security.can_issue_employer_certification(
  p_employer_id text,
  p_assignment_id text,
  p_completion_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.can_manage_employer_learning_content(p_employer_id)
    and exists (
      select 1
      from public.wf_micro_cert_assignments a
      join public.wf_employer_micro_certs mc
        on mc.micro_cert_id=a.micro_cert_id
      join public.wf_micro_cert_completions c
        on c.assignment_id=a.assignment_id
      where a.assignment_id=p_assignment_id
        and c.completion_id=p_completion_id
        and c.outcome='passed'
        and mc.employer_id=p_employer_id
    ),
    false
  );
$$;

create or replace function security.can_publish_employer_learning_entity(
  p_entity_type text,
  p_entity_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    case lower(p_entity_type)
      when 'employer' then security.can_manage_employer_learning_content(p_entity_id)
      when 'course' then exists (
        select 1
        from public.wf_employer_micro_certs mc
        where mc.micro_cert_id=p_entity_id
          and security.can_manage_employer_learning_content(mc.employer_id)
      )
      when 'lesson' then exists (
        select 1
        from public.wf_employer_micro_cert_lessons l
        join public.wf_employer_micro_cert_versions v
          on v.micro_cert_version_id=l.micro_cert_version_id
        join public.wf_employer_micro_certs mc
          on mc.micro_cert_id=v.micro_cert_id
        where l.lesson_id=p_entity_id
          and security.can_manage_employer_learning_content(mc.employer_id)
      )
      when 'credential' then exists (
        select 1
        from public.wf_employer_certification_awards ca
        where ca.certification_award_id=p_entity_id
          and security.can_manage_employer_learning_content(ca.employer_id)
      )
      else false
    end,
    false
  );
$$;

comment on function security.can_manage_employer_learning_content(text) is
  'Employer Owner/Admin or TXKPRO admin may manage employer-owned courses, lessons, assessments, answer keys, Company Badge definitions, and certification definitions.';
comment on function security.can_assign_employer_learning(text,text,text) is
  'Institution Admin/Department Head/Program Coordinator/Career Services may assign within authorized Institution/cohort scope; Instructors, Assistants, and Analysts are read-only.';
comment on function security.student_can_access_learning_assignment(text) is
  'Student may access only their own Employer Learning assignment; future delivery RPCs must separately suppress assessment answer keys.';
comment on function security.can_issue_employer_certification(text,text,text) is
  'Credential issuance requires authorized Employer content management plus canonical passed completion evidence.';
comment on function security.can_publish_employer_learning_entity(text,text) is
  'Publishing Employer/Course/Lesson/Credential public pages is separate from editing private records and requires Employer Owner/Admin or TXKPRO admin authority.';

revoke all on function security.has_institution_learning_role(text,text,text[]) from public,anon,authenticated;
revoke all on function security.can_manage_employer_learning_content(text) from public,anon,authenticated;
revoke all on function security.can_view_employer_learning_as_employer(text) from public,anon,authenticated;
revoke all on function security.can_view_institution_employer_learning(text,text) from public,anon,authenticated;
revoke all on function security.can_assign_employer_learning(text,text,text) from public,anon,authenticated;
revoke all on function security.can_request_employer_learning_production(text,text) from public,anon,authenticated;
revoke all on function security.can_monitor_student_employer_learning(text,text,text) from public,anon,authenticated;
revoke all on function security.student_can_access_learning_assignment(text) from public,anon,authenticated;
revoke all on function security.can_issue_employer_certification(text,text,text) from public,anon,authenticated;
revoke all on function security.can_publish_employer_learning_entity(text,text) from public,anon,authenticated;

grant execute on function security.has_institution_learning_role(text,text,text[]) to service_role;
grant execute on function security.can_manage_employer_learning_content(text) to service_role;
grant execute on function security.can_view_employer_learning_as_employer(text) to service_role;
grant execute on function security.can_view_institution_employer_learning(text,text) to service_role;
grant execute on function security.can_assign_employer_learning(text,text,text) to service_role;
grant execute on function security.can_request_employer_learning_production(text,text) to service_role;
grant execute on function security.can_monitor_student_employer_learning(text,text,text) to service_role;
grant execute on function security.student_can_access_learning_assignment(text) to service_role;
grant execute on function security.can_issue_employer_certification(text,text,text) to service_role;
grant execute on function security.can_publish_employer_learning_entity(text,text) to service_role;
