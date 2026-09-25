-- W11-04: Employer Micro-Certification Library backend.
-- Authenticated access is exposed through narrow SECURITY DEFINER RPCs.
-- Direct Employer Learning table access remains closed.

create or replace function security.replace_micro_cert_eligibility_rows(
  p_micro_cert_id text,
  p_eligibility jsonb,
  p_actor_user_id text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_institution_id text;
  v_cohort_id text;
  v_trade_id text;
  v_program_name text;
  v_cohort record;
begin
  if p_eligibility is null then
    return;
  end if;
  if jsonb_typeof(p_eligibility) <> 'array' then
    raise exception 'Eligibility must be an array';
  end if;

  delete from public.wf_employer_micro_cert_eligibility
  where micro_cert_id=p_micro_cert_id;

  for v_item in select value from jsonb_array_elements(p_eligibility)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each eligibility item must be an object';
    end if;

    v_institution_id:=nullif(btrim(coalesce(v_item->>'institutionId','')),'');
    v_cohort_id:=nullif(btrim(coalesce(v_item->>'cohortId','')),'');
    v_trade_id:=nullif(btrim(coalesce(v_item->>'tradeId','')),'');
    v_program_name:=nullif(btrim(coalesce(v_item->>'programName','')),'');

    if v_institution_id is null
       and v_cohort_id is null
       and v_trade_id is null
       and v_program_name is null then
      raise exception 'Eligibility requires institutionId, cohortId, tradeId, or programName';
    end if;

    if v_institution_id is not null
       and not exists (
         select 1 from public.wf_institutions i
         where i.institution_id=v_institution_id and i.active=true
       ) then
      raise exception 'Unknown or inactive institution %',v_institution_id;
    end if;

    if v_cohort_id is not null then
      select c.institution_id,c.trade_id,c.program_name
      into v_cohort
      from public.wf_cohorts c
      where c.cohort_id=v_cohort_id;

      if not found then
        raise exception 'Unknown cohort %',v_cohort_id;
      end if;

      if v_institution_id is not null
         and v_cohort.institution_id is distinct from v_institution_id then
        raise exception 'Cohort % is outside institution %',v_cohort_id,v_institution_id;
      end if;

      v_institution_id:=coalesce(v_institution_id,v_cohort.institution_id);

      if v_trade_id is not null
         and v_cohort.trade_id is not null
         and lower(v_trade_id)<>lower(v_cohort.trade_id) then
        raise exception 'Eligibility trade does not match cohort trade';
      end if;

      if v_program_name is not null
         and v_cohort.program_name is not null
         and lower(v_program_name)<>lower(v_cohort.program_name) then
        raise exception 'Eligibility program does not match cohort program';
      end if;
    end if;

    insert into public.wf_employer_micro_cert_eligibility(
      micro_cert_id,institution_id,cohort_id,trade_id,program_name,
      active,created_by_user_id,created_at,updated_at
    ) values(
      p_micro_cert_id,v_institution_id,v_cohort_id,v_trade_id,v_program_name,
      true,p_actor_user_id,now(),now()
    );
  end loop;
end;
$$;

create or replace function public.employer_micro_cert_library(
  p_employer_id text,
  p_status text default null
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
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  if v_status is not null
     and v_status not in ('draft','in_production','review','ready','live','archived') then
    raise exception 'Invalid Micro-Certification status';
  end if;

  return coalesce((
    select jsonb_agg(item order by item->>'updatedAt' desc)
    from (
      select jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'employerId',mc.employer_id,
        'title',mc.title,
        'description',mc.description,
        'active',mc.active,
        'currentVersionId',mc.current_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'contentType',v.content_type,
        'contentUrl',v.content_url,
        'durationMinutes',v.duration_minutes,
        'passingRequirement',v.passing_requirement,
        'companyBadge',case when cb.company_badge_id is null then null else jsonb_build_object(
          'companyBadgeId',cb.company_badge_id,
          'title',cb.title,
          'active',cb.active,
          'version',cb.version
        ) end,
        'eligibility',coalesce((
          select jsonb_agg(jsonb_build_object(
            'eligibilityId',e.eligibility_id,
            'institutionId',e.institution_id,
            'cohortId',e.cohort_id,
            'tradeId',e.trade_id,
            'programName',e.program_name,
            'active',e.active
          ) order by e.created_at)
          from public.wf_employer_micro_cert_eligibility e
          where e.micro_cert_id=mc.micro_cert_id and e.active=true
        ),'[]'::jsonb),
        'assignmentCount',(
          select count(*) from public.wf_micro_cert_assignments a
          where a.micro_cert_id=mc.micro_cert_id and a.status<>'cancelled'
        ),
        'completedCount',(
          select count(*) from public.wf_micro_cert_assignments a
          where a.micro_cert_id=mc.micro_cert_id and a.status='completed'
        ),
        'completionRate',(
          select case when count(*) filter(where a.status<>'cancelled')=0 then 0
            else round(
              (count(*) filter(where a.status='completed')::numeric
               / count(*) filter(where a.status<>'cancelled')::numeric)*100,2
            )
          end
          from public.wf_micro_cert_assignments a
          where a.micro_cert_id=mc.micro_cert_id
        ),
        'createdAt',mc.created_at,
        'updatedAt',mc.updated_at
      ) as item
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=mc.current_version_id
      left join public.wf_company_badges cb
        on cb.company_badge_id=v.company_badge_id
      where mc.employer_id=p_employer_id
        and (v_status is null or v.status=v_status)
    ) q
  ),'[]'::jsonb);
end;
$$;

create or replace function public.employer_micro_cert_detail(
  p_employer_id text,
  p_micro_cert_id text
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
    raise exception 'Employer Learning access denied';
  end if;

  select jsonb_build_object(
    'microCertId',mc.micro_cert_id,
    'employerId',mc.employer_id,
    'title',mc.title,
    'description',mc.description,
    'active',mc.active,
    'currentVersionId',mc.current_version_id,
    'currentVersion',jsonb_build_object(
      'microCertVersionId',cv.micro_cert_version_id,
      'versionNumber',cv.version_number,
      'status',cv.status,
      'learningObjective',cv.learning_objective,
      'contentType',cv.content_type,
      'contentUrl',cv.content_url,
      'equipmentProcessContext',cv.equipment_process_context,
      'safetyNotes',cv.safety_notes,
      'durationMinutes',cv.duration_minutes,
      'passingRequirement',cv.passing_requirement,
      'companyBadgeId',cv.company_badge_id,
      'certificationDefinitionId',cv.certification_definition_id,
      'publishedAt',cv.published_at,
      'createdAt',cv.created_at,
      'updatedAt',cv.updated_at
    ),
    'versions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'microCertVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'contentType',v.content_type,
        'contentUrl',v.content_url,
        'equipmentProcessContext',v.equipment_process_context,
        'safetyNotes',v.safety_notes,
        'durationMinutes',v.duration_minutes,
        'passingRequirement',v.passing_requirement,
        'companyBadgeId',v.company_badge_id,
        'certificationDefinitionId',v.certification_definition_id,
        'publishedAt',v.published_at,
        'createdAt',v.created_at,
        'updatedAt',v.updated_at
      ) order by v.version_number desc)
      from public.wf_employer_micro_cert_versions v
      where v.micro_cert_id=mc.micro_cert_id
    ),'[]'::jsonb),
    'eligibility',coalesce((
      select jsonb_agg(jsonb_build_object(
        'eligibilityId',e.eligibility_id,
        'institutionId',e.institution_id,
        'cohortId',e.cohort_id,
        'tradeId',e.trade_id,
        'programName',e.program_name,
        'active',e.active
      ) order by e.created_at)
      from public.wf_employer_micro_cert_eligibility e
      where e.micro_cert_id=mc.micro_cert_id and e.active=true
    ),'[]'::jsonb),
    'companyBadge',case when cb.company_badge_id is null then null else jsonb_build_object(
      'companyBadgeId',cb.company_badge_id,
      'title',cb.title,
      'description',cb.description,
      'criteria',cb.criteria,
      'active',cb.active,
      'version',cb.version,
      'expiresAfterDays',cb.expires_after_days
    ) end,
    'metrics',jsonb_build_object(
      'assignmentCount',(
        select count(*) from public.wf_micro_cert_assignments a
        where a.micro_cert_id=mc.micro_cert_id and a.status<>'cancelled'
      ),
      'completedCount',(
        select count(*) from public.wf_micro_cert_assignments a
        where a.micro_cert_id=mc.micro_cert_id and a.status='completed'
      ),
      'completionRate',(
        select case when count(*) filter(where a.status<>'cancelled')=0 then 0
          else round(
            (count(*) filter(where a.status='completed')::numeric
             / count(*) filter(where a.status<>'cancelled')::numeric)*100,2
          )
        end
        from public.wf_micro_cert_assignments a
        where a.micro_cert_id=mc.micro_cert_id
      )
    ),
    'createdAt',mc.created_at,
    'updatedAt',mc.updated_at
  )
  into v_result
  from public.wf_employer_micro_certs mc
  join public.wf_employer_micro_cert_versions cv
    on cv.micro_cert_version_id=mc.current_version_id
  left join public.wf_company_badges cb
    on cb.company_badge_id=cv.company_badge_id
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;

  if v_result is null then
    raise exception 'Micro-Certification not found';
  end if;

  return v_result;
end;
$$;

create or replace function public.employer_micro_cert_create(
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
  v_micro_cert_id text:=security.new_legacy_id('EMC');
  v_version_id text:=security.new_legacy_id('MCV');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_status text:=lower(coalesce(nullif(btrim(p_payload->>'status'),''),'draft'));
  v_content_type text:=coalesce(nullif(btrim(p_payload->>'contentType'),''),'video');
  v_duration integer;
  v_passing jsonb:=coalesce(p_payload->'passingRequirement','{}'::jsonb);
  v_badge_id text:=nullif(btrim(coalesce(p_payload->>'companyBadgeId','')),'');
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;
  if v_title is null then
    raise exception 'Micro-Certification title is required';
  end if;
  if length(v_title)>200 then
    raise exception 'Micro-Certification title must be 200 characters or fewer';
  end if;
  if v_description is not null and length(v_description)>4000 then
    raise exception 'Micro-Certification description must be 4000 characters or fewer';
  end if;
  if v_status not in ('draft','in_production','review','ready','live','archived') then
    raise exception 'Invalid Micro-Certification status';
  end if;
  if jsonb_typeof(v_passing)<>'object' then
    raise exception 'passingRequirement must be an object';
  end if;

  if p_payload ? 'durationMinutes' and p_payload->>'durationMinutes' is not null then
    v_duration:=(p_payload->>'durationMinutes')::integer;
    if v_duration<0 then raise exception 'durationMinutes must be non-negative'; end if;
  end if;

  if v_badge_id is not null
     and not exists(
       select 1 from public.wf_company_badges b
       where b.company_badge_id=v_badge_id
         and b.employer_id=p_employer_id
         and b.active=true
     ) then
    raise exception 'Company Badge is outside the Employer scope or inactive';
  end if;

  insert into public.wf_employer_micro_certs(
    micro_cert_id,employer_id,title,description,active,
    created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values(
    v_micro_cert_id,p_employer_id,v_title,v_description,
    coalesce((p_payload->>'active')::boolean,true),
    v_user_id,v_user_id,now(),now()
  );

  insert into public.wf_employer_micro_cert_versions(
    micro_cert_version_id,micro_cert_id,version_number,status,
    learning_objective,content_type,content_url,equipment_process_context,
    safety_notes,duration_minutes,passing_requirement,company_badge_id,
    published_at,created_by_user_id,created_at,updated_at
  ) values(
    v_version_id,v_micro_cert_id,1,v_status,
    nullif(btrim(coalesce(p_payload->>'learningObjective','')),''),
    v_content_type,
    nullif(btrim(coalesce(p_payload->>'contentUrl','')),''),
    nullif(btrim(coalesce(p_payload->>'equipmentProcessContext','')),''),
    nullif(btrim(coalesce(p_payload->>'safetyNotes','')),''),
    v_duration,v_passing,v_badge_id,
    case when v_status='live' then now() else null end,
    v_user_id,now(),now()
  );

  update public.wf_employer_micro_certs
  set current_version_id=v_version_id,updated_at=now()
  where micro_cert_id=v_micro_cert_id;

  perform security.replace_micro_cert_eligibility_rows(
    v_micro_cert_id,
    case when p_payload ? 'eligibility' then p_payload->'eligibility' else null end,
    v_user_id
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_CREATED','employer_micro_cert',
    v_micro_cert_id,'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object(
      'microCertId',v_micro_cert_id,
      'currentVersionId',v_version_id,
      'versionNumber',1,
      'status',v_status
    ),
    jsonb_build_object('source','W11-04')
  );

  return public.employer_micro_cert_detail(p_employer_id,v_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_payload jsonb,
  p_expected_version_number integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_course public.wf_employer_micro_certs%rowtype;
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_before jsonb;
  v_new_status text;
  v_duration integer;
  v_badge_id text;
  v_has_content_change boolean;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs
  where micro_cert_id=p_micro_cert_id and employer_id=p_employer_id
  for update;

  if not found then raise exception 'Micro-Certification not found'; end if;

  select * into v_version
  from public.wf_employer_micro_cert_versions
  where micro_cert_version_id=v_course.current_version_id
  for update;

  if not found then raise exception 'Current Micro-Certification version not found'; end if;

  if p_expected_version_number is not null
     and v_version.version_number<>p_expected_version_number then
    raise exception 'MICRO_CERT_VERSION_CONFLICT';
  end if;

  v_before:=jsonb_build_object(
    'title',v_course.title,
    'description',v_course.description,
    'active',v_course.active,
    'versionNumber',v_version.version_number,
    'status',v_version.status,
    'learningObjective',v_version.learning_objective,
    'contentType',v_version.content_type,
    'contentUrl',v_version.content_url,
    'equipmentProcessContext',v_version.equipment_process_context,
    'safetyNotes',v_version.safety_notes,
    'durationMinutes',v_version.duration_minutes,
    'passingRequirement',v_version.passing_requirement,
    'companyBadgeId',v_version.company_badge_id
  );

  v_has_content_change:=p_payload ?| array[
    'learningObjective','contentType','contentUrl','equipmentProcessContext',
    'safetyNotes','durationMinutes','passingRequirement','companyBadgeId'
  ];

  if v_version.status='archived'
     and (v_has_content_change or p_payload ? 'status') then
    raise exception 'MICRO_CERT_VERSION_IMMUTABLE';
  end if;

  if v_version.status='live' and v_has_content_change then
    raise exception 'MICRO_CERT_VERSION_IMMUTABLE';
  end if;

  if p_payload ? 'title' then
    if nullif(btrim(coalesce(p_payload->>'title','')),'') is null then
      raise exception 'Micro-Certification title is required';
    end if;
    if length(btrim(p_payload->>'title'))>200 then
      raise exception 'Micro-Certification title must be 200 characters or fewer';
    end if;
  end if;

  update public.wf_employer_micro_certs
  set
    title=case when p_payload ? 'title' then btrim(p_payload->>'title') else title end,
    description=case when p_payload ? 'description'
      then nullif(btrim(coalesce(p_payload->>'description','')),'') else description end,
    active=case when p_payload ? 'active'
      then (p_payload->>'active')::boolean else active end,
    updated_by_user_id=v_user_id,
    updated_at=now()
  where micro_cert_id=p_micro_cert_id;

  v_new_status:=case when p_payload ? 'status'
    then lower(nullif(btrim(coalesce(p_payload->>'status','')),''))
    else v_version.status end;

  if v_new_status not in ('draft','in_production','review','ready','live','archived') then
    raise exception 'Invalid Micro-Certification status';
  end if;

  if v_version.status='live'
     and v_new_status not in ('live','archived') then
    raise exception 'Live Micro-Certification versions may only remain live or be archived';
  end if;

  if p_payload ? 'durationMinutes' and p_payload->>'durationMinutes' is not null then
    v_duration:=(p_payload->>'durationMinutes')::integer;
    if v_duration<0 then raise exception 'durationMinutes must be non-negative'; end if;
  else
    v_duration:=v_version.duration_minutes;
  end if;

  if p_payload ? 'passingRequirement'
     and jsonb_typeof(p_payload->'passingRequirement')<>'object' then
    raise exception 'passingRequirement must be an object';
  end if;

  v_badge_id:=case when p_payload ? 'companyBadgeId'
    then nullif(btrim(coalesce(p_payload->>'companyBadgeId','')),'')
    else v_version.company_badge_id end;

  if v_badge_id is not null
     and not exists(
       select 1 from public.wf_company_badges b
       where b.company_badge_id=v_badge_id
         and b.employer_id=p_employer_id
         and b.active=true
     ) then
    raise exception 'Company Badge is outside the Employer scope or inactive';
  end if;

  update public.wf_employer_micro_cert_versions
  set
    status=v_new_status,
    learning_objective=case when p_payload ? 'learningObjective'
      then nullif(btrim(coalesce(p_payload->>'learningObjective','')),'')
      else learning_objective end,
    content_type=case when p_payload ? 'contentType'
      then coalesce(nullif(btrim(p_payload->>'contentType'),''),content_type)
      else content_type end,
    content_url=case when p_payload ? 'contentUrl'
      then nullif(btrim(coalesce(p_payload->>'contentUrl','')),'')
      else content_url end,
    equipment_process_context=case when p_payload ? 'equipmentProcessContext'
      then nullif(btrim(coalesce(p_payload->>'equipmentProcessContext','')),'')
      else equipment_process_context end,
    safety_notes=case when p_payload ? 'safetyNotes'
      then nullif(btrim(coalesce(p_payload->>'safetyNotes','')),'')
      else safety_notes end,
    duration_minutes=v_duration,
    passing_requirement=case when p_payload ? 'passingRequirement'
      then p_payload->'passingRequirement' else passing_requirement end,
    company_badge_id=v_badge_id,
    published_at=case
      when v_new_status='live' then coalesce(published_at,now())
      else published_at
    end,
    updated_at=now()
  where micro_cert_version_id=v_version.micro_cert_version_id;

  if p_payload ? 'eligibility' then
    perform security.replace_micro_cert_eligibility_rows(
      p_micro_cert_id,p_payload->'eligibility',v_user_id
    );
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_UPDATED','employer_micro_cert',
    p_micro_cert_id,'workforce-employer-learning',p_employer_id,'success',
    v_before,
    public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id),
    jsonb_build_object(
      'source','W11-04',
      'versionNumber',v_version.version_number
    )
  );

  return public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_create_version(
  p_employer_id text,
  p_micro_cert_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_course public.wf_employer_micro_certs%rowtype;
  v_current public.wf_employer_micro_cert_versions%rowtype;
  v_version_id text:=security.new_legacy_id('MCV');
  v_next integer;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs
  where micro_cert_id=p_micro_cert_id and employer_id=p_employer_id
  for update;
  if not found then raise exception 'Micro-Certification not found'; end if;

  select * into v_current
  from public.wf_employer_micro_cert_versions
  where micro_cert_version_id=v_course.current_version_id;
  if not found then raise exception 'Current Micro-Certification version not found'; end if;

  select coalesce(max(version_number),0)+1 into v_next
  from public.wf_employer_micro_cert_versions
  where micro_cert_id=p_micro_cert_id;

  insert into public.wf_employer_micro_cert_versions(
    micro_cert_version_id,micro_cert_id,version_number,status,
    learning_objective,content_type,content_url,equipment_process_context,
    safety_notes,duration_minutes,passing_requirement,company_badge_id,
    certification_definition_id,published_at,created_by_user_id,created_at,updated_at
  ) values(
    v_version_id,p_micro_cert_id,v_next,'draft',
    v_current.learning_objective,v_current.content_type,v_current.content_url,
    v_current.equipment_process_context,v_current.safety_notes,
    v_current.duration_minutes,v_current.passing_requirement,
    v_current.company_badge_id,v_current.certification_definition_id,
    null,v_user_id,now(),now()
  );

  update public.wf_employer_micro_certs
  set current_version_id=v_version_id,
      updated_by_user_id=v_user_id,
      updated_at=now()
  where micro_cert_id=p_micro_cert_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_VERSION_CREATED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'currentVersionId',v_current.micro_cert_version_id,
      'versionNumber',v_current.version_number,
      'status',v_current.status
    ),
    jsonb_build_object(
      'currentVersionId',v_version_id,
      'versionNumber',v_next,
      'status','draft'
    ),
    jsonb_build_object('source','W11-04')
  );

  return public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_replace_eligibility(
  p_employer_id text,
  p_micro_cert_id text,
  p_eligibility jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_before jsonb;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  if not exists(
    select 1 from public.wf_employer_micro_certs mc
    where mc.micro_cert_id=p_micro_cert_id and mc.employer_id=p_employer_id
  ) then
    raise exception 'Micro-Certification not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eligibilityId',e.eligibility_id,
    'institutionId',e.institution_id,
    'cohortId',e.cohort_id,
    'tradeId',e.trade_id,
    'programName',e.program_name,
    'active',e.active
  ) order by e.created_at),'[]'::jsonb)
  into v_before
  from public.wf_employer_micro_cert_eligibility e
  where e.micro_cert_id=p_micro_cert_id and e.active=true;

  perform security.replace_micro_cert_eligibility_rows(
    p_micro_cert_id,p_eligibility,v_user_id
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ELIGIBILITY_CHANGED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'eligibilityId',e.eligibility_id,
      'institutionId',e.institution_id,
      'cohortId',e.cohort_id,
      'tradeId',e.trade_id,
      'programName',e.program_name,
      'active',e.active
    ) order by e.created_at),'[]'::jsonb)
     from public.wf_employer_micro_cert_eligibility e
     where e.micro_cert_id=p_micro_cert_id and e.active=true),
    jsonb_build_object('source','W11-04')
  );

  return public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.institution_employer_micro_cert_library(
  p_institution_id text,
  p_cohort_id text default null,
  p_employer_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.can_view_institution_employer_learning(
    p_institution_id,p_cohort_id
  ) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  if p_cohort_id is not null
     and not exists(
       select 1 from public.wf_cohorts c
       where c.cohort_id=p_cohort_id
         and c.institution_id=p_institution_id
     ) then
    raise exception 'Cohort is outside Institution scope';
  end if;

  return coalesce((
    select jsonb_agg(item order by item->>'title')
    from (
      select jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'employerId',mc.employer_id,
        'employerName',c.business_name,
        'title',mc.title,
        'description',mc.description,
        'currentVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'contentType',v.content_type,
        'durationMinutes',v.duration_minutes,
        'passingRequirement',v.passing_requirement,
        'companyBadge',case when cb.company_badge_id is null then null else jsonb_build_object(
          'companyBadgeId',cb.company_badge_id,
          'title',cb.title,
          'version',cb.version
        ) end,
        'eligibility',coalesce((
          select jsonb_agg(jsonb_build_object(
            'institutionId',e.institution_id,
            'cohortId',e.cohort_id,
            'tradeId',e.trade_id,
            'programName',e.program_name
          ) order by e.created_at)
          from public.wf_employer_micro_cert_eligibility e
          where e.micro_cert_id=mc.micro_cert_id
            and e.active=true
        ),'[]'::jsonb)
      ) as item
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=mc.current_version_id
      join public.contractors c
        on c.contractor_id=mc.employer_id
      left join public.wf_company_badges cb
        on cb.company_badge_id=v.company_badge_id
      where mc.active=true
        and v.status in ('ready','live')
        and c.approval_status='approved'
        and c.account_status not in ('suspended','closed')
        and (p_employer_id is null or mc.employer_id=p_employer_id)
        and exists(
          select 1
          from public.wf_employer_micro_cert_eligibility e
          left join public.wf_cohorts ec on ec.cohort_id=p_cohort_id
          where e.micro_cert_id=mc.micro_cert_id
            and e.active=true
            and (e.institution_id is null or e.institution_id=p_institution_id)
            and (
              (p_cohort_id is null and e.cohort_id is null)
              or
              (p_cohort_id is not null
                and (e.cohort_id is null or e.cohort_id=p_cohort_id)
                and (e.trade_id is null or lower(e.trade_id)=lower(coalesce(ec.trade_id,'')))
                and (e.program_name is null or lower(e.program_name)=lower(coalesce(ec.program_name,'')))
              )
            )
        )
    ) q
  ),'[]'::jsonb);
end;
$$;

revoke all on function security.replace_micro_cert_eligibility_rows(text,jsonb,text)
from public,anon,authenticated;
grant execute on function security.replace_micro_cert_eligibility_rows(text,jsonb,text)
to service_role;

revoke all on function public.employer_micro_cert_library(text,text)
from public,anon;
revoke all on function public.employer_micro_cert_detail(text,text)
from public,anon;
revoke all on function public.employer_micro_cert_create(text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_update(text,text,jsonb,integer)
from public,anon;
revoke all on function public.employer_micro_cert_create_version(text,text)
from public,anon;
revoke all on function public.employer_micro_cert_replace_eligibility(text,text,jsonb)
from public,anon;
revoke all on function public.institution_employer_micro_cert_library(text,text,text)
from public,anon;

grant execute on function public.employer_micro_cert_library(text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_detail(text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_create(text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_update(text,text,jsonb,integer)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_create_version(text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_replace_eligibility(text,text,jsonb)
to authenticated,service_role;
grant execute on function public.institution_employer_micro_cert_library(text,text,text)
to authenticated,service_role;
