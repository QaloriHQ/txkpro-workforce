-- W12-02: canonical, role-scoped Institution dashboard metrics.

create or replace function public.institution_workforce_summary(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignments jsonb;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution workspace access denied';
  end if;

  v_assignments:=public.institution_micro_cert_assignment_search(
    p_institution_id,null,null,null,null,null,null,null,null
  );

  return (
    with scoped_students as materialized (
      select s.*
      from public.wf_student_profiles s
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and coalesce(s.profile_status,'active')<>'inactive'
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    profile_metrics as (
      select
        count(*) as active_students,
        count(*) filter (where
          nullif(btrim(coalesce(first_name_public,'')),'') is not null
          and nullif(btrim(coalesce(last_initial_public,'')),'') is not null
          and nullif(btrim(coalesce(school_id,'')),'') is not null
          and nullif(btrim(coalesce(cohort_id,'')),'') is not null
          and nullif(btrim(coalesce(primary_trade_id,'')),'') is not null
          and (
            nullif(btrim(coalesce(graduation_date,'')),'') is not null
            or nullif(btrim(coalesce(graduation_year,'')),'') is not null
          )
          and nullif(btrim(coalesce(city,'')),'') is not null
          and nullif(btrim(coalesce(state,'')),'') is not null
          and nullif(btrim(coalesce(availability_status,'')),'') is not null
        ) as complete_students
      from scoped_students
    ),
    skill_metrics as (
      select
        count(*) filter (where ss.status='verified') as verified_skills,
        count(*) filter (
          where ss.status='verified'
            and ss.verified_at>=now()-interval '30 days'
        ) as verified_skills_last_30_days
      from public.wf_student_skills ss
      join scoped_students s on s.student_id=ss.student_id
    ),
    referral_metrics as (
      select
        count(*) filter (where r.status<>'draft') as total_referrals,
        count(*) filter (where r.status in (
          'referred','delivered','viewed','interview_requested',
          'interview_accepted','interview_declined'
        )) as open_referrals,
        count(*) filter (
          where r.status<>'draft'
            and coalesce(r.referred_at,r.created_at)>=now()-interval '30 days'
        ) as referrals_last_30_days
      from public.wf_referrals r
      join scoped_students s on s.student_id=r.student_id
      where r.institution_id=p_institution_id
    ),
    interview_metrics as (
      select
        count(*) filter (where ir.status<>'draft') as total_interviews,
        count(*) filter (where ir.status in (
          'sent','accepted','scheduling','scheduled'
        )) as active_interviews,
        count(*) filter (where ir.status='completed') as completed_interviews
      from public.wf_interview_requests ir
      join scoped_students s on s.student_id=ir.student_id
    ),
    placement_metrics as (
      select
        count(*) as total_hires,
        count(*) filter (where p.status='active') as active_placements
      from public.wf_placements p
      join scoped_students s on s.student_id=p.student_id
    ),
    retention_metrics as (
      select
        count(*) filter (
          where rm.scheduled_for<=now()
            and rm.status not in ('skipped','cancelled')
        ) as eligible_milestones,
        count(*) filter (
          where rm.scheduled_for<=now() and rm.status='responded'
        ) as completed_milestones,
        count(*) filter (
          where rm.scheduled_for<=now()
            and rm.status in ('pending','due','sending','sent','failed')
        ) as due_milestones
      from public.wf_retention_milestones rm
      join public.wf_placements p on p.placement_id=rm.placement_id
      join scoped_students s on s.student_id=p.student_id
    ),
    case_metrics as (
      select
        count(*) filter (where rc.status in (
          'open','assigned','contacted','monitoring'
        )) as open_cases,
        count(*) filter (
          where rc.status in ('open','assigned','contacted','monitoring')
            and rc.severity in ('high','urgent')
        ) as urgent_cases
      from public.wf_retention_cases rc
      join public.wf_placements p on p.placement_id=rc.placement_id
      join scoped_students s on s.student_id=p.student_id
    )
    select jsonb_build_object(
      'activeStudents',pm.active_students,
      'profileCompleteStudents',pm.complete_students,
      'profileCompletionPercent',coalesce(round(
        100.0*pm.complete_students/nullif(pm.active_students,0)
      ),0)::integer,
      'verifiedSkills',sm.verified_skills,
      'verifiedSkillsLast30Days',sm.verified_skills_last_30_days,
      'totalReferrals',rf.total_referrals,
      'openReferrals',rf.open_referrals,
      'referralsLast30Days',rf.referrals_last_30_days,
      'totalInterviews',im.total_interviews,
      'activeInterviews',im.active_interviews,
      'completedInterviews',im.completed_interviews,
      'totalHires',pl.total_hires,
      'activePlacements',pl.active_placements,
      'retentionMilestonesDue',rt.due_milestones,
      'retentionMilestonesCompleted',rt.completed_milestones,
      'retentionMilestoneCompletionPercent',coalesce(round(
        100.0*rt.completed_milestones/nullif(rt.eligible_milestones,0)
      ),0)::integer,
      'openRetentionCases',cm.open_cases,
      'urgentRetentionCases',cm.urgent_cases,
      'availableCourses',jsonb_array_length(
        public.institution_employer_learning_context(p_institution_id)->'courses'
      ),
      'totalAssignments',jsonb_array_length(v_assignments),
      'notStartedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='assigned'
      ),
      'inProgressAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='in_progress'
      ),
      'completedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='completed'
      ),
      'cancelledAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='cancelled'
      ),
      'companyBadgesEarned',(
        select count(*)
        from public.wf_company_badge_awards a
        join scoped_students s on s.student_id=a.student_id
        where a.revoked_at is null
          and (a.expires_at is null or a.expires_at>now())
      ),
      'assessmentExhaustedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where (x->'progress'->'blockedReasons')
          ? 'required_assessment_attempts_exhausted'
      )
    )
    from profile_metrics pm
    cross join skill_metrics sm
    cross join referral_metrics rf
    cross join interview_metrics im
    cross join placement_metrics pl
    cross join retention_metrics rt
    cross join case_metrics cm
  );
end;
$$;

revoke all on function public.institution_workforce_summary(text)
  from public,anon;
grant execute on function public.institution_workforce_summary(text)
  to authenticated,service_role;

comment on function public.institution_workforce_summary(text) is
  'W12-02 canonical Institution dashboard read model. Every metric is derived from canonical records and limited to the caller authorized Institution/Department/Program/Cohort scope; Employer-private evaluations and notes are excluded.';
