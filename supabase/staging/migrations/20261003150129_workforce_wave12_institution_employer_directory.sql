-- W12-04: Institution-facing Employer directory and detail.
-- Exposes intentionally shared Employer partner information and scoped outcome
-- read models without Employer-private notes, interview evaluations, raw
-- retention responses, or retention case notes.

create or replace function security.institution_employer_accessible(
  p_institution_id text,
  p_employer_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.institution_learning_has_any_scope(p_institution_id)
    and security.employer_is_approved(p_employer_id)
    and exists(
      select 1
      from public.wf_employer_talent_scopes ts
      where ts.employer_id=p_employer_id
        and ts.active=true
        and (
          ts.institution_id=p_institution_id
          or exists(
            select 1
            from public.wf_cohorts c
            where c.institution_id=p_institution_id
              and security.can_view_institution_employer_learning(
                p_institution_id,c.cohort_id
              )
              and (
                ts.cohort_id=c.cohort_id
                or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
                  lower(nullif(btrim(coalesce(c.trade_id,'')),''))
                or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
                  lower(nullif(btrim(coalesce(c.program_name,'')),''))
              )
          )
        )
    ),
    false
  );
$$;

create or replace function public.institution_employers_directory(
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
    raise exception 'Institution Employer directory access denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employerId',e.employer_id,
      'employerName',e.employer_name,
      'approvalStatus',e.approval_status,
      'accountStatus',e.account_status,
      'city',e.city,
      'state',e.state,
      'website',e.website,
      'foundingPartnerStatus',e.founding_partner_status,
      'tradeIds',e.trade_ids,
      'hiringNeedCount',e.hiring_need_count,
      'microCertCount',e.micro_cert_count,
      'referralCount',e.referral_count,
      'activeReferralCount',e.active_referral_count,
      'placementCount',e.placement_count,
      'activePlacementCount',e.active_placement_count,
      'retentionCaseCount',e.retention_case_count,
      'openRetentionCaseCount',e.open_retention_case_count,
      'exposureEventCount',e.exposure_event_count,
      'lastActivityAt',e.last_activity_at
    ) order by e.employer_name)
    from (
      select
        ctr.contractor_id as employer_id,
        ctr.business_name as employer_name,
        ctr.approval_status,
        ctr.account_status,
        coalesce(wp.city,'') as city,
        coalesce(wp.state,'') as state,
        ctr.website,
        wp.founding_partner_status,
        coalesce(wp.trade_ids_json,'[]'::jsonb) as trade_ids,
        (
          select count(*)
          from public.wf_hiring_needs h
          where h.employer_id=ctr.contractor_id
            and h.status='active'
            and h.visibility='institution_shared'
        ) as hiring_need_count,
        (
          select count(distinct mc.micro_cert_id)
          from public.wf_employer_micro_certs mc
          join public.wf_employer_micro_cert_versions v
            on v.micro_cert_version_id=mc.current_version_id
          where mc.employer_id=ctr.contractor_id
            and mc.active=true
            and v.status in ('ready','live')
            and exists(
              select 1
              from public.wf_student_profiles s
              join public.wf_cohorts c on c.cohort_id=s.cohort_id
              where s.school_id=p_institution_id
                and c.institution_id=p_institution_id
                and security.can_view_institution_employer_learning(
                  p_institution_id,c.cohort_id
                )
                and security.student_is_eligible_for_employer_micro_cert(
                  mc.micro_cert_id,p_institution_id,s.student_id
                )
            )
        ) as micro_cert_count,
        (
          select count(*)
          from public.wf_referrals r
          where r.institution_id=p_institution_id
            and r.employer_id=ctr.contractor_id
            and security.institution_student_accessible(
              p_institution_id,r.student_id
            )
        ) as referral_count,
        (
          select count(*)
          from public.wf_referrals r
          where r.institution_id=p_institution_id
            and r.employer_id=ctr.contractor_id
            and r.status in (
              'delivered','viewed','interview_requested','interview_accepted'
            )
            and security.institution_student_accessible(
              p_institution_id,r.student_id
            )
        ) as active_referral_count,
        (
          select count(*)
          from public.wf_placements p
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as placement_count,
        (
          select count(*)
          from public.wf_placements p
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and p.status='active'
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as active_placement_count,
        (
          select count(*)
          from public.wf_retention_cases rc
          join public.wf_placements p on p.placement_id=rc.placement_id
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as retention_case_count,
        (
          select count(*)
          from public.wf_retention_cases rc
          join public.wf_placements p on p.placement_id=rc.placement_id
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and rc.status in ('open','assigned','contacted','monitoring')
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as open_retention_case_count,
        (
          select count(*)
          from public.wf_employer_exposure_events x
          where x.employer_id=ctr.contractor_id
            and x.institution_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,x.student_id
            )
        ) as exposure_event_count,
        greatest(
          coalesce((
            select max(r.updated_at)
            from public.wf_referrals r
            where r.institution_id=p_institution_id
              and r.employer_id=ctr.contractor_id
              and security.institution_student_accessible(
                p_institution_id,r.student_id
              )
          ),'epoch'::timestamptz),
          coalesce((
            select max(p.updated_at)
            from public.wf_placements p
            join public.wf_student_profiles s on s.student_id=p.student_id
            where p.employer_id=ctr.contractor_id
              and s.school_id=p_institution_id
              and security.institution_student_accessible(
                p_institution_id,p.student_id
              )
          ),'epoch'::timestamptz),
          coalesce((
            select max(a.updated_at)
            from public.wf_micro_cert_assignments a
            join public.wf_employer_micro_certs mc
              on mc.micro_cert_id=a.micro_cert_id
            where mc.employer_id=ctr.contractor_id
              and a.institution_id=p_institution_id
              and a.cohort_id is not null
              and security.can_view_institution_employer_learning(
                p_institution_id,a.cohort_id
              )
          ),'epoch'::timestamptz)
        ) as last_activity_at
      from public.contractors ctr
      left join public.wf_contractor_profiles wp
        on wp.contractor_id=ctr.contractor_id
      where security.institution_employer_accessible(
        p_institution_id,ctr.contractor_id
      )
        and ctr.account_status not in ('suspended','closed')
    ) e
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_employer_detail(
  p_institution_id text,
  p_employer_id text
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
  if not security.institution_employer_accessible(
    p_institution_id,p_employer_id
  ) then
    raise exception 'Employer not found in Institution scope';
  end if;

  select jsonb_build_object(
    'employerId',ctr.contractor_id,
    'employerName',ctr.business_name,
    'approvalStatus',ctr.approval_status,
    'accountStatus',ctr.account_status,
    'website',ctr.website,
    'description',ctr.description,
    'businessEmail',ctr.business_email,
    'businessPhone',ctr.business_phone,
    'city',wp.city,
    'state',wp.state,
    'county',wp.county,
    'dispatchRadiusMiles',wp.dispatch_radius_miles,
    'serviceArea',coalesce(wp.service_area_json,'{}'::jsonb),
    'tradeIds',coalesce(wp.trade_ids_json,'[]'::jsonb),
    'hiringRoles',coalesce(wp.hiring_roles_json,'[]'::jsonb),
    'annualHiringVolume',wp.annual_hiring_volume,
    'hiringHorizon',wp.hiring_horizon,
    'workforceDescription',wp.workforce_description,
    'foundingPartnerStatus',wp.founding_partner_status,
    'talentScopes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'talentScopeId',ts.talent_scope_id,
        'institutionId',ts.institution_id,
        'cohortId',ts.cohort_id,
        'cohortName',coalesce(c.name,c.term,c.cohort_id),
        'tradeId',ts.trade_id,
        'programName',ts.program_name,
        'startsAt',ts.starts_at,
        'endsAt',ts.ends_at
      ) order by coalesce(c.program_name,ts.program_name,''),coalesce(c.name,c.term,ts.cohort_id,''))
      from public.wf_employer_talent_scopes ts
      left join public.wf_cohorts c on c.cohort_id=ts.cohort_id
      where ts.employer_id=ctr.contractor_id
        and ts.active=true
        and (
          ts.institution_id=p_institution_id
          or exists(
            select 1
            from public.wf_cohorts ac
            where ac.institution_id=p_institution_id
              and security.can_view_institution_employer_learning(
                p_institution_id,ac.cohort_id
              )
              and (
                ts.cohort_id=ac.cohort_id
                or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
                  lower(nullif(btrim(coalesce(ac.trade_id,'')),''))
                or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
                  lower(nullif(btrim(coalesce(ac.program_name,'')),''))
              )
          )
        )
    ),'[]'::jsonb),
    'hiringNeeds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'hiringNeedId',h.hiring_need_id,
        'title',h.title,
        'tradeId',h.trade_id,
        'roleType',h.role_type,
        'targetHires',h.target_hires,
        'targetHireDate',h.target_hire_date,
        'workTypes',coalesce(h.work_types_json,'[]'::jsonb),
        'shifts',coalesce(h.shifts_json,'[]'::jsonb),
        'requiredVerifiedSkills',coalesce(h.required_verified_skills_json,'[]'::jsonb),
        'optionalVerifiedSkills',coalesce(h.optional_verified_skills_json,'[]'::jsonb),
        'minimumVerifiedSkillCount',h.minimum_verified_skill_count,
        'requiresDriversLicense',h.requires_drivers_license,
        'requiresDrivingRecordAttestation',h.requires_driving_record_attestation,
        'requiresBackgroundWillingness',h.requires_background_willingness,
        'requiresDrugScreenWillingness',h.requires_drug_screen_willingness,
        'sharedNotes',h.shared_notes,
        'status',h.status,
        'updatedAt',h.updated_at
      ) order by h.updated_at desc,h.title)
      from public.wf_hiring_needs h
      where h.employer_id=ctr.contractor_id
        and h.status='active'
        and h.visibility='institution_shared'
    ),'[]'::jsonb),
    'microCerts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'title',mc.title,
        'description',mc.description,
        'microCertVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'contentType',v.content_type,
        'durationMinutes',v.duration_minutes,
        'companyBadge',case when cb.company_badge_id is null then null else
          jsonb_build_object(
            'companyBadgeId',cb.company_badge_id,
            'title',cb.title,
            'version',cb.version,
            'active',cb.active
          )
        end,
        'eligibleStudentCount',(
          select count(*)
          from public.wf_student_profiles s
          join public.wf_cohorts c on c.cohort_id=s.cohort_id
          where s.school_id=p_institution_id
            and c.institution_id=p_institution_id
            and security.can_view_institution_employer_learning(
              p_institution_id,c.cohort_id
            )
            and security.student_is_eligible_for_employer_micro_cert(
              mc.micro_cert_id,p_institution_id,s.student_id
            )
        ),
        'assignmentCount',(
          select count(*)
          from public.wf_micro_cert_assignments a
          where a.institution_id=p_institution_id
            and a.micro_cert_id=mc.micro_cert_id
            and a.status<>'cancelled'
            and a.cohort_id is not null
            and security.can_view_institution_employer_learning(
              p_institution_id,a.cohort_id
            )
        ),
        'completedCount',(
          select count(*)
          from public.wf_micro_cert_assignments a
          where a.institution_id=p_institution_id
            and a.micro_cert_id=mc.micro_cert_id
            and a.status='completed'
            and a.cohort_id is not null
            and security.can_view_institution_employer_learning(
              p_institution_id,a.cohort_id
            )
        )
      ) order by mc.title)
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=mc.current_version_id
      left join public.wf_company_badges cb
        on cb.company_badge_id=v.company_badge_id
      where mc.employer_id=ctr.contractor_id
        and mc.active=true
        and v.status in ('ready','live')
        and exists(
          select 1
          from public.wf_student_profiles s
          join public.wf_cohorts c on c.cohort_id=s.cohort_id
          where s.school_id=p_institution_id
            and c.institution_id=p_institution_id
            and security.can_view_institution_employer_learning(
              p_institution_id,c.cohort_id
            )
            and security.student_is_eligible_for_employer_micro_cert(
              mc.micro_cert_id,p_institution_id,s.student_id
            )
        )
    ),'[]'::jsonb),
    'referrals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'referralId',r.referral_id,
        'studentId',r.student_id,
        'studentName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          r.student_id
        ),
        'program',coalesce(c.program_name,s.program_type),
        'cohortName',coalesce(c.name,c.term,s.cohort_id),
        'hiringNeedId',r.hiring_need_id,
        'hiringNeedTitle',h.title,
        'status',r.status,
        'referralConsentStatus',r.referral_consent_status,
        'referredAt',r.referred_at,
        'updatedAt',r.updated_at
      ) order by r.updated_at desc)
      from public.wf_referrals r
      join public.wf_student_profiles s on s.student_id=r.student_id
      left join public.users u on u.user_id=s.user_id
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
      where r.institution_id=p_institution_id
        and r.employer_id=ctr.contractor_id
        and security.institution_student_accessible(
          p_institution_id,r.student_id
        )
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
        'studentId',p.student_id,
        'studentName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          p.student_id
        ),
        'roleTitle',p.role_title,
        'tradeId',p.trade_id,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.wf_student_profiles s on s.student_id=p.student_id
      left join public.users u on u.user_id=s.user_id
      where p.employer_id=ctr.contractor_id
        and s.school_id=p_institution_id
        and security.institution_student_accessible(
          p_institution_id,p.student_id
        )
    ),'[]'::jsonb),
    'retention',jsonb_build_object(
      'milestones',coalesce((
        select jsonb_agg(jsonb_build_object(
          'milestoneId',rm.milestone_id,
          'placementId',rm.placement_id,
          'dayNumber',rm.day_number,
          'status',rm.status,
          'scheduledFor',rm.scheduled_for,
          'sentAt',rm.sent_at,
          'responseReceivedAt',rm.response_received_at
        ) order by rm.scheduled_for desc)
        from public.wf_retention_milestones rm
        join public.wf_placements p on p.placement_id=rm.placement_id
        join public.wf_student_profiles s on s.student_id=p.student_id
        where p.employer_id=ctr.contractor_id
          and s.school_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,p.student_id
          )
      ),'[]'::jsonb),
      'cases',coalesce((
        select jsonb_agg(jsonb_build_object(
          'caseId',rc.case_id,
          'placementId',rc.placement_id,
          'milestoneId',rc.milestone_id,
          'severity',rc.severity,
          'status',rc.status,
          'summary',rc.summary,
          'openedAt',rc.opened_at,
          'resolvedAt',rc.resolved_at,
          'resolutionCode',rc.resolution_code
        ) order by rc.opened_at desc)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        join public.wf_student_profiles s on s.student_id=p.student_id
        where p.employer_id=ctr.contractor_id
          and s.school_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,p.student_id
          )
      ),'[]'::jsonb)
    ),
    'exposure',coalesce((
      select jsonb_agg(jsonb_build_object(
        'exposureEventId',event.exposure_event_id,
        'studentId',event.student_id,
        'eventType',event.event_type,
        'sourceType',event.source_type,
        'sourceId',event.source_id,
        'microCertId',event.micro_cert_id,
        'assignmentId',event.assignment_id,
        'occurredAt',event.occurred_at
      ) order by event.occurred_at desc)
      from (
        select x.*
        from public.wf_employer_exposure_events x
        where x.employer_id=ctr.contractor_id
          and x.institution_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,x.student_id
          )
        order by x.occurred_at desc
        limit 50
      ) event
    ),'[]'::jsonb)
  )
  into v_result
  from public.contractors ctr
  left join public.wf_contractor_profiles wp
    on wp.contractor_id=ctr.contractor_id
  where ctr.contractor_id=p_employer_id;

  if v_result is null then
    raise exception 'Employer not found in Institution scope';
  end if;

  return v_result;
end;
$$;

revoke all on function security.institution_employer_accessible(text,text)
  from public,anon,authenticated;
revoke all on function public.institution_employers_directory(text)
  from public,anon;
revoke all on function public.institution_employer_detail(text,text)
  from public,anon;

grant execute on function security.institution_employer_accessible(text,text)
  to service_role;
grant execute on function public.institution_employers_directory(text)
  to authenticated,service_role;
grant execute on function public.institution_employer_detail(text,text)
  to authenticated,service_role;

comment on function security.institution_employer_accessible(text,text) is
  'W12-04 server-side Institution-to-Employer scope predicate. Requires Institution role/scope, approved Employer, and active talent scope overlap.';
comment on function public.institution_employers_directory(text) is
  'W12-04 Institution Employer directory read model. Shows approved partner summaries and scoped outcome counts only.';
comment on function public.institution_employer_detail(text,text) is
  'W12-04 Institution Employer detail read model. Excludes Employer-private notes/evaluations, raw retention responses, and retention case notes.';
