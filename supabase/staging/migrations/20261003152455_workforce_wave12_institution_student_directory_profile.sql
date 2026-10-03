-- W12-06: Institution Student directory/profile production read models.
-- These functions keep roster, invitation, evidence provenance, pipeline, and
-- retention data scoped to the caller's Institution role membership.

create or replace function security.institution_can_view_student_invitation(
  p_institution_id text,
  p_scope_type text,
  p_scope_id text
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
      where r.auth_user_id=auth.uid()
        and lower(r.status)='active'
        and security.canonical_institution_role(r.role) is not null
        and security.institution_scope_matches(
          p_institution_id,
          lower(coalesce(p_scope_type,'')),
          p_scope_id
        )
        and security.institution_scope_contains(
          p_institution_id,
          lower(r.scope_type),
          r.scope_id,
          lower(coalesce(p_scope_type,'')),
          p_scope_id
        )
    ),
    false
  );
$$;

create or replace function public.institution_student_directory(
  p_institution_id text,
  p_query text default null,
  p_program_name text default null,
  p_cohort_id text default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text:=lower(nullif(btrim(coalesce(p_query,'')),''));
  v_status text:=lower(nullif(btrim(coalesce(p_status,'')),''));
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution membership required';
  end if;

  return coalesce((
    with roster as (
      select
        'student'::text as record_type,
        s.student_id,
        null::text as membership_key,
        s.user_id,
        arm.auth_user_id,
        coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          nullif(btrim(concat_ws(' ',
            nullif(coalesce(s.first_name_public,''),''),
            nullif(coalesce(s.last_initial_public,''),'')
          )),''),
          s.student_id
        ) as display_name,
        u.email,
        u.phone,
        coalesce(arm.status,'accepted') as invitation_status,
        arm.source as invitation_source,
        arm.created_at as invited_at,
        case when lower(coalesce(arm.status,''))='active' then arm.updated_at end as accepted_at,
        s.profile_status,
        s.availability_status,
        coalesce(c.program_name,s.program_type) as program_name,
        s.cohort_id,
        coalesce(c.name,c.term,s.cohort_id) as cohort_name,
        coalesce(c.trade_id,s.primary_trade_id) as trade_id,
        coalesce(s.graduation_date,c.graduation_date) as graduation_date,
        s.created_at,
        s.updated_at
      from public.wf_student_profiles s
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      left join public.users u on u.user_id=s.user_id
      left join lateral (
        select r.*
        from public.app_role_memberships r
        where lower(r.role)='student'
          and r.user_id=s.user_id
          and lower(r.status)='active'
          and security.institution_can_view_student_invitation(
            p_institution_id,
            lower(r.scope_type),
            r.scope_id
          )
        order by r.updated_at desc nulls last,r.created_at desc nulls last
        limit 1
      ) arm on true
      where security.institution_student_accessible(p_institution_id,s.student_id)
    ),
    invitations as (
      select
        'invitation'::text as record_type,
        s.student_id,
        r.membership_key,
        r.user_id,
        r.auth_user_id,
        coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          u.email,
          r.user_id,
          r.membership_key
        ) as display_name,
        u.email,
        u.phone,
        r.status as invitation_status,
        r.source as invitation_source,
        r.created_at as invited_at,
        null::timestamptz as accepted_at,
        s.profile_status,
        s.availability_status,
        coalesce(c.program_name,s.program_type) as program_name,
        coalesce(s.cohort_id,case when lower(r.scope_type)='cohort' then r.scope_id end) as cohort_id,
        coalesce(c.name,c.term,s.cohort_id,case when lower(r.scope_type)='cohort' then r.scope_id end) as cohort_name,
        coalesce(c.trade_id,s.primary_trade_id) as trade_id,
        coalesce(s.graduation_date,c.graduation_date) as graduation_date,
        r.created_at,
        r.updated_at
      from public.app_role_memberships r
      left join public.users u on u.user_id=r.user_id
      left join public.wf_student_profiles s
        on s.user_id=r.user_id
       and security.institution_student_accessible(
         p_institution_id,
         s.student_id
       )
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where lower(r.role)='student'
        and lower(r.status) in ('pending','invited')
        and security.institution_can_view_student_invitation(
          p_institution_id,
          lower(r.scope_type),
          r.scope_id
        )
    ),
    scoped as (
      select * from roster
      union all
      select * from invitations
    ),
    filtered as (
      select *
      from scoped d
      where (p_program_name is null or d.program_name=p_program_name)
        and (p_cohort_id is null or d.cohort_id=p_cohort_id)
        and (
          v_status is null
          or lower(coalesce(d.invitation_status,''))=v_status
          or lower(coalesce(d.profile_status,''))=v_status
          or d.record_type=v_status
        )
        and (
          v_query is null
          or lower(coalesce(d.display_name,'')) like '%' || v_query || '%'
          or lower(coalesce(d.email,'')) like '%' || v_query || '%'
          or lower(coalesce(d.program_name,'')) like '%' || v_query || '%'
          or lower(coalesce(d.cohort_name,'')) like '%' || v_query || '%'
        )
    )
    select jsonb_agg(jsonb_build_object(
      'recordType',d.record_type,
      'studentId',d.student_id,
      'membershipKey',d.membership_key,
      'userId',d.user_id,
      'authUserId',d.auth_user_id,
      'displayName',d.display_name,
      'email',d.email,
      'phone',d.phone,
      'invitationStatus',d.invitation_status,
      'invitationSource',d.invitation_source,
      'invitedAt',d.invited_at,
      'acceptedAt',d.accepted_at,
      'profileStatus',d.profile_status,
      'availabilityStatus',d.availability_status,
      'programName',d.program_name,
      'cohortId',d.cohort_id,
      'cohortName',d.cohort_name,
      'tradeId',d.trade_id,
      'graduationDate',d.graduation_date,
      'verifiedSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id and ss.status='verified'
      ) end,
      'selfAttestedSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id
          and ss.status='self_attested'
          and ss.provenance='self_attested'
      ) end,
      'inProgressSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id
          and ss.status in ('in_progress','ready_for_review','needs_practice')
      ) end,
      'employerTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id
      ) end,
      'completedTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id and a.status='completed'
      ) end,
      'activeTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id and a.status in ('assigned','in_progress')
      ) end,
      'companyBadgeCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_company_badge_awards a
        where a.student_id=d.student_id
          and a.revoked_at is null
          and (a.expires_at is null or a.expires_at>now())
      ) end,
      'referralCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_referrals r
        where r.institution_id=p_institution_id and r.student_id=d.student_id
      ) end,
      'activeInterviewCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_interview_requests i
        where i.student_id=d.student_id
          and i.status in ('sent','accepted','scheduling','scheduled')
      ) end,
      'placementCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_placements p
        where p.student_id=d.student_id
      ) end,
      'activePlacementCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_placements p
        where p.student_id=d.student_id and p.status in ('pending_start','active')
      ) end,
      'retentionMilestoneDueCount',case when d.student_id is null then 0 else (
        select count(*)
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        where p.student_id=d.student_id
          and m.status in ('pending','due','failed')
      ) end,
      'openRetentionCaseCount',case when d.student_id is null then 0 else (
        select count(*)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        where p.student_id=d.student_id
          and rc.status in ('open','assigned','contacted','monitoring')
      ) end,
      'lastActivityAt',greatest(
        d.updated_at,
        coalesce((select max(a.updated_at) from public.wf_micro_cert_assignments a where a.student_id=d.student_id),d.updated_at),
        coalesce((select max(r.updated_at) from public.wf_referrals r where r.student_id=d.student_id and r.institution_id=p_institution_id),d.updated_at),
        coalesce((select max(i.updated_at) from public.wf_interview_requests i where i.student_id=d.student_id),d.updated_at),
        coalesce((select max(p.updated_at) from public.wf_placements p where p.student_id=d.student_id),d.updated_at)
      )
    ) order by d.record_type,d.display_name)
    from filtered d
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_student_profile(
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
  v_membership public.app_role_memberships%rowtype;
begin
  if not security.institution_student_accessible(p_institution_id,p_student_id) then
    raise exception 'Student outside authorized Institution scope';
  end if;

  select * into v_student
  from public.wf_student_profiles
  where student_id=p_student_id;

  if not found then
    raise exception 'Student not found';
  end if;

  select * into v_cohort
  from public.wf_cohorts
  where cohort_id=v_student.cohort_id;

  if v_student.user_id is not null then
    select * into v_user
    from public.users
    where user_id=v_student.user_id;

    select * into v_membership
    from public.app_role_memberships r
    where lower(r.role)='student'
      and r.user_id=v_student.user_id
      and lower(r.status)='active'
      and security.institution_can_view_student_invitation(
        p_institution_id,
        lower(r.scope_type),
        r.scope_id
      )
    order by r.updated_at desc nulls last,r.created_at desc nulls last
    limit 1;
  end if;

  return jsonb_build_object(
    'student',jsonb_build_object(
      'studentId',v_student.student_id,
      'userId',v_student.user_id,
      'authUserId',v_membership.auth_user_id,
      'displayName',coalesce(
        nullif(btrim(concat_ws(' ',v_user.first_name,v_user.last_name)),''),
        nullif(btrim(coalesce(v_student.preferred_name,'')),''),
        nullif(btrim(concat_ws(' ',
          nullif(coalesce(v_student.first_name_public,''),''),
          nullif(coalesce(v_student.last_initial_public,''),'')
        )),''),
        v_student.student_id
      ),
      'email',v_user.email,
      'phone',v_user.phone,
      'membershipKey',v_membership.membership_key,
      'invitationStatus',coalesce(v_membership.status,'accepted'),
      'invitationSource',v_membership.source,
      'acceptedAt',case when lower(coalesce(v_membership.status,''))='active' then v_membership.updated_at end,
      'programName',coalesce(v_cohort.program_name,v_student.program_type),
      'cohortId',v_student.cohort_id,
      'cohortName',coalesce(v_cohort.name,v_cohort.term,v_student.cohort_id),
      'tradeId',coalesce(v_cohort.trade_id,v_student.primary_trade_id),
      'graduationDate',coalesce(v_student.graduation_date,v_cohort.graduation_date),
      'profileStatus',v_student.profile_status,
      'availabilityStatus',v_student.availability_status,
      'discoverabilityStatus',v_student.discoverability_status,
      'institutionValidationStatus',v_student.institution_validation_status
    ),
    'technicalSkills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentSkillId',ss.student_skill_id,
        'skillId',ss.skill_id,
        'name',sc.name,
        'category',sc.category,
        'tradeId',sc.trade_id,
        'status',ss.status,
        'provenance',ss.provenance,
        'evidenceClass',case
          when ss.status='verified' then 'verified'
          when ss.provenance='self_attested' then 'self_attested'
          else 'in_progress'
        end,
        'selfAttestedAt',ss.self_attested_at,
        'verifiedAt',ss.verified_at,
        'verifiedByName',coalesce(
          nullif(btrim(concat_ws(' ',vu.first_name,vu.last_name)),''),
          vu.email,
          ss.verified_by_user_id
        )
      ) order by
        case when ss.status='verified' then 0 when ss.provenance='self_attested' then 1 else 2 end,
        sc.category,
        sc.name)
      from public.wf_student_skills ss
      join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
      left join public.users vu on vu.user_id=ss.verified_by_user_id
      where ss.student_id=p_student_id
        and ss.status<>'revoked'
    ),'[]'::jsonb),
    'readinessEvidence',public.student_profile_readiness_evidence(
      p_student_id,p_institution_id
    ),
    'employerTraining',public.institution_micro_cert_assignment_search(
      p_institution_id,null,p_student_id,null,null,null,null,null,null
    ),
    'referrals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'referralId',r.referral_id,
        'employerId',r.employer_id,
        'employerName',ctr.business_name,
        'hiringNeedId',r.hiring_need_id,
        'status',r.status,
        'referredAt',r.referred_at,
        'deliveredAt',r.delivered_at,
        'viewedAt',r.viewed_at,
        'closedAt',r.closed_at
      ) order by coalesce(r.referred_at,r.created_at) desc)
      from public.wf_referrals r
      join public.contractors ctr on ctr.contractor_id=r.employer_id
      where r.institution_id=p_institution_id
        and r.student_id=p_student_id
    ),'[]'::jsonb),
    'interviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'interviewRequestId',ir.interview_request_id,
        'referralId',ir.referral_id,
        'hiringNeedId',ir.hiring_need_id,
        'employerId',ir.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',ir.role_title,
        'tradeId',ir.trade_id,
        'status',ir.status,
        'sentAt',ir.sent_at,
        'respondedAt',ir.responded_at,
        'scheduledFor',ir.scheduled_for,
        'completedAt',ir.completed_at,
        'interviewFormat',ir.interview_format
      ) order by coalesce(ir.scheduled_for,ir.sent_at,ir.created_at) desc)
      from public.wf_interview_requests ir
      join public.contractors ctr on ctr.contractor_id=ir.employer_id
      where ir.student_id=p_student_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
        'referralId',p.referral_id,
        'interviewRequestId',p.interview_request_id,
        'hiringNeedId',p.hiring_need_id,
        'employerId',p.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',p.role_title,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at,
        'endedAt',p.ended_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.contractors ctr on ctr.contractor_id=p.employer_id
      where p.student_id=p_student_id
    ),'[]'::jsonb),
    'retention',jsonb_build_object(
      'milestones',coalesce((
        select jsonb_agg(jsonb_build_object(
          'milestoneId',m.milestone_id,
          'placementId',p.placement_id,
          'employerName',ctr.business_name,
          'roleTitle',p.role_title,
          'dayNumber',m.day_number,
          'scheduledFor',m.scheduled_for,
          'status',m.status,
          'sentAt',m.sent_at,
          'responseReceivedAt',m.response_received_at
        ) order by m.scheduled_for desc)
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
      ),'[]'::jsonb),
      'cases',coalesce((
        select jsonb_agg(jsonb_build_object(
          'caseId',rc.case_id,
          'placementId',p.placement_id,
          'milestoneId',rc.milestone_id,
          'employerName',ctr.business_name,
          'roleTitle',p.role_title,
          'severity',rc.severity,
          'status',rc.status,
          'openedAt',rc.opened_at,
          'resolvedAt',rc.resolved_at,
          'resolutionCode',rc.resolution_code
        ) order by rc.opened_at desc)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
      ),'[]'::jsonb)
    ),
    'activity',coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityType',activity_type,
        'title',title,
        'status',status,
        'occurredAt',occurred_at,
        'sourceId',source_id
      ) order by occurred_at desc)
      from (
        select
          'employer_training'::text as activity_type,
          concat('Employer Training: ',mc.title) as title,
          a.status,
          coalesce(a.completed_at,a.started_at,a.assigned_at,a.created_at) as occurred_at,
          a.assignment_id as source_id
        from public.wf_micro_cert_assignments a
        join public.wf_employer_micro_certs mc on mc.micro_cert_id=a.micro_cert_id
        where a.student_id=p_student_id
        union all
        select
          'referral',
          concat('Referral: ',ctr.business_name),
          r.status,
          coalesce(r.referred_at,r.created_at),
          r.referral_id
        from public.wf_referrals r
        join public.contractors ctr on ctr.contractor_id=r.employer_id
        where r.student_id=p_student_id
          and r.institution_id=p_institution_id
        union all
        select
          'interview',
          concat('Interview: ',ctr.business_name),
          ir.status,
          coalesce(ir.scheduled_for,ir.sent_at,ir.created_at),
          ir.interview_request_id
        from public.wf_interview_requests ir
        join public.contractors ctr on ctr.contractor_id=ir.employer_id
        where ir.student_id=p_student_id
        union all
        select
          'placement',
          concat('Placement: ',ctr.business_name),
          p.status,
          coalesce(p.started_at,p.created_at),
          p.placement_id
        from public.wf_placements p
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
        union all
        select
          'retention',
          concat('Retention day ',m.day_number::text),
          m.status,
          coalesce(m.response_received_at,m.sent_at,m.scheduled_for),
          m.milestone_id
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        where p.student_id=p_student_id
      ) activity
      limit 25
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function security.institution_can_view_student_invitation(text,text,text)
from public,anon,authenticated;
grant execute on function security.institution_can_view_student_invitation(text,text,text)
to service_role;

revoke all on function public.institution_student_directory(
  text,text,text,text,text
) from public,anon;
revoke all on function public.institution_student_profile(text,text)
from public,anon;

grant execute on function public.institution_student_directory(
  text,text,text,text,text
) to authenticated,service_role;
grant execute on function public.institution_student_profile(text,text)
to authenticated,service_role;

comment on function public.institution_student_directory(text,text,text,text,text) is
  'Institution-scoped Student roster and pending Student invitation read model. Accepted invitations link to canonical user/student membership state; pending invitations are visible only inside the caller scope.';
comment on function public.institution_student_profile(text,text) is
  'Institution-scoped Student profile read model with visibly separate verified, self-attested, Employer Training, referral, interview, placement, retention, and permitted activity evidence. Employer-private notes, interview evaluations, and raw retention responses are excluded.';
