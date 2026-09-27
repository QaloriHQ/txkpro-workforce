-- W11-10: aggregate Employer Training analytics. No student identifiers leave this RPC.
create or replace function public.employer_training_analytics(
  p_employer_id text,
  p_from timestamptz default null,
  p_to timestamptz default null
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
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_id=m.micro_cert_id
    where m.employer_id=p_employer_id
  ),
  assignment_cohort as (
    select a.assignment_id, a.micro_cert_version_id, a.status
    from public.wf_micro_cert_assignments a
    join employer_versions v on v.micro_cert_version_id=a.micro_cert_version_id
    where (p_from is null or a.assigned_at >= p_from)
      and (p_to is null or a.assigned_at < p_to)
  ),
  lifecycle as (
    select count(*)::integer assigned,
      count(*) filter (where status='assigned')::integer not_started,
      count(*) filter (where status='in_progress')::integer in_progress,
      count(*) filter (where status='completed')::integer completed,
      count(*) filter (where status='cancelled')::integer cancelled
    from assignment_cohort
  ),
  assessment as (
    select count(*) filter (where t.status='passed')::integer passed,
      count(*) filter (where t.status='not_passed')::integer not_passed
    from public.wf_micro_cert_assessment_attempts t
    join public.wf_micro_cert_assignments a on a.assignment_id=t.assignment_id
    join employer_versions v on v.micro_cert_version_id=a.micro_cert_version_id
    where t.status in ('passed','not_passed')
      and (p_from is null or t.submitted_at >= p_from)
      and (p_to is null or t.submitted_at < p_to)
  ),
  badges as (
    select count(*) filter (
      where b.revoked_at is null and (b.expires_at is null or b.expires_at > now())
    )::integer active,
    count(*) filter (
      where b.revoked_at is null and b.expires_at <= now()
    )::integer expired,
    count(*) filter (where b.revoked_at is not null)::integer revoked
    from public.wf_company_badge_awards b
    where b.employer_id=p_employer_id
      and (p_from is null or b.issued_at >= p_from)
      and (p_to is null or b.issued_at < p_to)
  ),
  certifications as (
    select count(*) filter (
      where c.status='active' and (c.expires_at is null or c.expires_at > now())
    )::integer active,
    count(*) filter (
      where c.status='active' and c.expires_at <= now()
    )::integer expired,
    count(*) filter (where c.status='revoked')::integer revoked
    from public.wf_employer_certification_awards c
    where c.employer_id=p_employer_id
      and (p_from is null or c.issued_at >= p_from)
      and (p_to is null or c.issued_at < p_to)
  ),
  course_rows as (
    select v.micro_cert_id, v.micro_cert_version_id, v.version_number, v.title,
      count(a.assignment_id)::integer assigned,
      count(a.assignment_id) filter (where a.status='assigned')::integer not_started,
      count(a.assignment_id) filter (where a.status='in_progress')::integer in_progress,
      count(a.assignment_id) filter (where a.status='completed')::integer completed,
      count(a.assignment_id) filter (where a.status='cancelled')::integer cancelled
    from employer_versions v
    left join assignment_cohort a on a.micro_cert_version_id=v.micro_cert_version_id
    group by v.micro_cert_id,v.micro_cert_version_id,v.version_number,v.title
  ),
  recent_days as (
    select (a.completed_at at time zone 'UTC')::date as activity_day, count(*)::integer as completions
    from public.wf_micro_cert_assignments a
    join employer_versions v on v.micro_cert_version_id=a.micro_cert_version_id
    where a.status='completed' and a.completed_at is not null
      and (p_from is null or a.completed_at >= p_from)
      and (p_to is null or a.completed_at < p_to)
    group by 1 order by 1 desc limit 10
  )
  select jsonb_build_object(
    'lifecycle',(select to_jsonb(l) from lifecycle l),
    'assessments',(select to_jsonb(a) from assessment a),
    'badges',(select to_jsonb(b) from badges b),
    'certifications',(select to_jsonb(c) from certifications c),
    'courses',coalesce((select jsonb_agg(to_jsonb(r) order by r.title,r.version_number)
      from course_rows r),'[]'::jsonb),
    'recentDays',coalesce((select jsonb_agg(
      jsonb_build_object('day',d.activity_day,'completions',d.completions)
      order by d.activity_day desc) from recent_days d),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.employer_training_analytics(text,timestamptz,timestamptz)
from public,anon;
grant execute on function public.employer_training_analytics(text,timestamptz,timestamptz)
to authenticated,service_role;
