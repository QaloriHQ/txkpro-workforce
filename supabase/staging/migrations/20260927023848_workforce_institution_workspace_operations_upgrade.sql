
-- Institution workspace operational UX support after W11-09.
-- Preserves canonical role/scope authorization and keeps Employer Training,
-- Company Badges, and Instructor Verified Skills as distinct evidence classes.

-- Staging/demo eligibility: make the existing Safety Readiness course available
-- to the Texarkana College Electrical cohort for new assignments.
do $$
begin
  if exists(
    select 1 from public.wf_employer_micro_certs
    where micro_cert_id='EMC-FB31AC3BF3AA'
  ) and exists(
    select 1 from public.wf_cohorts
    where cohort_id='COH-STG-ELEC-2027'
      and institution_id='INS-STG-TC'
  ) then
    if exists(
      select 1
      from public.wf_employer_micro_cert_eligibility e
      where e.micro_cert_id='EMC-FB31AC3BF3AA'
        and coalesce(e.institution_id,'')='INS-STG-TC'
        and coalesce(e.cohort_id,'')='COH-STG-ELEC-2027'
        and coalesce(e.trade_id,'')='electrical'
        and coalesce(e.program_name,'')='Electrical Technology'
    ) then
      update public.wf_employer_micro_cert_eligibility
      set active=true, updated_at=now()
      where micro_cert_id='EMC-FB31AC3BF3AA'
        and coalesce(institution_id,'')='INS-STG-TC'
        and coalesce(cohort_id,'')='COH-STG-ELEC-2027'
        and coalesce(trade_id,'')='electrical'
        and coalesce(program_name,'')='Electrical Technology';
    else
      insert into public.wf_employer_micro_cert_eligibility(
        eligibility_id,micro_cert_id,institution_id,cohort_id,trade_id,
        program_name,active,created_by_user_id,created_at,updated_at
      ) values(
        security.new_legacy_id('MCE'),
        'EMC-FB31AC3BF3AA',
        'INS-STG-TC',
        'COH-STG-ELEC-2027',
        'electrical',
        'Electrical Technology',
        true,
        'USR-DEMO-INSTRUCTOR',
        now(),
        now()
      );
    end if;
  end if;
end;
$$;

create or replace function security.institution_student_accessible(
  p_institution_id text,
  p_student_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(exists(
    select 1
    from public.wf_student_profiles s
    join public.wf_cohorts c on c.cohort_id=s.cohort_id
    where s.student_id=p_student_id
      and s.school_id=p_institution_id
      and c.institution_id=p_institution_id
      and security.can_view_institution_employer_learning(
        p_institution_id,c.cohort_id
      )
  ),false);
$$;

create or replace function public.institution_micro_cert_assignment_search(
  p_institution_id text,
  p_status text default null,
  p_student_id text default null,
  p_query text default null,
  p_employer_id text default null,
  p_micro_cert_id text default null,
  p_program_name text default null,
  p_cohort_id text default null,
  p_company_badge_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_status text:=nullif(lower(btrim(coalesce(p_status,''))),'');
  v_query text:=nullif(lower(btrim(coalesce(p_query,''))),'');
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  if v_status is not null
     and v_status not in ('assigned','in_progress','completed','cancelled') then
    raise exception 'Invalid assignment status';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'assignmentId',a.assignment_id,
        'microCertId',a.micro_cert_id,
        'microCertVersionId',a.micro_cert_version_id,
        'courseTitle',mc.title,
        'versionNumber',v.version_number,
        'courseStatus',v.status,
        'employerId',mc.employer_id,
        'employerName',ctr.business_name,
        'studentId',a.student_id,
        'studentName',coalesce(
          nullif(btrim(concat_ws(' ',su.first_name,su.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          a.student_id
        ),
        'institutionId',a.institution_id,
        'cohortId',a.cohort_id,
        'cohortName',coalesce(c.name,c.term,c.cohort_id),
        'programName',coalesce(c.program_name,s.program_type),
        'tradeId',coalesce(c.trade_id,s.primary_trade_id),
        'assignedByUserId',a.assigned_by_user_id,
        'assignedByName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          a.assigned_by_user_id
        ),
        'status',a.status,
        'assignedAt',a.assigned_at,
        'startedAt',a.started_at,
        'completedAt',a.completed_at,
        'cancelledAt',a.cancelled_at,
        'lastActivityAt',activity.last_activity_at,
        'metadata',a.metadata,
        'progress',eval.evaluation,
        'latestCompletion',case when lc.completion_id is null then null else
          jsonb_build_object(
            'completionId',lc.completion_id,
            'attemptNumber',lc.attempt_number,
            'outcome',lc.outcome,
            'score',lc.score,
            'completedAt',lc.completed_at
          )
        end,
        'companyBadge',case when cb.company_badge_id is null then null else
          jsonb_build_object(
            'companyBadgeId',cb.company_badge_id,
            'title',cb.title,
            'version',cb.version,
            'active',cb.active,
            'expiresAfterDays',cb.expires_after_days
          )
        end,
        'companyBadgeAward',case when cba.company_badge_award_id is null then null else
          jsonb_build_object(
            'companyBadgeAwardId',cba.company_badge_award_id,
            'issuedAt',cba.issued_at,
            'expiresAt',cba.expires_at,
            'revokedAt',cba.revoked_at,
            'status',case
              when cba.revoked_at is not null then 'revoked'
              when cba.expires_at is not null and cba.expires_at<=now() then 'expired'
              else 'active'
            end
          )
        end
      )
      order by coalesce(activity.last_activity_at,a.assigned_at) desc,a.assignment_id
    )
    from public.wf_micro_cert_assignments a
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
    join public.contractors ctr
      on ctr.contractor_id=mc.employer_id
    join public.wf_student_profiles s
      on s.student_id=a.student_id
    left join public.users su
      on su.user_id=s.user_id
    left join public.wf_cohorts c
      on c.cohort_id=a.cohort_id
    left join public.users u
      on u.user_id=a.assigned_by_user_id
    left join public.wf_company_badges cb
      on cb.company_badge_id=v.company_badge_id
    left join lateral (
      select cc.*
      from public.wf_micro_cert_completions cc
      where cc.assignment_id=a.assignment_id
      order by cc.attempt_number desc,cc.completed_at desc
      limit 1
    ) lc on true
    left join lateral (
      select ba.*
      from public.wf_company_badge_awards ba
      where ba.student_id=a.student_id
        and ba.micro_cert_version_id=a.micro_cert_version_id
        and (
          v.company_badge_id is null
          or ba.company_badge_id=v.company_badge_id
        )
      order by ba.issued_at desc,ba.created_at desc
      limit 1
    ) cba on true
    left join lateral (
      select security.employer_training_completion_evaluation(
        a.assignment_id
      ) as evaluation
    ) eval on true
    left join lateral (
      select max(ts) as last_activity_at
      from (
        select a.assigned_at as ts
        union all select a.started_at
        union all
          select max(lp.last_viewed_at)
          from public.wf_micro_cert_lesson_progress lp
          where lp.assignment_id=a.assignment_id
        union all
          select max(cr.submitted_at)
          from public.wf_micro_cert_checkpoint_responses cr
          where cr.assignment_id=a.assignment_id
        union all
          select max(aa.updated_at)
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=a.assignment_id
        union all select lc.completed_at
        union all select cba.issued_at
      ) z
      where ts is not null
    ) activity on true
    where a.institution_id=p_institution_id
      and a.cohort_id is not null
      and security.can_view_institution_employer_learning(
        p_institution_id,a.cohort_id
      )
      and (v_status is null or a.status=v_status)
      and (p_student_id is null or a.student_id=p_student_id)
      and (p_employer_id is null or mc.employer_id=p_employer_id)
      and (p_micro_cert_id is null or a.micro_cert_id=p_micro_cert_id)
      and (p_program_name is null or lower(coalesce(c.program_name,s.program_type,''))=lower(p_program_name))
      and (p_cohort_id is null or a.cohort_id=p_cohort_id)
      and (
        p_company_badge_id is null
        or v.company_badge_id=p_company_badge_id
        or cba.company_badge_id=p_company_badge_id
      )
      and (
        v_query is null
        or lower(coalesce(mc.title,'')) like '%'||v_query||'%'
        or lower(coalesce(ctr.business_name,'')) like '%'||v_query||'%'
        or lower(coalesce(c.program_name,s.program_type,'')) like '%'||v_query||'%'
        or lower(coalesce(c.name,c.term,'')) like '%'||v_query||'%'
        or lower(coalesce(
          nullif(btrim(concat_ws(' ',su.first_name,su.last_name)),''),
          s.preferred_name,
          s.first_name_public,
          a.student_id
        )) like '%'||v_query||'%'
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_micro_cert_assignment_detail(
  p_institution_id text,
  p_assignment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_summary jsonb;
  v_student_user_id text;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  select *
  into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=p_assignment_id
    and a.institution_id=p_institution_id;

  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_assignment.cohort_id is null
     or not security.can_view_institution_employer_learning(
       p_institution_id,v_assignment.cohort_id
     ) then
    raise exception 'Assignment outside authorized Institution scope';
  end if;

  select x
  into v_summary
  from jsonb_array_elements(
    public.institution_micro_cert_assignment_search(
      p_institution_id,null,v_assignment.student_id,null,null,
      v_assignment.micro_cert_id,null,v_assignment.cohort_id,null
    )
  ) x
  where x->>'assignmentId'=p_assignment_id
  limit 1;

  select s.user_id into v_student_user_id
  from public.wf_student_profiles s
  where s.student_id=v_assignment.student_id;

  return jsonb_build_object(
    'assignment',v_summary,
    'lessons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lessonId',l.lesson_id,
        'title',l.title,
        'sequenceNo',l.sequence_no,
        'required',l.required,
        'estimatedMinutes',l.estimated_minutes,
        'status',l.status,
        'startedAt',lp.started_at,
        'lastViewedAt',lp.last_viewed_at,
        'completedAt',lp.completed_at
      ) order by l.sequence_no,l.lesson_id)
      from public.wf_employer_micro_cert_lessons l
      left join public.wf_micro_cert_lesson_progress lp
        on lp.assignment_id=v_assignment.assignment_id
       and lp.lesson_id=l.lesson_id
      where l.micro_cert_version_id=v_assignment.micro_cert_version_id
        and l.status in ('ready','published')
    ),'[]'::jsonb),
    'checkpoints',coalesce((
      select jsonb_agg(jsonb_build_object(
        'checkpointId',cp.checkpoint_id,
        'title',coalesce(cp.title,'Checkpoint '||cp.sequence_no::text),
        'sequenceNo',cp.sequence_no,
        'required',cp.required,
        'weight',cp.weight,
        'satisfied',coalesce(r.score,0)>=100,
        'latestScore',r.score,
        'submittedAt',r.submitted_at
      ) order by cp.sequence_no,cp.checkpoint_id)
      from public.wf_employer_micro_cert_checkpoints cp
      left join lateral (
        select cr.score,cr.submitted_at
        from public.wf_micro_cert_checkpoint_responses cr
        where cr.assignment_id=v_assignment.assignment_id
          and cr.checkpoint_id=cp.checkpoint_id
        order by cr.attempt_number desc,cr.submitted_at desc
        limit 1
      ) r on true
      where cp.micro_cert_version_id=v_assignment.micro_cert_version_id
    ),'[]'::jsonb),
    'assessments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentId',asm.assessment_id,
        'title',asm.title,
        'assessmentType',asm.assessment_type,
        'sequenceNo',asm.sequence_no,
        'required',asm.required,
        'passingScore',asm.passing_score,
        'maxAttempts',asm.max_attempts,
        'attemptCount',(
          select count(*)
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=asm.assessment_id
        ),
        'passed',exists(
          select 1
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=asm.assessment_id
            and aa.status='passed'
        ),
        'latestAttempt',(
          select jsonb_build_object(
            'attemptNumber',aa.attempt_number,
            'status',aa.status,
            'score',aa.score,
            'startedAt',aa.started_at,
            'submittedAt',aa.submitted_at,
            'gradedAt',aa.graded_at
          )
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=asm.assessment_id
          order by aa.attempt_number desc,aa.created_at desc
          limit 1
        )
      ) order by asm.sequence_no,asm.assessment_id)
      from public.wf_employer_micro_cert_assessments asm
      where asm.micro_cert_version_id=v_assignment.micro_cert_version_id
    ),'[]'::jsonb),
    'notifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'notificationId',n.notification_id,
        'eventType',n.event_type,
        'channel',n.channel,
        'status',n.status,
        'createdAt',n.created_at,
        'updatedAt',n.updated_at
      ) order by n.created_at desc)
      from public.wf_notifications n
      where n.recipient_user_id=v_student_user_id
        and n.target_type='micro_cert_assignment'
        and n.target_id=v_assignment.assignment_id
    ),'[]'::jsonb),
    'activity',coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventType',e.event_type,
        'targetType',e.target_type,
        'result',e.result,
        'createdAt',e.created_at
      ) order by e.created_at desc)
      from public.wf_domain_events e
      where e.institution_id=p_institution_id
        and e.student_id=v_assignment.student_id
        and e.event_type in (
          'MICRO_CERT_ASSIGNED',
          'EMPLOYER_TRAINING_STARTED',
          'MICRO_CERT_COMPLETED',
          'COMPANY_BADGE_AWARDED'
        )
        and (
          e.target_id=v_assignment.assignment_id
          or e.metadata->>'assignment_id'=v_assignment.assignment_id
        )
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_company_badge_evidence(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Company Badge access denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'companyBadgeId',b.company_badge_id,
      'title',b.title,
      'description',b.description,
      'version',b.version,
      'active',b.active,
      'expiresAfterDays',b.expires_after_days,
      'employerId',b.employer_id,
      'employerName',ctr.business_name,
      'linkedCourses',coalesce((
        select jsonb_agg(distinct jsonb_build_object(
          'microCertId',mc.micro_cert_id,
          'title',mc.title,
          'microCertVersionId',v.micro_cert_version_id,
          'versionNumber',v.version_number,
          'status',v.status
        ))
        from public.wf_employer_micro_cert_versions v
        join public.wf_employer_micro_certs mc
          on mc.micro_cert_id=v.micro_cert_id
        where v.company_badge_id=b.company_badge_id
          and (
            exists(
              select 1
              from public.wf_employer_micro_cert_eligibility el
              join public.wf_student_profiles s
                on s.school_id=p_institution_id
              join public.wf_cohorts c
                on c.cohort_id=s.cohort_id
               and c.institution_id=p_institution_id
              where el.micro_cert_id=mc.micro_cert_id
                and el.active=true
                and (el.institution_id is null or el.institution_id=p_institution_id)
                and (el.cohort_id is null or el.cohort_id=s.cohort_id)
                and (el.trade_id is null or lower(el.trade_id)=lower(coalesce(c.trade_id,'')))
                and (el.program_name is null or lower(el.program_name)=lower(coalesce(c.program_name,'')))
                and security.can_view_institution_employer_learning(
                  p_institution_id,c.cohort_id
                )
            )
            or exists(
              select 1
              from public.wf_micro_cert_assignments a
              where a.institution_id=p_institution_id
                and a.micro_cert_version_id=v.micro_cert_version_id
                and a.cohort_id is not null
                and security.can_view_institution_employer_learning(
                  p_institution_id,a.cohort_id
                )
            )
          )
      ),'[]'::jsonb),
      'awards',coalesce((
        select jsonb_agg(jsonb_build_object(
          'companyBadgeAwardId',a.company_badge_award_id,
          'studentId',a.student_id,
          'studentName',coalesce(
            nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
            nullif(btrim(coalesce(s.preferred_name,'')),''),
            concat_ws(' ',
              nullif(btrim(coalesce(s.first_name_public,'')),''),
              nullif(btrim(coalesce(s.last_initial_public,'')),'')
            ),
            a.student_id
          ),
          'microCertId',a.micro_cert_id,
          'microCertVersionId',a.micro_cert_version_id,
          'issuedAt',a.issued_at,
          'expiresAt',a.expires_at,
          'revokedAt',a.revoked_at,
          'status',case
            when a.revoked_at is not null then 'revoked'
            when a.expires_at is not null and a.expires_at<=now() then 'expired'
            else 'active'
          end,
          'evidenceType',a.evidence_type,
          'evidenceId',a.evidence_id
        ) order by a.issued_at desc)
        from public.wf_company_badge_awards a
        join public.wf_student_profiles s on s.student_id=a.student_id
        left join public.users u on u.user_id=s.user_id
        join public.wf_cohorts c on c.cohort_id=s.cohort_id
        where a.company_badge_id=b.company_badge_id
          and s.school_id=p_institution_id
          and c.institution_id=p_institution_id
          and security.can_view_institution_employer_learning(
            p_institution_id,c.cohort_id
          )
      ),'[]'::jsonb)
    ) order by ctr.business_name,b.title,b.version)
    from public.wf_company_badges b
    join public.contractors ctr on ctr.contractor_id=b.employer_id
    where exists(
      select 1
      from public.wf_employer_micro_cert_versions v
      join public.wf_employer_micro_certs mc
        on mc.micro_cert_id=v.micro_cert_id
      where v.company_badge_id=b.company_badge_id
        and (
          exists(
            select 1
            from public.wf_employer_micro_cert_eligibility el
            join public.wf_student_profiles s
              on s.school_id=p_institution_id
            join public.wf_cohorts c
              on c.cohort_id=s.cohort_id
             and c.institution_id=p_institution_id
            where el.micro_cert_id=mc.micro_cert_id
              and el.active=true
              and (el.institution_id is null or el.institution_id=p_institution_id)
              and (el.cohort_id is null or el.cohort_id=s.cohort_id)
              and (el.trade_id is null or lower(el.trade_id)=lower(coalesce(c.trade_id,'')))
              and (el.program_name is null or lower(el.program_name)=lower(coalesce(c.program_name,'')))
              and security.can_view_institution_employer_learning(
                p_institution_id,c.cohort_id
              )
          )
          or exists(
            select 1
            from public.wf_micro_cert_assignments a
            where a.institution_id=p_institution_id
              and a.micro_cert_version_id=v.micro_cert_version_id
              and a.cohort_id is not null
              and security.can_view_institution_employer_learning(
                p_institution_id,a.cohort_id
              )
          )
        )
    )
  ),'[]'::jsonb);
end;
$$;

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

  return jsonb_build_object(
    'activeStudents',(
      select count(*)
      from public.wf_student_profiles s
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and coalesce(s.profile_status,'active')<>'inactive'
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    'verifiedSkills',(
      select count(*)
      from public.wf_student_skills ss
      join public.wf_student_profiles s on s.student_id=ss.student_id
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and ss.status='verified'
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    'availableCourses',jsonb_array_length(
      public.institution_employer_learning_context(p_institution_id)->'courses'
    ),
    'totalAssignments',jsonb_array_length(v_assignments),
    'notStartedAssignments',(
      select count(*)
      from jsonb_array_elements(v_assignments) x
      where x->>'status'='assigned'
    ),
    'inProgressAssignments',(
      select count(*)
      from jsonb_array_elements(v_assignments) x
      where x->>'status'='in_progress'
    ),
    'completedAssignments',(
      select count(*)
      from jsonb_array_elements(v_assignments) x
      where x->>'status'='completed'
    ),
    'cancelledAssignments',(
      select count(*)
      from jsonb_array_elements(v_assignments) x
      where x->>'status'='cancelled'
    ),
    'companyBadgesEarned',(
      select count(*)
      from public.wf_company_badge_awards a
      join public.wf_student_profiles s on s.student_id=a.student_id
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at>now())
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    'assessmentExhaustedAssignments',(
      select count(*)
      from jsonb_array_elements(v_assignments) x
      where (x->'progress'->'blockedReasons') ? 'required_assessment_attempts_exhausted'
    ),
    'activeInterviews',(
      select count(*)
      from public.wf_interview_requests ir
      join public.wf_student_profiles s on s.student_id=ir.student_id
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and ir.status in ('sent','accepted','scheduled')
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    'activePlacements',(
      select count(*)
      from public.wf_placements p
      join public.wf_student_profiles s on s.student_id=p.student_id
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and p.status='active'
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    )
  );
end;
$$;

create or replace function public.institution_student_readiness_summary(
  p_institution_id text,
  p_student_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_student public.wf_student_profiles%rowtype;
  v_cohort public.wf_cohorts%rowtype;
  v_user public.users%rowtype;
begin
  if not security.institution_student_accessible(
    p_institution_id,p_student_id
  ) then
    raise exception 'Student outside authorized Institution scope';
  end if;

  select * into v_student
  from public.wf_student_profiles
  where student_id=p_student_id;

  select * into v_cohort
  from public.wf_cohorts
  where cohort_id=v_student.cohort_id;

  if v_student.user_id is not null then
    select * into v_user
    from public.users
    where user_id=v_student.user_id;
  end if;

  return jsonb_build_object(
    'student',jsonb_build_object(
      'studentId',v_student.student_id,
      'displayName',coalesce(
        nullif(btrim(concat_ws(' ',v_user.first_name,v_user.last_name)),''),
        nullif(btrim(coalesce(v_student.preferred_name,'')),''),
        concat_ws(' ',
          nullif(btrim(coalesce(v_student.first_name_public,'')),''),
          nullif(btrim(coalesce(v_student.last_initial_public,'')),'')
        ),
        v_student.student_id
      ),
      'programName',coalesce(v_cohort.program_name,v_student.program_type),
      'cohortId',v_student.cohort_id,
      'cohortName',coalesce(v_cohort.name,v_cohort.term,v_student.cohort_id),
      'graduationDate',v_student.graduation_date,
      'profileStatus',v_student.profile_status,
      'availabilityStatus',v_student.availability_status
    ),
    'verifiedSkills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentSkillId',ss.student_skill_id,
        'skillId',ss.skill_id,
        'name',sc.name,
        'category',sc.category,
        'tradeId',sc.trade_id,
        'verifiedAt',ss.verified_at,
        'provenance',ss.provenance
      ) order by sc.category,sc.name)
      from public.wf_student_skills ss
      join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
      where ss.student_id=p_student_id
        and ss.status='verified'
    ),'[]'::jsonb),
    'employerTraining',public.institution_micro_cert_assignment_search(
      p_institution_id,null,p_student_id,null,null,null,null,null,null
    ),
    'companyBadges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'companyBadgeAwardId',a.company_badge_award_id,
        'companyBadgeId',a.company_badge_id,
        'title',coalesce(a.metadata->>'badgeTitle',b.title),
        'employerName',ctr.business_name,
        'issuedAt',a.issued_at,
        'expiresAt',a.expires_at,
        'revokedAt',a.revoked_at,
        'status',case
          when a.revoked_at is not null then 'revoked'
          when a.expires_at is not null and a.expires_at<=now() then 'expired'
          else 'active'
        end,
        'evidenceType',a.evidence_type,
        'evidenceId',a.evidence_id,
        'microCertVersionId',a.micro_cert_version_id
      ) order by a.issued_at desc)
      from public.wf_company_badge_awards a
      join public.wf_company_badges b on b.company_badge_id=a.company_badge_id
      join public.contractors ctr on ctr.contractor_id=a.employer_id
      where a.student_id=p_student_id
    ),'[]'::jsonb),
    'interviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'interviewRequestId',ir.interview_request_id,
        'employerId',ir.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',ir.role_title,
        'status',ir.status,
        'scheduledFor',ir.scheduled_for,
        'interviewFormat',ir.interview_format
      ) order by coalesce(ir.scheduled_for,ir.sent_at) desc)
      from public.wf_interview_requests ir
      join public.contractors ctr on ctr.contractor_id=ir.employer_id
      where ir.student_id=p_student_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
        'employerId',p.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',p.role_title,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.contractors ctr on ctr.contractor_id=p.employer_id
      where p.student_id=p_student_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function security.institution_student_accessible(text,text)
from public,anon,authenticated;
grant execute on function security.institution_student_accessible(text,text)
to service_role;

revoke all on function public.institution_micro_cert_assignment_search(
  text,text,text,text,text,text,text,text,text
) from public,anon;
revoke all on function public.institution_micro_cert_assignment_detail(text,text)
from public,anon;
revoke all on function public.institution_company_badge_evidence(text)
from public,anon;
revoke all on function public.institution_workforce_summary(text)
from public,anon;
revoke all on function public.institution_student_readiness_summary(text,text)
from public,anon;

grant execute on function public.institution_micro_cert_assignment_search(
  text,text,text,text,text,text,text,text,text
) to authenticated,service_role;
grant execute on function public.institution_micro_cert_assignment_detail(text,text)
to authenticated,service_role;
grant execute on function public.institution_company_badge_evidence(text)
to authenticated,service_role;
grant execute on function public.institution_workforce_summary(text)
to authenticated,service_role;
grant execute on function public.institution_student_readiness_summary(text,text)
to authenticated,service_role;

comment on function public.institution_micro_cert_assignment_detail(text,text) is
  'Institution-scoped Employer Training assignment detail. Exposes explainable progress, safe lesson/checkpoint/assessment status, notification status, Company Badge evidence, and audit event types without assessment answer keys or Employer-private notes.';
