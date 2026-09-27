
-- W11-09 — Company Badge definitions + automatic award evaluation.
-- Company Badges are Employer-specific readiness signals only. They do not
-- create Instructor Verified Skill evidence or formal Employer Certifications.

create or replace function security.normalize_company_badge_criteria(
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
    raise exception 'Company Badge criteria must be an object';
  end if;

  v_version:=coalesce((v_criteria->>'criteriaVersion')::integer,1);
  v_evidence_type:=lower(btrim(coalesce(v_criteria->>'evidenceType','micro_cert_completion')));
  v_required_outcome:=lower(btrim(coalesce(v_criteria->>'requiredOutcome','passed')));

  if v_version<>1 then
    raise exception 'Unsupported Company Badge criteria version';
  end if;
  if v_evidence_type<>'micro_cert_completion' then
    raise exception 'Company Badge evidenceType must be micro_cert_completion';
  end if;
  if v_required_outcome<>'passed' then
    raise exception 'Company Badge requiredOutcome must be passed';
  end if;

  return jsonb_build_object(
    'criteriaVersion',1,
    'evidenceType','micro_cert_completion',
    'requiredOutcome','passed'
  );
end;
$$;

create or replace function security.company_badge_definition_locked(
  p_company_badge_id text
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
      where v.company_badge_id=p_company_badge_id
        and v.status in ('ready','live','archived')
    )
    or exists(
      select 1
      from public.wf_company_badge_awards a
      where a.company_badge_id=p_company_badge_id
    ),
    false
  );
$$;

create or replace function security.validate_company_badge_award()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_badge public.wf_company_badges%rowtype;
  v_completion public.wf_micro_cert_completions%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_course public.wf_employer_micro_certs%rowtype;
begin
  select * into v_badge
  from public.wf_company_badges b
  where b.company_badge_id=new.company_badge_id;

  if not found then
    raise exception 'Company Badge definition not found';
  end if;

  if v_badge.employer_id<>new.employer_id then
    raise exception 'Company Badge award Employer does not match badge issuer';
  end if;

  if new.evidence_type='micro_cert_completion' then
    if new.completion_id is null or new.evidence_id<>new.completion_id then
      raise exception 'Company Badge completion evidence must use completion_id as evidence_id';
    end if;

    select * into v_completion
    from public.wf_micro_cert_completions c
    where c.completion_id=new.completion_id
      and c.outcome='passed';

    if not found then
      raise exception 'Company Badge requires canonical passed completion evidence';
    end if;

    select * into v_assignment
    from public.wf_micro_cert_assignments a
    where a.assignment_id=v_completion.assignment_id;

    if not found then
      raise exception 'Company Badge completion assignment not found';
    end if;

    select * into v_version
    from public.wf_employer_micro_cert_versions v
    where v.micro_cert_version_id=v_assignment.micro_cert_version_id
      and v.micro_cert_id=v_assignment.micro_cert_id;

    select * into v_course
    from public.wf_employer_micro_certs mc
    where mc.micro_cert_id=v_assignment.micro_cert_id;

    if v_assignment.student_id<>new.student_id
       or v_course.employer_id<>new.employer_id
       or v_version.company_badge_id is distinct from new.company_badge_id
       or new.micro_cert_id is distinct from v_assignment.micro_cert_id
       or new.micro_cert_version_id is distinct from v_assignment.micro_cert_version_id then
      raise exception 'Company Badge award provenance does not match configured completion evidence';
    end if;
  end if;

  if new.expires_at is not null and new.expires_at<=new.issued_at then
    raise exception 'Company Badge expiration must be after issue date';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wf_company_badge_award_validate
  on public.wf_company_badge_awards;
create trigger trg_wf_company_badge_award_validate
before insert or update
on public.wf_company_badge_awards
for each row
execute function security.validate_company_badge_award();

create or replace function security.evaluate_company_badge_for_completion(
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
  v_badge public.wf_company_badges%rowtype;
  v_award public.wf_company_badge_awards%rowtype;
  v_award_id text;
  v_expires_at timestamptz;
  v_criteria jsonb;
  v_existing boolean:=false;
begin
  select * into v_completion
  from public.wf_micro_cert_completions c
  where c.completion_id=p_completion_id
    and c.outcome='passed';

  if not found then
    return jsonb_build_object(
      'awarded',false,
      'reason','passed_completion_not_found',
      'completionId',p_completion_id
    );
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=v_completion.assignment_id;

  if not found then
    raise exception 'Completion assignment not found';
  end if;

  select * into v_version
  from public.wf_employer_micro_cert_versions v
  where v.micro_cert_version_id=v_assignment.micro_cert_version_id
    and v.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Completion course version not found';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Completion course not found';
  end if;

  if v_version.company_badge_id is null then
    return jsonb_build_object(
      'awarded',false,
      'reason','no_company_badge_configured',
      'completionId',v_completion.completion_id,
      'microCertVersionId',v_assignment.micro_cert_version_id
    );
  end if;

  select * into v_badge
  from public.wf_company_badges b
  where b.company_badge_id=v_version.company_badge_id
    and b.employer_id=v_course.employer_id;

  if not found then
    raise exception 'Configured Company Badge is outside the Employer scope';
  end if;

  if not v_badge.active then
    return jsonb_build_object(
      'awarded',false,
      'reason','company_badge_inactive',
      'companyBadgeId',v_badge.company_badge_id,
      'completionId',v_completion.completion_id
    );
  end if;

  v_criteria:=security.normalize_company_badge_criteria(v_badge.criteria);

  select *
  into v_award
  from public.wf_company_badge_awards a
  where a.company_badge_id=v_badge.company_badge_id
    and a.student_id=v_assignment.student_id
    and a.evidence_type='micro_cert_completion'
    and a.evidence_id=v_completion.completion_id
  limit 1;

  if found then
    v_existing:=true;
  else
    v_award_id:=security.new_legacy_id('CBA');
    v_expires_at:=case
      when v_badge.expires_after_days is null then null
      else v_completion.completed_at
        + make_interval(days=>v_badge.expires_after_days)
    end;

    insert into public.wf_company_badge_awards(
      company_badge_award_id,
      company_badge_id,
      student_id,
      employer_id,
      evidence_type,
      evidence_id,
      completion_id,
      micro_cert_id,
      micro_cert_version_id,
      issued_at,
      expires_at,
      metadata,
      created_at
    ) values(
      v_award_id,
      v_badge.company_badge_id,
      v_assignment.student_id,
      v_course.employer_id,
      'micro_cert_completion',
      v_completion.completion_id,
      v_completion.completion_id,
      v_assignment.micro_cert_id,
      v_assignment.micro_cert_version_id,
      v_completion.completed_at,
      v_expires_at,
      jsonb_build_object(
        'badgeVersion',v_badge.version,
        'badgeTitle',v_badge.title,
        'badgeDescription',v_badge.description,
        'badgeCriteria',v_criteria,
        'assignmentId',v_assignment.assignment_id,
        'completionId',v_completion.completion_id,
        'microCertId',v_assignment.micro_cert_id,
        'microCertVersionId',v_assignment.micro_cert_version_id,
        'courseTitle',v_course.title,
        'issuedByEmployerId',v_course.employer_id,
        'evidenceCategory','employer_training',
        'technicalSkillVerified',false,
        'automationVersion','W11-09'
      ),
      now()
    )
    on conflict(company_badge_id,student_id,evidence_type,evidence_id)
    do nothing
    returning * into v_award;

    if not found then
      select *
      into v_award
      from public.wf_company_badge_awards a
      where a.company_badge_id=v_badge.company_badge_id
        and a.student_id=v_assignment.student_id
        and a.evidence_type='micro_cert_completion'
        and a.evidence_id=v_completion.completion_id
      limit 1;
      v_existing:=true;
    end if;
  end if;

  perform security.emit_employer_learning_event(
    p_event_type=>'COMPANY_BADGE_AWARDED',
    p_target_id=>v_award.company_badge_award_id,
    p_event_key=>'company-badge-awarded:'||
      v_badge.company_badge_id||':'||v_completion.completion_id,
    p_source=>'system',
    p_employer_id=>v_course.employer_id,
    p_institution_id=>v_assignment.institution_id,
    p_student_id=>v_assignment.student_id,
    p_actor_type=>'system',
    p_metadata=>jsonb_build_object(
      'company_badge_award_id',v_award.company_badge_award_id,
      'company_badge_id',v_badge.company_badge_id,
      'evidence_type','micro_cert_completion',
      'evidence_id',v_completion.completion_id,
      'completion_id',v_completion.completion_id,
      'assignment_id',v_assignment.assignment_id,
      'micro_cert_id',v_assignment.micro_cert_id,
      'micro_cert_version_id',v_assignment.micro_cert_version_id,
      'badge_version',v_badge.version,
      'evidence_category','employer_training',
      'technical_skill_verified',false
    ),
    p_result=>'success',
    p_correlation_id=>p_correlation_id
  );

  return jsonb_build_object(
    'awarded',true,
    'alreadyAwarded',v_existing,
    'companyBadgeAwardId',v_award.company_badge_award_id,
    'companyBadgeId',v_award.company_badge_id,
    'studentId',v_award.student_id,
    'employerId',v_award.employer_id,
    'evidenceType',v_award.evidence_type,
    'evidenceId',v_award.evidence_id,
    'completionId',v_award.completion_id,
    'microCertId',v_award.micro_cert_id,
    'microCertVersionId',v_award.micro_cert_version_id,
    'issuedAt',v_award.issued_at,
    'expiresAt',v_award.expires_at,
    'metadata',v_award.metadata
  );
end;
$$;

create or replace function security.company_badge_completion_event_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.event_type='MICRO_CERT_COMPLETED'
     and new.result='success'
     and new.target_id is not null then
    perform security.evaluate_company_badge_for_completion(
      new.target_id,
      new.correlation_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_wf_company_badge_completion_event
  on public.wf_domain_events;
create trigger trg_wf_company_badge_completion_event
after insert
on public.wf_domain_events
for each row
when (new.event_type='MICRO_CERT_COMPLETED' and new.result='success')
execute function security.company_badge_completion_event_trigger();

create or replace function public.employer_company_badges(
  p_employer_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning view denied';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'companyBadgeId',b.company_badge_id,
        'employerId',b.employer_id,
        'title',b.title,
        'description',b.description,
        'criteria',security.normalize_company_badge_criteria(b.criteria),
        'version',b.version,
        'active',b.active,
        'expiresAfterDays',b.expires_after_days,
        'locked',security.company_badge_definition_locked(b.company_badge_id),
        'linkedVersionCount',(
          select count(*)
          from public.wf_employer_micro_cert_versions v
          where v.company_badge_id=b.company_badge_id
        ),
        'awardCount',(
          select count(*)
          from public.wf_company_badge_awards a
          where a.company_badge_id=b.company_badge_id
        ),
        'activeAwardCount',(
          select count(*)
          from public.wf_company_badge_awards a
          where a.company_badge_id=b.company_badge_id
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at>now())
        ),
        'createdAt',b.created_at,
        'updatedAt',b.updated_at
      )
      order by b.active desc,b.updated_at desc,b.title
    )
    from public.wf_company_badges b
    where b.employer_id=p_employer_id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_company_badge_awards(
  p_employer_id text,
  p_company_badge_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning view denied';
  end if;

  if p_company_badge_id is not null and not exists(
    select 1
    from public.wf_company_badges b
    where b.company_badge_id=p_company_badge_id
      and b.employer_id=p_employer_id
  ) then
    raise exception 'Company Badge not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'companyBadgeAwardId',a.company_badge_award_id,
        'companyBadgeId',a.company_badge_id,
        'badgeTitle',coalesce(a.metadata->>'badgeTitle',b.title),
        'badgeVersion',coalesce((a.metadata->>'badgeVersion')::integer,b.version),
        'studentId',a.student_id,
        'employerId',a.employer_id,
        'evidenceType',a.evidence_type,
        'evidenceId',a.evidence_id,
        'completionId',a.completion_id,
        'microCertId',a.micro_cert_id,
        'microCertVersionId',a.micro_cert_version_id,
        'courseTitle',coalesce(a.metadata->>'courseTitle',mc.title),
        'versionNumber',v.version_number,
        'issuedAt',a.issued_at,
        'expiresAt',a.expires_at,
        'revokedAt',a.revoked_at,
        'revokeReason',a.revoke_reason,
        'status',case
          when a.revoked_at is not null then 'revoked'
          when a.expires_at is not null and a.expires_at<=now() then 'expired'
          else 'active'
        end,
        'metadata',a.metadata
      )
      order by a.issued_at desc,a.created_at desc
    )
    from public.wf_company_badge_awards a
    join public.wf_company_badges b
      on b.company_badge_id=a.company_badge_id
    left join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    left join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
    where a.employer_id=p_employer_id
      and (p_company_badge_id is null or a.company_badge_id=p_company_badge_id)
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_company_badge_create(
  p_employer_id text,
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
  v_badge public.wf_company_badges%rowtype;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  if v_title='' then
    raise exception 'Company Badge title is required';
  end if;

  if p_payload ? 'expiresAfterDays'
     and p_payload->'expiresAfterDays' is not null
     and p_payload->'expiresAfterDays'<>'null'::jsonb then
    v_expires:=(p_payload->>'expiresAfterDays')::integer;
    if v_expires<=0 then
      raise exception 'Company Badge expiration must be greater than zero days';
    end if;
  end if;

  v_criteria:=security.normalize_company_badge_criteria(
    coalesce(p_payload->'criteria','{}'::jsonb)
  );

  insert into public.wf_company_badges(
    company_badge_id,employer_id,title,description,criteria,version,active,
    expires_after_days,created_by_user_id,created_at,updated_at
  ) values(
    security.new_legacy_id('CBG'),p_employer_id,v_title,v_description,
    v_criteria,1,true,v_expires,v_user_id,now(),now()
  )
  returning * into v_badge;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'COMPANY_BADGE_DEFINITION_CREATED',
    'company_badge',v_badge.company_badge_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'title',v_badge.title,
      'version',v_badge.version,
      'criteria',v_badge.criteria,
      'active',v_badge.active,
      'expiresAfterDays',v_badge.expires_after_days
    ),
    jsonb_build_object('source','W11-09')
  );

  return (
    select x
    from jsonb_array_elements(public.employer_company_badges(p_employer_id)) x
    where x->>'companyBadgeId'=v_badge.company_badge_id
    limit 1
  );
end;
$$;

create or replace function public.employer_company_badge_update(
  p_employer_id text,
  p_company_badge_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_before public.wf_company_badges%rowtype;
  v_after public.wf_company_badges%rowtype;
  v_title text;
  v_description text;
  v_expires integer;
  v_criteria jsonb;
  v_active boolean;
  v_locked boolean;
  v_immutable_changed boolean;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_before
  from public.wf_company_badges b
  where b.company_badge_id=p_company_badge_id
    and b.employer_id=p_employer_id
  for update;

  if not found then
    raise exception 'Company Badge not found';
  end if;

  v_title:=case when p_payload ? 'title'
    then btrim(coalesce(p_payload->>'title','')) else v_before.title end;
  if v_title='' then raise exception 'Company Badge title is required'; end if;

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
        raise exception 'Company Badge expiration must be greater than zero days';
      end if;
    end if;
  else
    v_expires:=v_before.expires_after_days;
  end if;

  v_criteria:=case when p_payload ? 'criteria'
    then security.normalize_company_badge_criteria(p_payload->'criteria')
    else security.normalize_company_badge_criteria(v_before.criteria) end;

  v_active:=case when p_payload ? 'active'
    then coalesce((p_payload->>'active')::boolean,v_before.active)
    else v_before.active end;

  v_locked:=security.company_badge_definition_locked(v_before.company_badge_id);
  v_immutable_changed:=
    v_title is distinct from v_before.title
    or v_description is distinct from v_before.description
    or v_criteria is distinct from security.normalize_company_badge_criteria(v_before.criteria)
    or v_expires is distinct from v_before.expires_after_days;

  if v_locked and v_immutable_changed then
    raise exception 'Published or awarded Company Badge definitions are immutable; create a new badge definition';
  end if;

  update public.wf_company_badges
  set title=v_title,
      description=v_description,
      criteria=v_criteria,
      version=case when v_immutable_changed then version+1 else version end,
      active=v_active,
      expires_after_days=v_expires,
      updated_at=now()
  where company_badge_id=v_before.company_badge_id
  returning * into v_after;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'COMPANY_BADGE_DEFINITION_UPDATED',
    'company_badge',v_after.company_badge_id,'workforce-employer-learning',
    p_employer_id,'success',
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
    jsonb_build_object('source','W11-09','definitionLocked',v_locked)
  );

  return (
    select x
    from jsonb_array_elements(public.employer_company_badges(p_employer_id)) x
    where x->>'companyBadgeId'=v_after.company_badge_id
    limit 1
  );
end;
$$;

-- Canonical badge criteria default for any pre-existing definitions.
update public.wf_company_badges
set criteria=security.normalize_company_badge_criteria(criteria),
    updated_at=updated_at;

-- Backfill any existing passed completion that was already linked to an active
-- Company Badge before W11-09 was deployed. Idempotency prevents duplicates.
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
    join public.wf_company_badges b
      on b.company_badge_id=v.company_badge_id
     and b.active=true
    where c.outcome='passed'
  loop
    perform security.evaluate_company_badge_for_completion(
      v_completion.completion_id,
      null
    );
  end loop;
end;
$$;

revoke all on function security.normalize_company_badge_criteria(jsonb)
  from public,anon,authenticated;
revoke all on function security.company_badge_definition_locked(text)
  from public,anon,authenticated;
revoke all on function security.validate_company_badge_award()
  from public,anon,authenticated;
revoke all on function security.evaluate_company_badge_for_completion(text,uuid)
  from public,anon,authenticated;
revoke all on function security.company_badge_completion_event_trigger()
  from public,anon,authenticated;

grant execute on function security.normalize_company_badge_criteria(jsonb)
  to service_role;
grant execute on function security.company_badge_definition_locked(text)
  to service_role;
grant execute on function security.validate_company_badge_award()
  to service_role;
grant execute on function security.evaluate_company_badge_for_completion(text,uuid)
  to service_role;
grant execute on function security.company_badge_completion_event_trigger()
  to service_role;

revoke all on function public.employer_company_badges(text)
  from public,anon;
revoke all on function public.employer_company_badge_awards(text,text)
  from public,anon;
revoke all on function public.employer_company_badge_create(text,jsonb)
  from public,anon;
revoke all on function public.employer_company_badge_update(text,text,jsonb)
  from public,anon;

grant execute on function public.employer_company_badges(text)
  to authenticated,service_role;
grant execute on function public.employer_company_badge_awards(text,text)
  to authenticated,service_role;
grant execute on function public.employer_company_badge_create(text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_company_badge_update(text,text,jsonb)
  to authenticated,service_role;

comment on function security.evaluate_company_badge_for_completion(text,uuid) is
  'W11-09 idempotent Company Badge award evaluator for canonical passed Employer Training completion evidence. Awards preserve badge definition revision, course/version, assignment, completion, issue/expiration and evidence provenance. It never creates Instructor Verified Skills or Employer Certifications.';
comment on function public.employer_company_badges(text) is
  'Employer-scoped Company Badge definition library. All Employer learning roles may view; only Employer Owner/Admin may mutate through scoped write RPCs.';
