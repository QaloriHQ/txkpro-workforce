-- W11-11: narrowly scoped, read-only evidence for Student and Institution profiles.
create or replace function public.student_profile_readiness_evidence(
  p_student_id text,
  p_institution_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_self boolean;
begin
  v_self := coalesce(p_student_id = security.current_student_id(), false);

  if not v_self and (
    p_institution_id is null or
    not security.institution_student_accessible(p_institution_id, p_student_id)
  ) then
    raise exception 'Student outside authorized scope';
  end if;

  return jsonb_build_object(
    'verifiedSkills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentSkillId', ss.student_skill_id,
        'name', sc.name,
        'category', sc.category,
        'verifiedAt', ss.verified_at,
        'provenance', ss.provenance
      ) order by ss.verified_at desc, sc.name)
      from public.wf_student_skills ss
      join public.wf_skill_catalog sc on sc.skill_id = ss.skill_id
      where ss.student_id = p_student_id and ss.status = 'verified'
    ), '[]'::jsonb),
    'employerTraining', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId', a.assignment_id,
        'employerName', ctr.business_name,
        'courseTitle', mc.title,
        'versionNumber', v.version_number,
        'status', a.status,
        'completedAt', a.completed_at
      ) order by a.assigned_at desc)
      from public.wf_micro_cert_assignments a
      join public.wf_employer_micro_certs mc on mc.micro_cert_id = a.micro_cert_id
      join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id = a.micro_cert_version_id
      join public.contractors ctr on ctr.contractor_id = mc.employer_id
      where a.student_id = p_student_id
        and (v_self or a.institution_id = p_institution_id)
    ), '[]'::jsonb),
    'companyBadges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'awardId', a.company_badge_award_id,
        'title', coalesce(a.metadata->>'badgeTitle', b.title),
        'employerName', ctr.business_name,
        'issuedAt', a.issued_at,
        'expiresAt', a.expires_at,
        'status', case
          when a.revoked_at is not null then 'revoked'
          when a.expires_at is not null and a.expires_at <= now() then 'expired'
          else 'active'
        end,
        'microCertVersionId', a.micro_cert_version_id
      ) order by a.issued_at desc)
      from public.wf_company_badge_awards a
      join public.wf_company_badges b on b.company_badge_id = a.company_badge_id
      join public.contractors ctr on ctr.contractor_id = a.employer_id
      where a.student_id = p_student_id
        and (v_self or exists (
          select 1 from public.wf_micro_cert_assignments ma
          join public.wf_micro_cert_completions co
            on co.assignment_id = ma.assignment_id
          where co.completion_id = a.evidence_id
            and ma.institution_id = p_institution_id
        ))
    ), '[]'::jsonb),
    'employerCertifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'credentialId', a.credential_id,
        'title', d.title,
        'employerName', ctr.business_name,
        'courseTitle', mc.title,
        'versionNumber', v.version_number,
        'status', case
          when a.status = 'revoked' or a.revoked_at is not null then 'revoked'
          when a.expires_at is not null and a.expires_at <= now() then 'expired'
          else 'active'
        end,
        'issuedAt', a.issued_at,
        'expiresAt', a.expires_at,
        'completedAt', c.completed_at,
        'evidenceCategory', 'employer_training',
        'technicalSkillVerified', false
      ) order by a.issued_at desc)
      from public.wf_employer_certification_awards a
      join public.wf_employer_certification_definitions d
        on d.certification_definition_id = a.certification_definition_id
      join public.wf_employer_micro_certs mc on mc.micro_cert_id = a.micro_cert_id
      join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id = a.micro_cert_version_id
      join public.wf_micro_cert_completions c on c.completion_id = a.completion_id
      join public.wf_micro_cert_assignments ma on ma.assignment_id = a.assignment_id
      join public.contractors ctr on ctr.contractor_id = a.employer_id
      where a.student_id = p_student_id
        and (v_self or ma.institution_id = p_institution_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.student_profile_readiness_evidence(text,text)
  from public, anon, authenticated;
grant execute on function public.student_profile_readiness_evidence(text,text)
  to authenticated, service_role;

comment on function public.student_profile_readiness_evidence(text,text) is
  'Self or institution-scoped Student profile evidence. Keeps verified skills, employer training, company badges, and formal employer certifications distinct; omits private assessment and revocation detail.';
