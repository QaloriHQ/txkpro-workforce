-- W11-12: Company Training is historical referral evidence, not technical skill verification.
alter table public.wf_referrals
  add column if not exists company_training_snapshot jsonb;

comment on column public.wf_referrals.company_training_snapshot is
  'Immutable company-specific training, badge, and certification evidence captured at referral creation. NULL means the referral predates W11-12; do not backfill from live state.';

create or replace function security.referral_company_training_snapshot(
  p_institution_id text,
  p_student_id text,
  p_employer_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_employer_name text;
begin
  if not coalesce(security.has_institution_scope(p_institution_id),false)
     or not exists (
       select 1 from public.wf_student_profiles s
       where s.student_id=p_student_id and s.school_id=p_institution_id
     ) then
    raise exception 'Institution referral scope required';
  end if;

  select ctr.business_name into v_employer_name
  from public.contractors ctr where ctr.contractor_id=p_employer_id;
  if v_employer_name is null or not security.employer_is_approved(p_employer_id) then
    raise exception 'Approved Employer required';
  end if;

  return jsonb_build_object(
    'schemaVersion',1,
    'capturedAt',now(),
    'employerId',p_employer_id,
    'employerName',v_employer_name,
    'evidenceCategory','employer_training',
    'technicalSkillVerified',false,
    'training',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId',a.assignment_id,
        'courseTitle',mc.title,
        'courseVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'statusAtReferral',a.status,
        'assignedAt',a.assigned_at,
        'completedAt',a.completed_at,
        'passedCompletionId',c.completion_id,
        'passedAt',c.completed_at
      ) order by a.assigned_at desc,a.assignment_id)
      from public.wf_micro_cert_assignments a
      join public.wf_employer_micro_certs mc
        on mc.micro_cert_id=a.micro_cert_id and mc.employer_id=p_employer_id
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=a.micro_cert_version_id
      left join public.wf_micro_cert_completions c
        on c.assignment_id=a.assignment_id and c.outcome='passed'
      where a.student_id=p_student_id
        and a.institution_id=p_institution_id
        and a.status<>'cancelled'
    ),'[]'::jsonb),
    'companyBadges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'awardId',b.company_badge_award_id,
        'badgeTitle',coalesce(b.metadata->>'badgeTitle',d.title),
        'issuer',v_employer_name,
        'courseTitle',mc.title,
        'courseVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'completionId',c.completion_id,
        'issuedAt',b.issued_at,
        'expiresAt',b.expires_at,
        'statusAtReferral',case
          when b.revoked_at is not null then 'revoked'
          when b.expires_at is not null and b.expires_at<=now() then 'expired'
          else 'active'
        end
      ) order by b.issued_at desc,b.company_badge_award_id)
      from public.wf_company_badge_awards b
      join public.wf_company_badges d on d.company_badge_id=b.company_badge_id
      join public.wf_micro_cert_completions c
        on c.completion_id=b.completion_id and c.outcome='passed'
      join public.wf_micro_cert_assignments a
        on a.assignment_id=c.assignment_id
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=b.micro_cert_version_id
        and v.micro_cert_version_id=a.micro_cert_version_id
      join public.wf_employer_micro_certs mc
        on mc.micro_cert_id=v.micro_cert_id and mc.employer_id=p_employer_id
      where b.student_id=p_student_id
        and b.employer_id=p_employer_id
        and a.student_id=p_student_id
        and a.institution_id=p_institution_id
    ),'[]'::jsonb),
    'employerCertifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'credentialId',ca.credential_id,
        'title',d.title,
        'issuer',v_employer_name,
        'courseTitle',mc.title,
        'courseVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'completionId',c.completion_id,
        'passedAt',c.completed_at,
        'issuedAt',ca.issued_at,
        'expiresAt',ca.expires_at,
        'statusAtReferral',case
          when ca.status='revoked' or ca.revoked_at is not null then 'revoked'
          when ca.expires_at is not null and ca.expires_at<=now() then 'expired'
          else 'active'
        end
      ) order by ca.issued_at desc,ca.credential_id)
      from public.wf_employer_certification_awards ca
      join public.wf_employer_certification_definitions d
        on d.certification_definition_id=ca.certification_definition_id
      join public.wf_micro_cert_completions c
        on c.completion_id=ca.completion_id and c.outcome='passed'
      join public.wf_micro_cert_assignments a
        on a.assignment_id=ca.assignment_id and a.assignment_id=c.assignment_id
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=ca.micro_cert_version_id
        and v.micro_cert_version_id=a.micro_cert_version_id
      join public.wf_employer_micro_certs mc
        on mc.micro_cert_id=v.micro_cert_id and mc.employer_id=p_employer_id
      where ca.student_id=p_student_id
        and ca.employer_id=p_employer_id
        and a.student_id=p_student_id
        and a.institution_id=p_institution_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function security.referral_company_training_snapshot(text,text,text)
  from public,anon,authenticated;

create or replace function security.prevent_referral_company_training_snapshot_change()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.company_training_snapshot is distinct from new.company_training_snapshot then
    raise exception 'Referral Company Training snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wf_referral_company_training_snapshot_immutable
  on public.wf_referrals;
create trigger trg_wf_referral_company_training_snapshot_immutable
before update on public.wf_referrals
for each row execute function security.prevent_referral_company_training_snapshot_change();

revoke all on function security.prevent_referral_company_training_snapshot_change()
  from public,anon,authenticated;


-- Keep the existing referral consent, Institution, Employer, and hiring-need checks.
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
begin
  if not security.has_institution_scope(p_institution_id) then
    raise exception 'Institution referral permission required';
  end if;

  if not security.employer_is_approved(p_employer_id) then
    raise exception 'Employer is not approved';
  end if;

  select * into v_student from public.wf_student_profiles
  where student_id=p_student_id and school_id=p_institution_id;
  if not found then raise exception 'Student not found in Institution scope'; end if;

  if coalesce(
      nullif(lower(v_student.discoverability_status),''),
      lower(coalesce(v_student.profile_visibility,'private'))
    ) not in ('employer_discoverable','employer','public') then
    raise exception 'Student is not Employer-discoverable';
  end if;

  select jsonb_build_object(
    'verifiedSkillCount',count(*),
    'verifiedSkills',coalesce(jsonb_agg(jsonb_build_object(
      'skillId',sc.skill_id,'name',sc.name,'provenance',ss.provenance,'verifiedAt',ss.verified_at
    ) order by sc.name),'[]'::jsonb)
  )
  into v_technical
  from public.wf_student_skills ss
  join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
  where ss.student_id=p_student_id and ss.status='verified';

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
    referral_id,institution_id,student_id,employer_id,hiring_need_id,created_by_user_id,
    institution_shared_note,technical_snapshot,professional_snapshot,operational_snapshot,
    company_training_snapshot,
    status,referred_at,delivered_at
  ) values(
    v_referral_id,p_institution_id,p_student_id,p_employer_id,p_hiring_need_id,
    security.current_legacy_user_id(),nullif(btrim(coalesce(p_note,'')),''),
    coalesce(v_technical,'{}'::jsonb),'{}'::jsonb,coalesce(v_operational,'{}'::jsonb),
    v_company_training,
    'delivered',now(),now()
  );

  perform security.emit_workforce_event(
    'REFERRAL_CREATED','referral',v_referral_id,p_employer_id,p_institution_id,p_student_id,
    null,
    jsonb_build_object('status','delivered','hiringNeedId',p_hiring_need_id),
    jsonb_build_object('source','institution_create_referral'),
    'success',
    'referral_created:'||v_referral_id,
    null
  );

  return jsonb_build_object('referralId',v_referral_id,'status','delivered');
end;
$$;

-- The Employer detail RPC retains its existing Employer and hiring-manager scope checks.
create or replace function public.employer_referral_detail(
  p_employer_id text,
  p_referral_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_hm_only boolean := security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']);
begin
  if not security.can_browse_employer_talent(p_employer_id) then
    raise exception 'Approved Employer referral access required';
  end if;

  select jsonb_build_object(
    'referralId',r.referral_id,
    'studentId',r.student_id,
    'studentName',concat_ws(' ',
      coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
      nullif(s.last_initial_public,'')
    ),
    'institutionId',r.institution_id,
    'institutionName',i.name,
    'program',coalesce(c.program_name,s.program_type),
    'primaryTradeId',s.primary_trade_id,
    'hiringNeedId',r.hiring_need_id,
    'hiringNeedTitle',h.title,
    'status',r.status,
    'institutionSharedNote',r.institution_shared_note,
    'technicalSnapshot',r.technical_snapshot,
    'professionalSnapshot',r.professional_snapshot,
    'operationalSnapshot',r.operational_snapshot,
    'companyTrainingSnapshot',r.company_training_snapshot,
    'referredAt',r.referred_at,
    'viewedAt',r.viewed_at,
    'updatedAt',r.updated_at,
    'privateNotes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'noteId',n.note_id,
        'note',n.note,
        'createdByUserId',n.created_by_user_id,
        'createdAt',n.created_at
      ) order by n.created_at desc)
      from public.wf_employer_candidate_notes n
      where n.employer_id=p_employer_id
        and n.student_id=r.student_id
        and (n.referral_id is null or n.referral_id=r.referral_id)
    ),'[]'::jsonb)
  )
  into v_result
  from public.wf_referrals r
  join public.wf_student_profiles s on s.student_id=r.student_id
  left join public.wf_institutions i on i.institution_id=r.institution_id
  left join public.wf_cohorts c on c.cohort_id=s.cohort_id
  left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
  where r.employer_id=p_employer_id
    and r.referral_id=p_referral_id
    and (
      not v_hm_only
      or (
        r.hiring_need_id is not null
        and security.hiring_manager_can_use_need(p_employer_id,r.hiring_need_id)
      )
    );

  if v_result is null then raise exception 'Referral not found'; end if;
  return v_result;
end;
$$;

revoke all on function public.institution_create_referral(text,text,text,text,text)
  from public,anon;
revoke all on function public.employer_referral_detail(text,text)
  from public,anon;
grant execute on function public.institution_create_referral(text,text,text,text,text)
  to authenticated,service_role;
grant execute on function public.employer_referral_detail(text,text)
  to authenticated,service_role;
