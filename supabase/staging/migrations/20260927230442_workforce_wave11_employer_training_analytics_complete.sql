-- W11-10 reporting expansion. All row selection begins with the employer's
-- course versions; the response contains aggregate counts and dimension labels only.
create or replace function public.employer_training_analytics_v2(
  p_employer_id text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_micro_cert_version_id text default null,
  p_institution_id text default null,
  p_program_name text default null,
  p_cohort_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Training analytics denied';
  end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception 'Invalid analytics date range';
  end if;

  with employer_versions as (
    select v.micro_cert_version_id, v.version_number, m.micro_cert_id, m.title
    from public.wf_employer_micro_certs m
    join public.wf_employer_micro_cert_versions v on v.micro_cert_id=m.micro_cert_id
    where m.employer_id=p_employer_id
  ),
  scoped_assignments as (
    select a.assignment_id,a.micro_cert_version_id,a.student_id,a.institution_id,
      a.cohort_id,a.status,a.assigned_at,a.started_at,
      coalesce(i.name,'Institution not recorded') institution_name,
      coalesce(ch.name,'Cohort not recorded') cohort_name,
      coalesce(ch.program_name,'Program not recorded') program_name,
      exists (
        select 1 from public.wf_micro_cert_completions pc
        where pc.assignment_id=a.assignment_id and pc.outcome='passed'
      ) has_passed_completion
    from public.wf_micro_cert_assignments a
    join employer_versions v on v.micro_cert_version_id=a.micro_cert_version_id
    left join public.wf_institutions i on i.institution_id=a.institution_id
    left join public.wf_cohorts ch on ch.cohort_id=a.cohort_id
    where (p_micro_cert_version_id is null or a.micro_cert_version_id=p_micro_cert_version_id)
      and (p_institution_id is null or a.institution_id=p_institution_id)
      and (p_program_name is null or ch.program_name=p_program_name)
      and (p_cohort_id is null or a.cohort_id=p_cohort_id)
  ),
  assignment_cohort as (
    select a.*,
      case
        when a.status='cancelled' then 'cancelled'
        when a.has_passed_completion then 'completed'
        when a.started_at is not null or a.status in ('in_progress','completed') then 'in_progress'
        else 'not_started'
      end lifecycle_state
    from scoped_assignments a
    where (p_from is null or a.assigned_at>=p_from)
      and (p_to is null or a.assigned_at<p_to)
  ),
  lifecycle as (
    select count(*)::integer assigned,
      count(*) filter (where lifecycle_state='not_started')::integer not_started,
      count(*) filter (where lifecycle_state='in_progress')::integer in_progress,
      count(*) filter (where lifecycle_state='completed')::integer completed,
      count(*) filter (where lifecycle_state='cancelled')::integer cancelled
    from assignment_cohort
  ),
  assessment as (
    select count(*) filter (where t.status='passed')::integer passed,
      count(*) filter (where t.status='not_passed')::integer not_passed
    from public.wf_micro_cert_assessment_attempts t
    join scoped_assignments a on a.assignment_id=t.assignment_id
    where t.status in ('passed','not_passed')
      and (p_from is null or t.submitted_at>=p_from)
      and (p_to is null or t.submitted_at<p_to)
  ),
  badges as (
    select count(*) filter (
      where b.revoked_at is null and (b.expires_at is null or b.expires_at>now())
    )::integer active,
      count(*) filter (where b.revoked_at is null and b.expires_at<=now())::integer expired,
      count(*) filter (where b.revoked_at is not null)::integer revoked
    from public.wf_company_badge_awards b
    where b.employer_id=p_employer_id
      and (p_from is null or b.issued_at>=p_from)
      and (p_to is null or b.issued_at<p_to)
      and (
        (p_micro_cert_version_id is null and p_institution_id is null
          and p_program_name is null and p_cohort_id is null)
        or exists (
          select 1 from public.wf_micro_cert_completions c
          join scoped_assignments a on a.assignment_id=c.assignment_id
          where c.completion_id=b.completion_id
        )
      )
  ),
  certifications as (
    select count(*) filter (
      where c.status='active' and (c.expires_at is null or c.expires_at>now())
    )::integer active,
      count(*) filter (where c.status='active' and c.expires_at<=now())::integer expired,
      count(*) filter (where c.status='revoked')::integer revoked
    from public.wf_employer_certification_awards c
    join scoped_assignments a on a.assignment_id=c.assignment_id
    where c.employer_id=p_employer_id
      and (p_from is null or c.issued_at>=p_from)
      and (p_to is null or c.issued_at<p_to)
  ),
  course_rows as (
    select v.micro_cert_id,v.micro_cert_version_id,v.version_number,v.title,
      count(a.assignment_id)::integer assigned,
      count(a.assignment_id) filter (where a.lifecycle_state='not_started')::integer not_started,
      count(a.assignment_id) filter (where a.lifecycle_state='in_progress')::integer in_progress,
      count(a.assignment_id) filter (where a.lifecycle_state='completed')::integer completed,
      count(a.assignment_id) filter (where a.lifecycle_state='cancelled')::integer cancelled
    from employer_versions v
    left join assignment_cohort a on a.micro_cert_version_id=v.micro_cert_version_id
    where p_micro_cert_version_id is null or v.micro_cert_version_id=p_micro_cert_version_id
    group by v.micro_cert_id,v.micro_cert_version_id,v.version_number,v.title
  ),
  recent_days as (
    select (c.completed_at at time zone 'UTC')::date activity_day,
      count(*)::integer completions
    from public.wf_micro_cert_completions c
    join scoped_assignments a on a.assignment_id=c.assignment_id
    where c.outcome='passed'
      and (p_from is null or c.completed_at>=p_from)
      and (p_to is null or c.completed_at<p_to)
    group by 1 order by 1 desc limit 10
  ),
  institution_rows as (
    select a.institution_id id,a.institution_name label,
      count(*)::integer assigned,
      count(*) filter (where a.lifecycle_state='completed')::integer completed
    from assignment_cohort a group by a.institution_id,a.institution_name
  ),
  program_rows as (
    select a.program_name label,count(*)::integer assigned,
      count(*) filter (where a.lifecycle_state='completed')::integer completed
    from assignment_cohort a group by a.program_name
  ),
  cohort_rows as (
    select a.cohort_id id,a.cohort_name label,a.institution_id,a.program_name,
      count(*)::integer assigned,
      count(*) filter (where a.lifecycle_state='completed')::integer completed
    from assignment_cohort a
    group by a.cohort_id,a.cohort_name,a.institution_id,a.program_name
  )
  select jsonb_build_object(
    'lifecycle',(select to_jsonb(l) from lifecycle l),
    'assessments',(select to_jsonb(a) from assessment a),
    'badges',(select to_jsonb(b) from badges b),
    'certifications',(select to_jsonb(c) from certifications c),
    'courses',coalesce((select jsonb_agg(to_jsonb(r) order by r.title,r.version_number)
      from course_rows r),'[]'::jsonb),
    'institutions',coalesce((select jsonb_agg(to_jsonb(r) order by r.label)
      from institution_rows r),'[]'::jsonb),
    'programs',coalesce((select jsonb_agg(to_jsonb(r) order by r.label)
      from program_rows r),'[]'::jsonb),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(r) order by r.label)
      from cohort_rows r),'[]'::jsonb),
    'recentDays',coalesce((select jsonb_agg(
      jsonb_build_object('day',d.activity_day,'completions',d.completions)
      order by d.activity_day desc) from recent_days d),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.employer_training_analytics_v2(
  text,timestamptz,timestamptz,text,text,text,text
) from public,anon;
grant execute on function public.employer_training_analytics_v2(
  text,timestamptz,timestamptz,text,text,text,text
) to authenticated,service_role;
