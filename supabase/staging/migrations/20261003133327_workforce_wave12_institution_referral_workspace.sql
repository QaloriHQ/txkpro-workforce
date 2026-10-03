-- W12-03: production Institution referral workspace.
-- Institution-facing referral RPCs re-check role/scope server-side and expose
-- only policy-approved shared referral evidence plus employer outcome state.

create or replace function public.institution_create_referral(
  p_institution_id text,
  p_student_id text,
  p_employer_id text,
  p_hiring_need_id text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student public.wf_student_profiles%rowtype;
  v_referral_id text:=security.new_legacy_id('REF');
  v_technical jsonb;
  v_operational jsonb;
  v_company_training jsonb;
  v_consent jsonb;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_note_violation text;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution referral permission required';
  end if;

  if not security.employer_is_approved(p_employer_id) then
    raise exception 'Employer is not approved';
  end if;

  select * into v_student
  from public.wf_student_profiles
  where student_id=p_student_id
    and school_id=p_institution_id;
  if not found then
    raise exception 'Student not found in Institution scope';
  end if;

  if not security.institution_student_accessible(p_institution_id,p_student_id) then
    raise exception 'Student outside authorized Institution scope';
  end if;

  if not exists(
    select 1
    from public.wf_employer_talent_scopes ts
    left join public.wf_cohorts c on c.cohort_id=v_student.cohort_id
    where ts.employer_id=p_employer_id
      and ts.active=true
      and (
        ts.institution_id=p_institution_id
        or ts.cohort_id=v_student.cohort_id
        or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
          lower(nullif(btrim(coalesce(v_student.primary_trade_id,'')),''))
        or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
          lower(nullif(btrim(coalesce(c.program_name,v_student.program_type,'')),''))
      )
  ) then
    raise exception 'Employer is outside Institution referral scope';
  end if;

  v_consent:=security.student_referral_consent_status(
    p_student_id,p_institution_id
  );
  if coalesce((v_consent->>'allowed')::boolean,false) is not true then
    raise exception 'Student referral consent required';
  end if;

  v_note_violation:=security.referral_note_policy_violation(v_note);
  if v_note_violation is not null then
    raise exception 'Referral note violates D-09 policy: %', v_note_violation;
  end if;

  if p_hiring_need_id is not null and not exists(
    select 1
    from public.wf_hiring_needs h
    where h.hiring_need_id=p_hiring_need_id
      and h.employer_id=p_employer_id
      and h.status='active'
      and h.visibility='institution_shared'
  ) then
    raise exception 'Hiring need is not available to Institution referrals';
  end if;

  select jsonb_build_object(
    'verifiedSkillCount',count(*),
    'verifiedSkills',coalesce(jsonb_agg(jsonb_build_object(
      'skillId',sc.skill_id,
      'name',sc.name,
      'category',sc.category,
      'tradeId',sc.trade_id,
      'provenance',ss.provenance,
      'verifiedAt',ss.verified_at
    ) order by sc.name),'[]'::jsonb)
  )
  into v_technical
  from public.wf_student_skills ss
  join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
  where ss.student_id=p_student_id
    and ss.status='verified';

  select jsonb_build_object(
    'driversLicense',l.driver_license_status,
    'drivingRecordAttestation',l.driving_record_attestation,
    'backgroundScreenWillingness',l.background_screen_willingness,
    'drugScreenWillingness',l.drug_screen_willingness,
    'workTypes',coalesce(l.work_types_json,'[]'::jsonb),
    'shifts',coalesce(l.shifts_json,'[]'::jsonb),
    'provenance',coalesce(l.provenance_json,'{}'::jsonb)
  )
  into v_operational
  from public.wf_student_logistics l
  where l.student_id=p_student_id
  limit 1;

  v_company_training:=security.referral_company_training_snapshot(
    p_institution_id,p_student_id,p_employer_id
  );

  insert into public.wf_referrals(
    referral_id,institution_id,student_id,employer_id,hiring_need_id,
    created_by_user_id,institution_shared_note,technical_snapshot,
    professional_snapshot,operational_snapshot,company_training_snapshot,
    referral_consent_status,referral_consent_source,referral_consent_checked_at,
    referral_note_policy,referral_note_visibility,status,referred_at,delivered_at
  ) values(
    v_referral_id,p_institution_id,p_student_id,p_employer_id,p_hiring_need_id,
    security.current_legacy_user_id(),v_note,coalesce(v_technical,'{}'::jsonb),
    '{}'::jsonb,coalesce(v_operational,'{}'::jsonb),v_company_training,
    v_consent->>'status',v_consent->>'source',now(),
    case when v_note is null then null else 'institution_shared_referral_note_v1' end,
    'employer_visible','delivered',now(),now()
  );

  perform security.emit_workforce_event(
    'REFERRAL_CREATED','referral',v_referral_id,p_employer_id,p_institution_id,
    p_student_id,null,
    jsonb_build_object(
      'status','delivered',
      'hiringNeedId',p_hiring_need_id,
      'referralConsent',v_consent,
      'notePolicy',case when v_note is null then null else 'institution_shared_referral_note_v1' end
    ),
    jsonb_build_object('source','institution_create_referral'),
    'success',
    'referral_created:'||v_referral_id,
    null
  );

  return jsonb_build_object(
    'referralId',v_referral_id,
    'status','delivered',
    'referralConsent',v_consent,
    'notePolicy',case when v_note is null then null else 'institution_shared_referral_note_v1' end
  );
end;
$$;

create or replace function public.institution_referral_create_context(
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
    raise exception 'Institution referral access denied';
  end if;

  return jsonb_build_object(
    'students',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId',s.student_id,
        'displayName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          s.student_id
        ),
        'programName',coalesce(c.program_name,s.program_type),
        'cohortId',s.cohort_id,
        'cohortName',coalesce(c.name,c.term,s.cohort_id),
        'primaryTradeId',s.primary_trade_id,
        'profileStatus',s.profile_status,
        'referralConsent',security.student_referral_consent_status(
          s.student_id,p_institution_id
        )
      ) order by coalesce(u.last_name,s.last_initial_public,''),coalesce(u.first_name,s.preferred_name,s.first_name_public,''))
      from public.wf_student_profiles s
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      left join public.users u on u.user_id=s.user_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and coalesce(s.profile_status,'active')<>'inactive'
        and security.institution_student_accessible(p_institution_id,s.student_id)
    ),'[]'::jsonb),
    'employers',coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'employerId',ctr.contractor_id,
        'employerName',ctr.business_name
      ))
      from public.wf_employer_talent_scopes ts
      join public.contractors ctr on ctr.contractor_id=ts.employer_id
      where ts.active=true
        and security.employer_is_approved(ts.employer_id)
        and (
          ts.institution_id=p_institution_id
          or exists(
            select 1
            from public.wf_cohorts c
            where c.institution_id=p_institution_id
              and (
                ts.cohort_id=c.cohort_id
                or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
                  lower(nullif(btrim(coalesce(c.trade_id,'')),''))
                or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
                  lower(nullif(btrim(coalesce(c.program_name,'')),''))
              )
          )
        )
    ),'[]'::jsonb),
    'hiringNeeds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'hiringNeedId',h.hiring_need_id,
        'employerId',h.employer_id,
        'employerName',ctr.business_name,
        'title',h.title,
        'tradeId',h.trade_id,
        'roleType',h.role_type,
        'targetHires',h.target_hires,
        'workTypes',coalesce(h.work_types_json,'[]'::jsonb),
        'shifts',coalesce(h.shifts_json,'[]'::jsonb),
        'requiredVerifiedSkills',coalesce(h.required_verified_skills_json,'[]'::jsonb),
        'optionalVerifiedSkills',coalesce(h.optional_verified_skills_json,'[]'::jsonb)
      ) order by ctr.business_name,h.title)
      from public.wf_hiring_needs h
      join public.contractors ctr on ctr.contractor_id=h.employer_id
      where h.status='active'
        and h.visibility='institution_shared'
        and security.employer_is_approved(h.employer_id)
        and exists(
          select 1
          from public.wf_employer_talent_scopes ts
          where ts.employer_id=h.employer_id
            and ts.active=true
            and (
              ts.institution_id=p_institution_id
              or exists(
                select 1
                from public.wf_cohorts c
                where c.institution_id=p_institution_id
                  and (
                    ts.cohort_id=c.cohort_id
                    or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
                      lower(nullif(btrim(coalesce(c.trade_id,'')),''))
                    or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
                      lower(nullif(btrim(coalesce(c.program_name,'')),''))
                  )
              )
            )
        )
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_referrals_list(
  p_institution_id text,
  p_status text default null,
  p_student_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_status text:=nullif(lower(btrim(coalesce(p_status,''))),'');
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution referral access denied';
  end if;

  if v_status is not null and v_status not in (
    'draft','referred','delivered','viewed','interview_requested',
    'interview_accepted','interview_declined','hired','closed','expired'
  ) then
    raise exception 'Invalid referral status';
  end if;

  return coalesce((
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
      'employerId',r.employer_id,
      'employerName',ctr.business_name,
      'institutionId',r.institution_id,
      'institutionName',ins.name,
      'program',coalesce(c.program_name,s.program_type),
      'cohortId',s.cohort_id,
      'cohortName',coalesce(c.name,c.term,s.cohort_id),
      'primaryTradeId',s.primary_trade_id,
      'hiringNeedId',r.hiring_need_id,
      'hiringNeedTitle',h.title,
      'status',r.status,
      'institutionSharedNote',r.institution_shared_note,
      'referralConsentStatus',r.referral_consent_status,
      'referralConsentSource',r.referral_consent_source,
      'referralNotePolicy',r.referral_note_policy,
      'referralNoteVisibility',r.referral_note_visibility,
      'referredAt',r.referred_at,
      'deliveredAt',r.delivered_at,
      'viewedAt',r.viewed_at,
      'closedAt',r.closed_at,
      'updatedAt',r.updated_at,
      'latestInterviewStatus',(
        select i.status
        from public.wf_interview_requests i
        where i.referral_id=r.referral_id
        order by i.updated_at desc
        limit 1
      ),
      'placementStatus',(
        select p.status
        from public.wf_placements p
        where p.referral_id=r.referral_id
        order by p.updated_at desc
        limit 1
      )
    ) order by r.updated_at desc)
    from public.wf_referrals r
    join public.wf_student_profiles s on s.student_id=r.student_id
    left join public.users u on u.user_id=s.user_id
    left join public.wf_institutions ins on ins.institution_id=r.institution_id
    left join public.wf_cohorts c on c.cohort_id=s.cohort_id
    left join public.contractors ctr on ctr.contractor_id=r.employer_id
    left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
    where r.institution_id=p_institution_id
      and (v_status is null or r.status=v_status)
      and (p_student_id is null or p_student_id='' or r.student_id=p_student_id)
      and security.institution_student_accessible(p_institution_id,r.student_id)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_referral_detail(
  p_institution_id text,
  p_referral_id text
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
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution referral access denied';
  end if;

  select jsonb_build_object(
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
    'employerId',r.employer_id,
    'employerName',ctr.business_name,
    'institutionId',r.institution_id,
    'institutionName',ins.name,
    'program',coalesce(c.program_name,s.program_type),
    'cohortId',s.cohort_id,
    'cohortName',coalesce(c.name,c.term,s.cohort_id),
    'primaryTradeId',s.primary_trade_id,
    'hiringNeedId',r.hiring_need_id,
    'hiringNeedTitle',h.title,
    'status',r.status,
    'institutionSharedNote',r.institution_shared_note,
    'technicalSnapshot',r.technical_snapshot,
    'professionalSnapshot',r.professional_snapshot,
    'operationalSnapshot',r.operational_snapshot,
    'companyTrainingSnapshot',r.company_training_snapshot,
    'referralConsentStatus',r.referral_consent_status,
    'referralConsentSource',r.referral_consent_source,
    'referralConsentCheckedAt',r.referral_consent_checked_at,
    'referralNotePolicy',r.referral_note_policy,
    'referralNoteVisibility',r.referral_note_visibility,
    'referredAt',r.referred_at,
    'deliveredAt',r.delivered_at,
    'viewedAt',r.viewed_at,
    'closedAt',r.closed_at,
    'updatedAt',r.updated_at,
    'interviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'interviewRequestId',i.interview_request_id,
        'employerId',i.employer_id,
        'employerName',ictr.business_name,
        'roleTitle',i.role_title,
        'status',i.status,
        'scheduledFor',i.scheduled_for,
        'interviewFormat',i.interview_format,
        'sentAt',i.sent_at,
        'respondedAt',i.responded_at,
        'completedAt',i.completed_at
      ) order by coalesce(i.scheduled_for,i.sent_at,i.created_at) desc)
      from public.wf_interview_requests i
      join public.contractors ictr on ictr.contractor_id=i.employer_id
      where i.referral_id=r.referral_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
        'employerId',p.employer_id,
        'employerName',pctr.business_name,
        'roleTitle',p.role_title,
        'tradeId',p.trade_id,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.contractors pctr on pctr.contractor_id=p.employer_id
      where p.referral_id=r.referral_id
    ),'[]'::jsonb)
  )
  into v_result
  from public.wf_referrals r
  join public.wf_student_profiles s on s.student_id=r.student_id
  left join public.users u on u.user_id=s.user_id
  left join public.wf_institutions ins on ins.institution_id=r.institution_id
  left join public.wf_cohorts c on c.cohort_id=s.cohort_id
  left join public.contractors ctr on ctr.contractor_id=r.employer_id
  left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
  where r.referral_id=p_referral_id
    and r.institution_id=p_institution_id
    and security.institution_student_accessible(p_institution_id,r.student_id)
  limit 1;

  if v_result is null then
    raise exception 'Referral not found in Institution scope';
  end if;

  return v_result;
end;
$$;

revoke all on function public.institution_create_referral(text,text,text,text,text)
  from public,anon;
revoke all on function public.institution_referral_create_context(text)
  from public,anon;
revoke all on function public.institution_referrals_list(text,text,text)
  from public,anon;
revoke all on function public.institution_referral_detail(text,text)
  from public,anon;

grant execute on function public.institution_create_referral(text,text,text,text,text)
  to authenticated,service_role;
grant execute on function public.institution_referral_create_context(text)
  to authenticated,service_role;
grant execute on function public.institution_referrals_list(text,text,text)
  to authenticated,service_role;
grant execute on function public.institution_referral_detail(text,text)
  to authenticated,service_role;

comment on function public.institution_create_referral(text,text,text,text,text) is
  'W12-03 Institution referral create API. Enforces server role/scope, D-05 referral consent, D-09 employer-visible note policy, and Wave 11 Company Training snapshots.';
comment on function public.institution_referral_create_context(text) is
  'W12-03 create-context for Institution referral UX. Returns scoped students, approved Employers, and Institution-shared hiring needs only.';
comment on function public.institution_referrals_list(text,text,text) is
  'W12-03 Institution referral queue. Excludes Employer-private candidate notes and interview evaluations.';
comment on function public.institution_referral_detail(text,text) is
  'W12-03 Institution referral detail. Exposes shared referral evidence and employer outcome state without Employer-private notes, messages, or evaluations.';
