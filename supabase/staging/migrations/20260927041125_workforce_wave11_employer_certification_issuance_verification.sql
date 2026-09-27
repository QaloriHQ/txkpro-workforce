
-- W11-09A — Formal Employer Certification issuance + credential verification.
-- Formal Employer Certifications are Employer-issued credentials derived from
-- canonical passed Employer Training completion evidence. They remain distinct
-- from Company Badges and Instructor Verified Skills.

create or replace function security.normalize_employer_certification_criteria(
  p_criteria jsonb
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_criteria jsonb:=coalesce(p_criteria,'{}'::jsonb);
  v_version integer;
  v_evidence_type text;
  v_required_outcome text;
begin
  if jsonb_typeof(v_criteria)<>'object' then
    raise exception 'Employer Certification criteria must be an object';
  end if;

  v_version:=coalesce((v_criteria->>'criteriaVersion')::integer,1);
  v_evidence_type:=lower(btrim(coalesce(v_criteria->>'evidenceType','micro_cert_completion')));
  v_required_outcome:=lower(btrim(coalesce(v_criteria->>'requiredOutcome','passed')));

  if v_version<>1 then
    raise exception 'Unsupported Employer Certification criteria version';
  end if;
  if v_evidence_type<>'micro_cert_completion' then
    raise exception 'Employer Certification evidenceType must be micro_cert_completion';
  end if;
  if v_required_outcome<>'passed' then
    raise exception 'Employer Certification requiredOutcome must be passed';
  end if;

  return jsonb_build_object(
    'criteriaVersion',1,
    'evidenceType','micro_cert_completion',
    'requiredOutcome','passed'
  );
end;
$$;

create or replace function security.employer_certification_effective_status(
  p_status text,
  p_expires_at timestamptz
)
returns text
language sql
stable
set search_path=''
as $$
  select case
    when p_status='revoked' then 'revoked'
    when p_expires_at is not null and p_expires_at<=now() then 'expired'
    else 'active'
  end;
$$;

create or replace function security.employer_certification_definition_locked(
  p_certification_definition_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    exists(
      select 1
      from public.wf_employer_micro_cert_versions v
      where v.certification_definition_id=p_certification_definition_id
        and v.status in ('ready','live','archived')
    )
    or exists(
      select 1
      from public.wf_employer_certification_awards a
      where a.certification_definition_id=p_certification_definition_id
    ),
    false
  );
$$;

create or replace function security.employer_certification_digest(
  p_credential_id text,
  p_employer_id text,
  p_student_id text,
  p_certification_definition_id text,
  p_completion_id text,
  p_micro_cert_version_id text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
immutable
set search_path=''
as $$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        'txkpro-employer-certification-v1',
        coalesce(p_credential_id,''),
        coalesce(p_employer_id,''),
        coalesce(p_student_id,''),
        coalesce(p_certification_definition_id,''),
        coalesce(p_completion_id,''),
        coalesce(p_micro_cert_version_id,''),
        coalesce(p_issued_at::text,''),
        coalesce(p_expires_at::text,'')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function security.validate_employer_certification_definition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.title:=btrim(new.title);
  new.description:=nullif(btrim(coalesce(new.description,'')),'');
  new.criteria:=security.normalize_employer_certification_criteria(new.criteria);

  if not exists(
    select 1
    from public.wf_employer_micro_certs mc
    where mc.micro_cert_id=new.micro_cert_id
      and mc.employer_id=new.employer_id
  ) then
    raise exception 'Employer Certification course is outside the Employer scope';
  end if;

  if new.expires_after_days is not null and new.expires_after_days<=0 then
    raise exception 'Employer Certification expiration must be greater than zero days';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wf_employer_certification_definition_validate
  on public.wf_employer_certification_definitions;
create trigger trg_wf_employer_certification_definition_validate
before insert or update
on public.wf_employer_certification_definitions
for each row
execute function security.validate_employer_certification_definition();

create or replace function security.validate_employer_certification_award()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_definition public.wf_employer_certification_definitions%rowtype;
  v_completion public.wf_micro_cert_completions%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_course public.wf_employer_micro_certs%rowtype;
begin
  select * into v_definition
  from public.wf_employer_certification_definitions d
  where d.certification_definition_id=new.certification_definition_id;

  if not found then
    raise exception 'Employer Certification definition not found';
  end if;

  select * into v_completion
  from public.wf_micro_cert_completions c
  where c.completion_id=new.completion_id
    and c.outcome='passed';

  if not found then
    raise exception 'Employer Certification requires canonical passed completion evidence';
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_completion.assignment_id;

  if not found then
    raise exception 'Employer Certification completion assignment not found';
  end if;

  select * into v_version
  from public.wf_employer_micro_cert_versions v
  where v.micro_cert_version_id=v_assignment.micro_cert_version_id
    and v.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Employer Certification course version not found';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Employer Certification course not found';
  end if;

  if new.assignment_id<>v_assignment.assignment_id
     or new.student_id<>v_assignment.student_id
     or new.employer_id<>v_course.employer_id
     or new.micro_cert_id<>v_assignment.micro_cert_id
     or new.micro_cert_version_id<>v_assignment.micro_cert_version_id
     or v_definition.employer_id<>v_course.employer_id
     or v_definition.micro_cert_id<>v_assignment.micro_cert_id
     or v_version.certification_definition_id is distinct from new.certification_definition_id then
    raise exception 'Employer Certification award provenance does not match configured completion evidence';
  end if;

  if new.issued_at<v_completion.completed_at then
    raise exception 'Employer Certification issue date cannot precede completion';
  end if;

  if new.expires_at is not null and new.expires_at<=new.issued_at then
    raise exception 'Employer Certification expiration must be after issue date';
  end if;

  if new.status='active' then
    if new.revoked_at is not null or nullif(btrim(coalesce(new.revoke_reason,'')),'') is not null then
      raise exception 'Active Employer Certification cannot contain revocation state';
    end if;
  elsif new.status='revoked' then
    if new.revoked_at is null or nullif(btrim(coalesce(new.revoke_reason,'')),'') is null then
      raise exception 'Revoked Employer Certification requires timestamp and reason';
    end if;
    new.revoke_reason:=btrim(new.revoke_reason);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wf_employer_certification_award_validate
  on public.wf_employer_certification_awards;
create trigger trg_wf_employer_certification_award_validate
before insert or update
on public.wf_employer_certification_awards
for each row
execute function security.validate_employer_certification_award();

create or replace function security.employer_certification_verification_read_model(
  p_credential_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_award public.wf_employer_certification_awards%rowtype;
  v_definition public.wf_employer_certification_definitions%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_course public.wf_employer_micro_certs%rowtype;
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_student public.wf_student_profiles%rowtype;
  v_student_user public.users%rowtype;
  v_issuer public.contractors%rowtype;
  v_expected_digest text;
  v_stored_digest text;
begin
  select * into v_award
  from public.wf_employer_certification_awards a
  where lower(a.credential_id)=lower(btrim(p_credential_id));

  if not found then
    return jsonb_build_object(
      'found',false,
      'credentialId',btrim(coalesce(p_credential_id,''))
    );
  end if;

  select * into v_definition
  from public.wf_employer_certification_definitions d
  where d.certification_definition_id=v_award.certification_definition_id;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_award.assignment_id;

  select * into v_course
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_award.micro_cert_id;

  select * into v_version
  from public.wf_employer_micro_cert_versions v
  where v.micro_cert_version_id=v_award.micro_cert_version_id;

  select * into v_student
  from public.wf_student_profiles s
  where s.student_id=v_award.student_id;

  if v_student.user_id is not null then
    select * into v_student_user
    from public.users u
    where u.user_id=v_student.user_id;
  end if;

  select * into v_issuer
  from public.contractors c
  where c.contractor_id=v_award.employer_id;

  v_expected_digest:=security.employer_certification_digest(
    v_award.credential_id,
    v_award.employer_id,
    v_award.student_id,
    v_award.certification_definition_id,
    v_award.completion_id,
    v_award.micro_cert_version_id,
    v_award.issued_at,
    v_award.expires_at
  );
  v_stored_digest:=v_award.verification_metadata->>'issuanceDigest';

  return jsonb_build_object(
    'found',true,
    'credentialId',v_award.credential_id,
    'certificationAwardId',v_award.certification_award_id,
    'status',security.employer_certification_effective_status(
      v_award.status,v_award.expires_at
    ),
    'canonicalStatus',v_award.status,
    'issuedAt',v_award.issued_at,
    'expiresAt',v_award.expires_at,
    'revokedAt',v_award.revoked_at,
    'revokeReason',v_award.revoke_reason,
    'issuer',jsonb_build_object(
      'employerId',v_award.employer_id,
      'name',coalesce(v_award.verification_metadata->>'issuerNameSnapshot',v_issuer.business_name)
    ),
    'learner',jsonb_build_object(
      'studentId',v_award.student_id,
      'name',coalesce(
        v_award.verification_metadata->>'learnerNameSnapshot',
        nullif(btrim(concat_ws(' ',v_student_user.first_name,v_student_user.last_name)),''),
        nullif(btrim(coalesce(v_student.preferred_name,'')),''),
        concat_ws(
          ' ',
          nullif(btrim(coalesce(v_student.first_name_public,'')),''),
          nullif(btrim(coalesce(v_student.last_initial_public,'')),'')
        ),
        v_award.student_id
      )
    ),
    'certification',jsonb_build_object(
      'certificationDefinitionId',v_award.certification_definition_id,
      'title',coalesce(v_award.verification_metadata->>'certificationTitleSnapshot',v_definition.title),
      'description',coalesce(v_award.verification_metadata->>'certificationDescriptionSnapshot',v_definition.description),
      'definitionVersion',coalesce(
        (v_award.verification_metadata->>'certificationVersion')::integer,
        v_definition.version
      )
    ),
    'course',jsonb_build_object(
      'microCertId',v_award.micro_cert_id,
      'title',coalesce(v_award.verification_metadata->>'courseTitleSnapshot',v_course.title),
      'microCertVersionId',v_award.micro_cert_version_id,
      'versionNumber',coalesce(
        (v_award.verification_metadata->>'courseVersionNumber')::integer,
        v_version.version_number
      )
    ),
    'evidence',jsonb_build_object(
      'assignmentId',v_award.assignment_id,
      'completionId',v_award.completion_id,
      'evidenceType','micro_cert_completion',
      'evidenceCategory','employer_training',
      'technicalSkillVerified',false,
      'snapshot',v_award.evidence
    ),
    'verification',jsonb_build_object(
      'verificationVersion',coalesce(
        (v_award.verification_metadata->>'verificationVersion')::integer,1
      ),
      'issuanceDigest',v_stored_digest,
      'digestValid',coalesce(v_stored_digest=v_expected_digest,false),
      'algorithm','SHA-256',
      'metadata',v_award.verification_metadata
    )
  );
end;
$$;

create or replace function security.evaluate_employer_certification_for_completion(
  p_completion_id text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_completion public.wf_micro_cert_completions%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_course public.wf_employer_micro_certs%rowtype;
  v_definition public.wf_employer_certification_definitions%rowtype;
  v_student public.wf_student_profiles%rowtype;
  v_student_user public.users%rowtype;
  v_issuer public.contractors%rowtype;
  v_award public.wf_employer_certification_awards%rowtype;
  v_award_id text;
  v_credential_id text;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_digest text;
  v_criteria jsonb;
  v_evidence jsonb;
  v_verification jsonb;
  v_learner_name text;
  v_existing boolean:=false;
begin
  select * into v_completion
  from public.wf_micro_cert_completions c
  where c.completion_id=p_completion_id
    and c.outcome='passed';

  if not found then
    return jsonb_build_object(
      'issued',false,
      'reason','passed_completion_not_found',
      'completionId',p_completion_id
    );
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_completion.assignment_id;

  if not found then
    raise exception 'Employer Certification completion assignment not found';
  end if;

  select * into v_version
  from public.wf_employer_micro_cert_versions v
  where v.micro_cert_version_id=v_assignment.micro_cert_version_id
    and v.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Employer Certification completion course version not found';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Employer Certification completion course not found';
  end if;

  if v_version.certification_definition_id is null then
    return jsonb_build_object(
      'issued',false,
      'reason','no_employer_certification_configured',
      'completionId',v_completion.completion_id,
      'microCertVersionId',v_assignment.micro_cert_version_id
    );
  end if;

  select * into v_definition
  from public.wf_employer_certification_definitions d
  where d.certification_definition_id=v_version.certification_definition_id
    and d.employer_id=v_course.employer_id
    and d.micro_cert_id=v_course.micro_cert_id;

  if not found then
    raise exception 'Configured Employer Certification is outside the course/Employer scope';
  end if;

  if not v_definition.active then
    return jsonb_build_object(
      'issued',false,
      'reason','employer_certification_inactive',
      'certificationDefinitionId',v_definition.certification_definition_id,
      'completionId',v_completion.completion_id
    );
  end if;

  v_criteria:=security.normalize_employer_certification_criteria(v_definition.criteria);

  select *
  into v_award
  from public.wf_employer_certification_awards a
  where a.certification_definition_id=v_definition.certification_definition_id
    and a.student_id=v_assignment.student_id
    and a.completion_id=v_completion.completion_id
  limit 1;

  if found then
    v_existing:=true;
  else
    select * into v_student
    from public.wf_student_profiles s
    where s.student_id=v_assignment.student_id;

    if v_student.user_id is not null then
      select * into v_student_user
      from public.users u
      where u.user_id=v_student.user_id;
    end if;

    select * into v_issuer
    from public.contractors c
    where c.contractor_id=v_course.employer_id;

    v_award_id:=security.new_legacy_id('CAW');
    v_credential_id:=security.new_legacy_id('CERT');
    v_issued_at:=v_completion.completed_at;
    v_expires_at:=case
      when v_definition.expires_after_days is null then null
      else v_issued_at+make_interval(days=>v_definition.expires_after_days)
    end;

    v_learner_name:=coalesce(
      nullif(btrim(concat_ws(' ',v_student_user.first_name,v_student_user.last_name)),''),
      nullif(btrim(coalesce(v_student.preferred_name,'')),''),
      concat_ws(
        ' ',
        nullif(btrim(coalesce(v_student.first_name_public,'')),''),
        nullif(btrim(coalesce(v_student.last_initial_public,'')),'')
      ),
      v_assignment.student_id
    );

    v_digest:=security.employer_certification_digest(
      v_credential_id,
      v_course.employer_id,
      v_assignment.student_id,
      v_definition.certification_definition_id,
      v_completion.completion_id,
      v_assignment.micro_cert_version_id,
      v_issued_at,
      v_expires_at
    );

    v_evidence:=jsonb_build_object(
      'evidenceVersion',1,
      'evidenceType','micro_cert_completion',
      'evidenceCategory','employer_training',
      'technicalSkillVerified',false,
      'assignmentId',v_assignment.assignment_id,
      'completionId',v_completion.completion_id,
      'completionOutcome',v_completion.outcome,
      'completionScore',v_completion.score,
      'completedAt',v_completion.completed_at,
      'microCertId',v_assignment.micro_cert_id,
      'microCertVersionId',v_assignment.micro_cert_version_id,
      'courseVersionNumber',v_version.version_number,
      'completionEvidence',v_completion.evidence
    );

    v_verification:=jsonb_build_object(
      'verificationVersion',1,
      'issuanceDigest',v_digest,
      'digestAlgorithm','SHA-256',
      'issuerEmployerId',v_course.employer_id,
      'issuerNameSnapshot',v_issuer.business_name,
      'studentId',v_assignment.student_id,
      'learnerNameSnapshot',v_learner_name,
      'certificationDefinitionId',v_definition.certification_definition_id,
      'certificationTitleSnapshot',v_definition.title,
      'certificationDescriptionSnapshot',v_definition.description,
      'certificationVersion',v_definition.version,
      'microCertId',v_assignment.micro_cert_id,
      'courseTitleSnapshot',v_course.title,
      'microCertVersionId',v_assignment.micro_cert_version_id,
      'courseVersionNumber',v_version.version_number,
      'assignmentId',v_assignment.assignment_id,
      'completionId',v_completion.completion_id,
      'issuedAt',v_issued_at,
      'expiresAt',v_expires_at,
      'evidenceCategory','employer_training',
      'technicalSkillVerified',false,
      'publicVerificationEnabled',false,
      'publicVerificationOwnedBy','W11-09B'
    );

    insert into public.wf_employer_certification_awards(
      certification_award_id,
      credential_id,
      certification_definition_id,
      student_id,
      employer_id,
      micro_cert_id,
      micro_cert_version_id,
      assignment_id,
      completion_id,
      status,
      issued_at,
      expires_at,
      evidence,
      verification_metadata,
      created_at,
      updated_at
    ) values(
      v_award_id,
      v_credential_id,
      v_definition.certification_definition_id,
      v_assignment.student_id,
      v_course.employer_id,
      v_assignment.micro_cert_id,
      v_assignment.micro_cert_version_id,
      v_assignment.assignment_id,
      v_completion.completion_id,
      'active',
      v_issued_at,
      v_expires_at,
      v_evidence,
      v_verification,
      now(),
      now()
    )
    on conflict(certification_definition_id,student_id,completion_id)
    do nothing
    returning * into v_award;

    if not found then
      select *
      into v_award
      from public.wf_employer_certification_awards a
      where a.certification_definition_id=v_definition.certification_definition_id
        and a.student_id=v_assignment.student_id
        and a.completion_id=v_completion.completion_id
      limit 1;
      v_existing:=true;
    end if;
  end if;

  perform security.emit_employer_learning_event(
    p_event_type=>'EMPLOYER_CERTIFICATION_AWARDED',
    p_target_id=>v_award.certification_award_id,
    p_event_key=>'employer-certification-awarded:'||
      v_definition.certification_definition_id||':'||v_completion.completion_id,
    p_source=>'system',
    p_employer_id=>v_course.employer_id,
    p_institution_id=>v_assignment.institution_id,
    p_student_id=>v_assignment.student_id,
    p_actor_type=>'system',
    p_metadata=>jsonb_build_object(
      'certification_award_id',v_award.certification_award_id,
      'credential_id',v_award.credential_id,
      'certification_definition_id',v_definition.certification_definition_id,
      'completion_id',v_completion.completion_id,
      'micro_cert_id',v_assignment.micro_cert_id,
      'micro_cert_version_id',v_assignment.micro_cert_version_id,
      'assignment_id',v_assignment.assignment_id,
      'certification_version',v_definition.version,
      'evidence_category','employer_training',
      'technical_skill_verified',false
    ),
    p_result=>'success',
    p_correlation_id=>p_correlation_id
  );

  return jsonb_build_object(
    'issued',true,
    'alreadyIssued',v_existing,
    'certificationAwardId',v_award.certification_award_id,
    'credentialId',v_award.credential_id,
    'certificationDefinitionId',v_award.certification_definition_id,
    'studentId',v_award.student_id,
    'employerId',v_award.employer_id,
    'microCertId',v_award.micro_cert_id,
    'microCertVersionId',v_award.micro_cert_version_id,
    'assignmentId',v_award.assignment_id,
    'completionId',v_award.completion_id,
    'status',security.employer_certification_effective_status(
      v_award.status,v_award.expires_at
    ),
    'issuedAt',v_award.issued_at,
    'expiresAt',v_award.expires_at,
    'verification',security.employer_certification_verification_read_model(
      v_award.credential_id
    )
  );
end;
$$;

create or replace function security.employer_certification_completion_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.event_type='MICRO_CERT_COMPLETED'
     and new.result='success'
     and new.target_id is not null then
    perform security.evaluate_employer_certification_for_completion(
      new.target_id,
      new.correlation_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_wf_employer_certification_completion_event
  on public.wf_domain_events;
create trigger trg_wf_employer_certification_completion_event
after insert
on public.wf_domain_events
for each row
when (new.event_type='MICRO_CERT_COMPLETED' and new.result='success')
execute function security.employer_certification_completion_event_trigger();

create or replace function public.employer_certification_definitions(
  p_employer_id text,
  p_micro_cert_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Certification view denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'certificationDefinitionId',d.certification_definition_id,
      'employerId',d.employer_id,
      'microCertId',d.micro_cert_id,
      'courseTitle',mc.title,
      'title',d.title,
      'description',d.description,
      'criteria',security.normalize_employer_certification_criteria(d.criteria),
      'version',d.version,
      'active',d.active,
      'expiresAfterDays',d.expires_after_days,
      'locked',security.employer_certification_definition_locked(
        d.certification_definition_id
      ),
      'linkedVersionCount',(
        select count(*)
        from public.wf_employer_micro_cert_versions v
        where v.certification_definition_id=d.certification_definition_id
      ),
      'awardCount',(
        select count(*)
        from public.wf_employer_certification_awards a
        where a.certification_definition_id=d.certification_definition_id
      ),
      'activeAwardCount',(
        select count(*)
        from public.wf_employer_certification_awards a
        where a.certification_definition_id=d.certification_definition_id
          and security.employer_certification_effective_status(
            a.status,a.expires_at
          )='active'
      ),
      'createdAt',d.created_at,
      'updatedAt',d.updated_at
    ) order by d.active desc,d.updated_at desc,d.title,d.version desc)
    from public.wf_employer_certification_definitions d
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=d.micro_cert_id
    where d.employer_id=p_employer_id
      and (p_micro_cert_id is null or d.micro_cert_id=p_micro_cert_id)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_certification_awards(
  p_employer_id text,
  p_certification_definition_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Certification view denied';
  end if;

  if p_certification_definition_id is not null and not exists(
    select 1
    from public.wf_employer_certification_definitions d
    where d.certification_definition_id=p_certification_definition_id
      and d.employer_id=p_employer_id
  ) then
    raise exception 'Employer Certification definition not found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'certificationAwardId',a.certification_award_id,
      'credentialId',a.credential_id,
      'certificationDefinitionId',a.certification_definition_id,
      'certificationTitle',coalesce(
        a.verification_metadata->>'certificationTitleSnapshot',d.title
      ),
      'certificationVersion',coalesce(
        (a.verification_metadata->>'certificationVersion')::integer,d.version
      ),
      'studentId',a.student_id,
      'studentName',coalesce(
        a.verification_metadata->>'learnerNameSnapshot',
        nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
        nullif(btrim(coalesce(s.preferred_name,'')),''),
        a.student_id
      ),
      'employerId',a.employer_id,
      'issuerName',coalesce(
        a.verification_metadata->>'issuerNameSnapshot',ctr.business_name
      ),
      'microCertId',a.micro_cert_id,
      'courseTitle',coalesce(
        a.verification_metadata->>'courseTitleSnapshot',mc.title
      ),
      'microCertVersionId',a.micro_cert_version_id,
      'courseVersionNumber',coalesce(
        (a.verification_metadata->>'courseVersionNumber')::integer,v.version_number
      ),
      'assignmentId',a.assignment_id,
      'completionId',a.completion_id,
      'status',security.employer_certification_effective_status(
        a.status,a.expires_at
      ),
      'canonicalStatus',a.status,
      'issuedAt',a.issued_at,
      'expiresAt',a.expires_at,
      'revokedAt',a.revoked_at,
      'revokeReason',a.revoke_reason,
      'evidence',a.evidence,
      'verificationMetadata',a.verification_metadata
    ) order by a.issued_at desc,a.created_at desc)
    from public.wf_employer_certification_awards a
    join public.wf_employer_certification_definitions d
      on d.certification_definition_id=a.certification_definition_id
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
    join public.contractors ctr
      on ctr.contractor_id=a.employer_id
    join public.wf_student_profiles s
      on s.student_id=a.student_id
    left join public.users u
      on u.user_id=s.user_id
    where a.employer_id=p_employer_id
      and (
        p_certification_definition_id is null
        or a.certification_definition_id=p_certification_definition_id
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_certification_definition_create(
  p_employer_id text,
  p_micro_cert_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_title text:=btrim(coalesce(p_payload->>'title',''));
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_expires integer;
  v_criteria jsonb;
  v_version integer;
  v_definition public.wf_employer_certification_definitions%rowtype;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Certification management denied';
  end if;

  if not exists(
    select 1
    from public.wf_employer_micro_certs mc
    where mc.micro_cert_id=p_micro_cert_id
      and mc.employer_id=p_employer_id
  ) then
    raise exception 'Employer Certification course not found';
  end if;

  if v_title='' then
    raise exception 'Employer Certification title is required';
  end if;

  if p_payload ? 'expiresAfterDays'
     and p_payload->'expiresAfterDays' is not null
     and p_payload->'expiresAfterDays'<>'null'::jsonb then
    v_expires:=(p_payload->>'expiresAfterDays')::integer;
    if v_expires<=0 then
      raise exception 'Employer Certification expiration must be greater than zero days';
    end if;
  end if;

  v_criteria:=security.normalize_employer_certification_criteria(
    coalesce(p_payload->'criteria','{}'::jsonb)
  );

  select coalesce(max(d.version),0)+1
  into v_version
  from public.wf_employer_certification_definitions d
  where d.employer_id=p_employer_id
    and lower(d.title)=lower(v_title);

  insert into public.wf_employer_certification_definitions(
    certification_definition_id,
    employer_id,
    micro_cert_id,
    title,
    description,
    criteria,
    version,
    active,
    expires_after_days,
    created_by_user_id,
    created_at,
    updated_at
  ) values(
    security.new_legacy_id('CDF'),
    p_employer_id,
    p_micro_cert_id,
    v_title,
    v_description,
    v_criteria,
    v_version,
    true,
    v_expires,
    v_user_id,
    now(),
    now()
  )
  returning * into v_definition;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_CERTIFICATION_DEFINITION_CREATED',
    'employer_certification_definition',
    v_definition.certification_definition_id,
    'workforce-employer-learning',
    p_employer_id,
    'success',
    jsonb_build_object(
      'microCertId',v_definition.micro_cert_id,
      'title',v_definition.title,
      'version',v_definition.version,
      'criteria',v_definition.criteria,
      'active',v_definition.active,
      'expiresAfterDays',v_definition.expires_after_days
    ),
    jsonb_build_object('source','W11-09A')
  );

  return (
    select x
    from jsonb_array_elements(
      public.employer_certification_definitions(
        p_employer_id,p_micro_cert_id
      )
    ) x
    where x->>'certificationDefinitionId'=
      v_definition.certification_definition_id
    limit 1
  );
end;
$$;

create or replace function public.employer_certification_definition_update(
  p_employer_id text,
  p_certification_definition_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_before public.wf_employer_certification_definitions%rowtype;
  v_after public.wf_employer_certification_definitions%rowtype;
  v_title text;
  v_description text;
  v_expires integer;
  v_criteria jsonb;
  v_active boolean;
  v_locked boolean;
  v_semantic_changed boolean;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Certification management denied';
  end if;

  select * into v_before
  from public.wf_employer_certification_definitions d
  where d.certification_definition_id=p_certification_definition_id
    and d.employer_id=p_employer_id
  for update;

  if not found then
    raise exception 'Employer Certification definition not found';
  end if;

  v_title:=case when p_payload ? 'title'
    then btrim(coalesce(p_payload->>'title',''))
    else v_before.title end;
  if v_title='' then
    raise exception 'Employer Certification title is required';
  end if;

  v_description:=case when p_payload ? 'description'
    then nullif(btrim(coalesce(p_payload->>'description','')),'')
    else v_before.description end;

  if p_payload ? 'expiresAfterDays' then
    if p_payload->'expiresAfterDays' is null
       or p_payload->'expiresAfterDays'='null'::jsonb then
      v_expires:=null;
    else
      v_expires:=(p_payload->>'expiresAfterDays')::integer;
      if v_expires<=0 then
        raise exception 'Employer Certification expiration must be greater than zero days';
      end if;
    end if;
  else
    v_expires:=v_before.expires_after_days;
  end if;

  v_criteria:=case when p_payload ? 'criteria'
    then security.normalize_employer_certification_criteria(p_payload->'criteria')
    else security.normalize_employer_certification_criteria(v_before.criteria)
  end;

  v_active:=case when p_payload ? 'active'
    then coalesce((p_payload->>'active')::boolean,v_before.active)
    else v_before.active
  end;

  v_locked:=security.employer_certification_definition_locked(
    v_before.certification_definition_id
  );

  v_semantic_changed:=
    v_title is distinct from v_before.title
    or v_description is distinct from v_before.description
    or v_criteria is distinct from security.normalize_employer_certification_criteria(v_before.criteria)
    or v_expires is distinct from v_before.expires_after_days;

  if v_locked and v_semantic_changed then
    raise exception 'Published or issued Employer Certification definitions are immutable; create a new definition revision';
  end if;

  update public.wf_employer_certification_definitions
  set title=v_title,
      description=v_description,
      criteria=v_criteria,
      active=v_active,
      expires_after_days=v_expires,
      updated_at=now()
  where certification_definition_id=v_before.certification_definition_id
  returning * into v_after;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_CERTIFICATION_DEFINITION_UPDATED',
    'employer_certification_definition',
    v_after.certification_definition_id,
    'workforce-employer-learning',
    p_employer_id,
    'success',
    jsonb_build_object(
      'title',v_before.title,
      'description',v_before.description,
      'criteria',v_before.criteria,
      'version',v_before.version,
      'active',v_before.active,
      'expiresAfterDays',v_before.expires_after_days
    ),
    jsonb_build_object(
      'title',v_after.title,
      'description',v_after.description,
      'criteria',v_after.criteria,
      'version',v_after.version,
      'active',v_after.active,
      'expiresAfterDays',v_after.expires_after_days
    ),
    jsonb_build_object(
      'source','W11-09A',
      'definitionLocked',v_locked
    )
  );

  return (
    select x
    from jsonb_array_elements(
      public.employer_certification_definitions(
        p_employer_id,v_after.micro_cert_id
      )
    ) x
    where x->>'certificationDefinitionId'=
      v_after.certification_definition_id
    limit 1
  );
end;
$$;

create or replace function public.employer_certification_revoke(
  p_employer_id text,
  p_credential_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_award public.wf_employer_certification_awards%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Certification revocation denied';
  end if;

  if v_reason='' then
    raise exception 'Employer Certification revocation reason is required';
  end if;

  select * into v_award
  from public.wf_employer_certification_awards a
  where lower(a.credential_id)=lower(btrim(p_credential_id))
    and a.employer_id=p_employer_id
  for update;

  if not found then
    raise exception 'Employer Certification credential not found';
  end if;

  if v_award.status='revoked' then
    return security.employer_certification_verification_read_model(
      v_award.credential_id
    );
  end if;

  v_before:=jsonb_build_object(
    'status',security.employer_certification_effective_status(
      v_award.status,v_award.expires_at
    ),
    'canonicalStatus',v_award.status,
    'revokedAt',v_award.revoked_at,
    'revokeReason',v_award.revoke_reason
  );

  update public.wf_employer_certification_awards
  set status='revoked',
      revoked_at=now(),
      revoke_reason=v_reason,
      verification_metadata=verification_metadata||jsonb_build_object(
        'revocationVersion',1,
        'revokedAt',now(),
        'revocationDigest',encode(
          extensions.digest(
            concat_ws(
              '|',
              'txkpro-employer-certification-revocation-v1',
              credential_id,
              v_reason
            ),
            'sha256'
          ),
          'hex'
        )
      ),
      updated_at=now()
  where certification_award_id=v_award.certification_award_id
  returning * into v_award;

  v_after:=jsonb_build_object(
    'status','revoked',
    'canonicalStatus',v_award.status,
    'revokedAt',v_award.revoked_at,
    'revokeReason',v_award.revoke_reason
  );

  perform security.emit_employer_learning_event(
    p_event_type=>'EMPLOYER_CERTIFICATION_REVOKED',
    p_target_id=>v_award.certification_award_id,
    p_event_key=>'employer-certification-revoked:'||v_award.certification_award_id,
    p_source=>'employer',
    p_employer_id=>v_award.employer_id,
    p_student_id=>v_award.student_id,
    p_actor_type=>'user',
    p_before=>v_before,
    p_after=>v_after,
    p_metadata=>jsonb_build_object(
      'certification_award_id',v_award.certification_award_id,
      'credential_id',v_award.credential_id,
      'revoke_reason',v_award.revoke_reason,
      'certification_definition_id',v_award.certification_definition_id,
      'completion_id',v_award.completion_id
    ),
    p_result=>'success'
  );

  return security.employer_certification_verification_read_model(
    v_award.credential_id
  );
end;
$$;

create or replace function public.employer_certification_verify(
  p_credential_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_award public.wf_employer_certification_awards%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_student_id text:=security.current_student_id();
  v_allowed boolean:=false;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required for Employer Certification verification';
  end if;

  select * into v_award
  from public.wf_employer_certification_awards a
  where lower(a.credential_id)=lower(btrim(p_credential_id));

  if not found then
    return jsonb_build_object(
      'found',false,
      'credentialId',btrim(coalesce(p_credential_id,''))
    );
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_award.assignment_id;

  v_allowed:=
    security.is_admin()
    or security.can_view_employer_learning_as_employer(v_award.employer_id)
    or (v_student_id is not null and v_student_id=v_award.student_id)
    or (
      v_assignment.institution_id is not null
      and security.institution_student_accessible(
        v_assignment.institution_id,
        v_award.student_id
      )
    );

  if not v_allowed then
    raise exception 'Employer Certification verification access denied';
  end if;

  return security.employer_certification_verification_read_model(
    v_award.credential_id
  );
end;
$$;

-- Normalize any pre-existing definitions. There are currently no production
-- awards in staging, but this keeps upgrades deterministic.
update public.wf_employer_certification_definitions
set criteria=security.normalize_employer_certification_criteria(criteria),
    updated_at=updated_at;

-- Backfill canonical passed completions that were already linked to active
-- certification definitions before W11-09A. Idempotency prevents duplicates.
do $$
declare
  v_completion record;
begin
  for v_completion in
    select c.completion_id
    from public.wf_micro_cert_completions c
    join public.wf_micro_cert_assignments a
      on a.assignment_id=c.assignment_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
     and v.micro_cert_id=a.micro_cert_id
    join public.wf_employer_certification_definitions d
      on d.certification_definition_id=v.certification_definition_id
     and d.active=true
    where c.outcome='passed'
  loop
    perform security.evaluate_employer_certification_for_completion(
      v_completion.completion_id,
      null
    );
  end loop;
end;
$$;

revoke all on function security.normalize_employer_certification_criteria(jsonb)
  from public,anon,authenticated;
revoke all on function security.employer_certification_effective_status(text,timestamptz)
  from public,anon,authenticated;
revoke all on function security.employer_certification_definition_locked(text)
  from public,anon,authenticated;
revoke all on function security.employer_certification_digest(text,text,text,text,text,text,timestamptz,timestamptz)
  from public,anon,authenticated;
revoke all on function security.validate_employer_certification_definition()
  from public,anon,authenticated;
revoke all on function security.validate_employer_certification_award()
  from public,anon,authenticated;
revoke all on function security.employer_certification_verification_read_model(text)
  from public,anon,authenticated;
revoke all on function security.evaluate_employer_certification_for_completion(text,uuid)
  from public,anon,authenticated;
revoke all on function security.employer_certification_completion_event_trigger()
  from public,anon,authenticated;

grant execute on function security.normalize_employer_certification_criteria(jsonb)
  to service_role;
grant execute on function security.employer_certification_effective_status(text,timestamptz)
  to service_role;
grant execute on function security.employer_certification_definition_locked(text)
  to service_role;
grant execute on function security.employer_certification_digest(text,text,text,text,text,text,timestamptz,timestamptz)
  to service_role;
grant execute on function security.validate_employer_certification_definition()
  to service_role;
grant execute on function security.validate_employer_certification_award()
  to service_role;
grant execute on function security.employer_certification_verification_read_model(text)
  to service_role;
grant execute on function security.evaluate_employer_certification_for_completion(text,uuid)
  to service_role;
grant execute on function security.employer_certification_completion_event_trigger()
  to service_role;

revoke all on function public.employer_certification_definitions(text,text)
  from public,anon;
revoke all on function public.employer_certification_awards(text,text)
  from public,anon;
revoke all on function public.employer_certification_definition_create(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_certification_definition_update(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_certification_revoke(text,text,text)
  from public,anon;
revoke all on function public.employer_certification_verify(text)
  from public,anon;

grant execute on function public.employer_certification_definitions(text,text)
  to authenticated,service_role;
grant execute on function public.employer_certification_awards(text,text)
  to authenticated,service_role;
grant execute on function public.employer_certification_definition_create(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_certification_definition_update(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_certification_revoke(text,text,text)
  to authenticated,service_role;
grant execute on function public.employer_certification_verify(text)
  to authenticated,service_role;

comment on function security.evaluate_employer_certification_for_completion(text,uuid) is
  'W11-09A idempotent formal Employer Certification issuer. Uses canonical passed completion evidence pinned to the exact course version and emits EMPLOYER_CERTIFICATION_AWARDED exactly once. Does not create Company Badges or Instructor Verified Skills.';
comment on function public.employer_certification_verify(text) is
  'W11-09A authenticated credential verification by credential ID. Public unauthenticated verification pages remain W11-09B.';
