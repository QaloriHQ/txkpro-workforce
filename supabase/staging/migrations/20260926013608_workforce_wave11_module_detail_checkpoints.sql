-- W11-05: Employer Training Module Detail + interactive checkpoints.
-- Source-derived fields: learning objective, primary video/embed, equipment/process
-- context, safety notes, interactive checkpoints, passing requirement, Company Badge,
-- assignment count, completion rate.
-- Full assessment/question/answer-key authoring remains W11-05A.

-- ---------------------------------------------------------------------------
-- Checkpoint model hardening
-- ---------------------------------------------------------------------------

alter table public.wf_employer_micro_cert_checkpoints
  add column if not exists created_by_user_id text
    references public.users(user_id) on delete set null;

create index if not exists wf_micro_cert_checkpoints_created_by_idx
  on public.wf_employer_micro_cert_checkpoints(created_by_user_id)
  where created_by_user_id is not null;

alter table public.wf_employer_micro_cert_checkpoints
  drop constraint if exists wf_employer_micro_cert_checkpoints_checkpoint_type_check;

alter table public.wf_employer_micro_cert_checkpoints
  add constraint wf_employer_micro_cert_checkpoints_checkpoint_type_check
  check (checkpoint_type in ('acknowledgement','confirmation','reflection'));

alter table public.wf_employer_micro_cert_checkpoints
  add constraint wf_employer_micro_cert_checkpoints_config_object_check
  check (jsonb_typeof(config)='object');

alter table public.wf_employer_micro_cert_checkpoints
  add constraint wf_employer_micro_cert_checkpoints_weight_upper_check
  check (weight <= 1000);

-- ---------------------------------------------------------------------------
-- Deterministic course-level completion requirement normalization
-- ---------------------------------------------------------------------------

create or replace function security.normalize_micro_cert_passing_requirement(
  p_requirement jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_req jsonb:=coalesce(p_requirement,'{}'::jsonb);
  v_mode text;
  v_min numeric;
  v_lessons boolean;
  v_assessments boolean;
begin
  if jsonb_typeof(v_req)<>'object' then
    raise exception 'passingRequirement must be an object';
  end if;

  if v_req='{}'::jsonb then
    return '{}'::jsonb;
  end if;

  v_mode:=coalesce(nullif(btrim(v_req->>'checkpointMode'),''),'all_required');
  if v_mode not in ('all_required','weighted_percent') then
    raise exception 'checkpointMode must be all_required or weighted_percent';
  end if;

  begin
    v_min:=coalesce((v_req->>'minimumCheckpointPercent')::numeric,100);
  exception when others then
    raise exception 'minimumCheckpointPercent must be numeric';
  end;
  if v_min<0 or v_min>100 then
    raise exception 'minimumCheckpointPercent must be between 0 and 100';
  end if;

  begin
    v_lessons:=coalesce((v_req->>'requireAllRequiredLessons')::boolean,true);
    v_assessments:=coalesce((v_req->>'requireAllRequiredAssessments')::boolean,true);
  exception when others then
    raise exception 'Completion requirement flags must be boolean';
  end;

  return jsonb_build_object(
    'completionRuleVersion',1,
    'checkpointMode',v_mode,
    'minimumCheckpointPercent',v_min,
    'requireAllRequiredLessons',v_lessons,
    'requireAllRequiredAssessments',v_assessments
  );
end;
$$;

create or replace function security.enforce_micro_cert_passing_requirement()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.passing_requirement :=
    security.normalize_micro_cert_passing_requirement(new.passing_requirement);
  return new;
end;
$$;

drop trigger if exists trg_wf_micro_cert_versions_passing_requirement
  on public.wf_employer_micro_cert_versions;

create trigger trg_wf_micro_cert_versions_passing_requirement
before insert or update of passing_requirement
on public.wf_employer_micro_cert_versions
for each row execute function security.enforce_micro_cert_passing_requirement();

revoke all on function security.normalize_micro_cert_passing_requirement(jsonb)
  from public,anon,authenticated;
revoke all on function security.enforce_micro_cert_passing_requirement()
  from public,anon,authenticated;
grant execute on function security.normalize_micro_cert_passing_requirement(jsonb)
  to service_role;
grant execute on function security.enforce_micro_cert_passing_requirement()
  to service_role;

-- ---------------------------------------------------------------------------
-- Module Detail read model. Assessment metadata is safe summary only:
-- no assessment questions or answer keys are returned.
-- ---------------------------------------------------------------------------

create or replace function public.employer_micro_cert_module_detail(
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
  v_base jsonb;
  v_version_id text;
  v_certification jsonb;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  select mc.current_version_id
  into v_version_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;

  if not found then
    raise exception 'Micro-Certification not found';
  end if;

  v_base:=public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );

  select case when c.certification_definition_id is null then null
    else jsonb_build_object(
      'certificationDefinitionId',c.certification_definition_id,
      'title',c.title,
      'description',c.description,
      'criteria',c.criteria,
      'version',c.version,
      'active',c.active,
      'expiresAfterDays',c.expires_after_days
    )
  end
  into v_certification
  from public.wf_employer_micro_cert_versions v
  left join public.wf_employer_certification_definitions c
    on c.certification_definition_id=v.certification_definition_id
   and c.employer_id=p_employer_id
   and c.micro_cert_id=p_micro_cert_id
  where v.micro_cert_version_id=v_version_id;

  return v_base || jsonb_build_object(
    'checkpoints',coalesce((
      select jsonb_agg(jsonb_build_object(
        'checkpointId',cp.checkpoint_id,
        'microCertVersionId',cp.micro_cert_version_id,
        'sequence',cp.sequence_no,
        'title',cp.title,
        'prompt',cp.prompt,
        'checkpointType',cp.checkpoint_type,
        'config',cp.config,
        'required',cp.required,
        'weight',cp.weight,
        'createdAt',cp.created_at,
        'updatedAt',cp.updated_at
      ) order by cp.sequence_no,cp.created_at)
      from public.wf_employer_micro_cert_checkpoints cp
      where cp.micro_cert_version_id=v_version_id
    ),'[]'::jsonb),
    'assessmentSummary',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentId',a.assessment_id,
        'lessonId',a.lesson_id,
        'sequence',a.sequence_no,
        'title',a.title,
        'description',a.description,
        'assessmentType',a.assessment_type,
        'passingScore',a.passing_score,
        'maxAttempts',a.max_attempts,
        'required',a.required,
        'randomizeQuestions',a.randomize_questions,
        'showFeedback',a.show_feedback,
        'questionCount',(
          select count(*)
          from public.wf_employer_micro_cert_assessment_questions q
          where q.assessment_id=a.assessment_id
        ),
        'createdAt',a.created_at,
        'updatedAt',a.updated_at
      ) order by a.sequence_no,a.created_at)
      from public.wf_employer_micro_cert_assessments a
      where a.micro_cert_version_id=v_version_id
    ),'[]'::jsonb),
    'certification',v_certification,
    'resourceSummary',jsonb_build_object(
      'primaryContentType',(
        select v.content_type
        from public.wf_employer_micro_cert_versions v
        where v.micro_cert_version_id=v_version_id
      ),
      'primaryContentUrl',(
        select v.content_url
        from public.wf_employer_micro_cert_versions v
        where v.micro_cert_version_id=v_version_id
      ),
      'resources',coalesce((
        select jsonb_agg(jsonb_build_object(
          'lessonId',l.lesson_id,
          'lessonTitle',l.title,
          'lessonBlockId',b.lesson_block_id,
          'blockType',b.block_type,
          'title',b.title,
          'url',b.content->>'url'
        ) order by l.sequence_no,b.sequence_no)
        from public.wf_employer_micro_cert_lessons l
        join public.wf_employer_micro_cert_lesson_blocks b
          on b.lesson_id=l.lesson_id
        where l.micro_cert_version_id=v_version_id
          and l.status<>'archived'
          and b.block_type in (
            'image','video','document','download','link','embed','button'
          )
          and nullif(btrim(coalesce(b.content->>'url','')),'') is not null
      ),'[]'::jsonb)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkpoint authoring
-- ---------------------------------------------------------------------------

create or replace function public.employer_micro_cert_checkpoint_create(
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
  v_version_id text;
  v_checkpoint_id text:=security.new_legacy_id('MCP');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_prompt text:=nullif(btrim(coalesce(p_payload->>'prompt','')),'');
  v_type text:=lower(coalesce(nullif(btrim(p_payload->>'checkpointType'),''),'acknowledgement'));
  v_config jsonb:=coalesce(p_payload->'config','{}'::jsonb);
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_weight numeric:=coalesce((p_payload->>'weight')::numeric,1);
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if v_prompt is null then raise exception 'Checkpoint prompt is required'; end if;
  if length(v_prompt)>4000 then raise exception 'Checkpoint prompt must be 4000 characters or fewer'; end if;
  if v_title is not null and length(v_title)>200 then
    raise exception 'Checkpoint title must be 200 characters or fewer';
  end if;
  if v_type not in ('acknowledgement','confirmation','reflection') then
    raise exception 'Invalid checkpoint type';
  end if;
  if jsonb_typeof(v_config)<>'object' then
    raise exception 'Checkpoint config must be an object';
  end if;
  if v_weight<0 or v_weight>1000 then
    raise exception 'Checkpoint weight must be between 0 and 1000';
  end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_checkpoints
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_checkpoints(
    checkpoint_id,micro_cert_version_id,sequence_no,title,prompt,
    checkpoint_type,config,required,weight,created_by_user_id,
    created_at,updated_at
  ) values(
    v_checkpoint_id,v_version_id,v_sequence,v_title,v_prompt,
    v_type,v_config,v_required,v_weight,v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_CHECKPOINT_CREATED',
    'employer_micro_cert_checkpoint',v_checkpoint_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'checkpointId',v_checkpoint_id,
      'microCertVersionId',v_version_id,
      'sequence',v_sequence,
      'title',v_title,
      'prompt',v_prompt,
      'checkpointType',v_type,
      'required',v_required,
      'weight',v_weight
    ),
    jsonb_build_object('source','W11-05','microCertId',p_micro_cert_id)
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_checkpoint_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_checkpoint_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_checkpoint public.wf_employer_micro_cert_checkpoints%rowtype;
  v_title text;
  v_prompt text;
  v_type text;
  v_config jsonb;
  v_required boolean;
  v_weight numeric;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_checkpoint
  from public.wf_employer_micro_cert_checkpoints
  where checkpoint_id=p_checkpoint_id
    and micro_cert_version_id=v_version_id
  for update;

  if not found then raise exception 'Checkpoint not found'; end if;

  v_title:=case when p_payload ? 'title'
    then nullif(btrim(coalesce(p_payload->>'title','')),'')
    else v_checkpoint.title end;
  v_prompt:=case when p_payload ? 'prompt'
    then nullif(btrim(coalesce(p_payload->>'prompt','')),'')
    else v_checkpoint.prompt end;
  v_type:=case when p_payload ? 'checkpointType'
    then lower(nullif(btrim(coalesce(p_payload->>'checkpointType','')),''))
    else v_checkpoint.checkpoint_type end;
  v_config:=case when p_payload ? 'config'
    then p_payload->'config' else v_checkpoint.config end;
  v_required:=case when p_payload ? 'required'
    then (p_payload->>'required')::boolean else v_checkpoint.required end;
  v_weight:=case when p_payload ? 'weight'
    then (p_payload->>'weight')::numeric else v_checkpoint.weight end;

  if v_prompt is null then raise exception 'Checkpoint prompt is required'; end if;
  if length(v_prompt)>4000 then raise exception 'Checkpoint prompt must be 4000 characters or fewer'; end if;
  if v_title is not null and length(v_title)>200 then
    raise exception 'Checkpoint title must be 200 characters or fewer';
  end if;
  if v_type not in ('acknowledgement','confirmation','reflection') then
    raise exception 'Invalid checkpoint type';
  end if;
  if v_config is null or jsonb_typeof(v_config)<>'object' then
    raise exception 'Checkpoint config must be an object';
  end if;
  if v_weight<0 or v_weight>1000 then
    raise exception 'Checkpoint weight must be between 0 and 1000';
  end if;

  update public.wf_employer_micro_cert_checkpoints
  set title=v_title,
      prompt=v_prompt,
      checkpoint_type=v_type,
      config=v_config,
      required=v_required,
      weight=v_weight,
      updated_at=now()
  where checkpoint_id=p_checkpoint_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_CHECKPOINT_UPDATED',
    'employer_micro_cert_checkpoint',p_checkpoint_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'title',v_checkpoint.title,
      'prompt',v_checkpoint.prompt,
      'checkpointType',v_checkpoint.checkpoint_type,
      'config',v_checkpoint.config,
      'required',v_checkpoint.required,
      'weight',v_checkpoint.weight
    ),
    jsonb_build_object(
      'title',v_title,
      'prompt',v_prompt,
      'checkpointType',v_type,
      'config',v_config,
      'required',v_required,
      'weight',v_weight
    ),
    jsonb_build_object(
      'source','W11-05',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_checkpoint_delete(
  p_employer_id text,
  p_micro_cert_id text,
  p_checkpoint_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_checkpoint public.wf_employer_micro_cert_checkpoints%rowtype;
  v_ids text[];
  v_i integer;
  v_temp_base integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_checkpoint
  from public.wf_employer_micro_cert_checkpoints
  where checkpoint_id=p_checkpoint_id
    and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Checkpoint not found'; end if;

  delete from public.wf_employer_micro_cert_checkpoints
  where checkpoint_id=p_checkpoint_id;

  select coalesce(array_agg(checkpoint_id order by sequence_no),array[]::text[]),
         coalesce(max(sequence_no),0)+1000000
  into v_ids,v_temp_base
  from public.wf_employer_micro_cert_checkpoints
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_checkpoints
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where checkpoint_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_checkpoints
    set sequence_no=v_i,updated_at=now()
    where checkpoint_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_CHECKPOINT_DELETED',
    'employer_micro_cert_checkpoint',p_checkpoint_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'title',v_checkpoint.title,
      'prompt',v_checkpoint.prompt,
      'checkpointType',v_checkpoint.checkpoint_type,
      'required',v_checkpoint.required,
      'weight',v_checkpoint.weight
    ),
    jsonb_build_object(
      'source','W11-05',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_checkpoints_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_checkpoint_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_ids text[];
  v_actual integer;
  v_distinct integer;
  v_i integer;
  v_temp_base integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if p_checkpoint_ids is null or jsonb_typeof(p_checkpoint_ids)<>'array' then
    raise exception 'checkpointIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),count(distinct value)
  into v_ids,v_actual,v_distinct
  from jsonb_array_elements_text(p_checkpoint_ids)
    with ordinality as x(value,ordinality);

  if v_actual<>v_distinct then
    raise exception 'checkpointIds must not contain duplicates';
  end if;

  if v_actual<>(select count(*) from public.wf_employer_micro_cert_checkpoints
    where micro_cert_version_id=v_version_id) then
    raise exception 'checkpointIds must contain every checkpoint exactly once';
  end if;

  if exists(
    select 1 from unnest(v_ids) x(checkpoint_id)
    where not exists(
      select 1 from public.wf_employer_micro_cert_checkpoints cp
      where cp.checkpoint_id=x.checkpoint_id
        and cp.micro_cert_version_id=v_version_id
    )
  ) then
    raise exception 'checkpointIds contains a checkpoint outside the current version';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'checkpointId',checkpoint_id,'sequence',sequence_no
  ) order by sequence_no),'[]'::jsonb),
  coalesce(max(sequence_no),0)+1000000
  into v_before,v_temp_base
  from public.wf_employer_micro_cert_checkpoints
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_checkpoints
    set sequence_no=v_temp_base+v_i,updated_at=now()
    where checkpoint_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_checkpoints
    set sequence_no=v_i,updated_at=now()
    where checkpoint_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_CHECKPOINTS_REORDERED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'checkpointId',checkpoint_id,'sequence',sequence_no
    ) order by sequence_no),'[]'::jsonb)
     from public.wf_employer_micro_cert_checkpoints
     where micro_cert_version_id=v_version_id),
    jsonb_build_object('source','W11-05','microCertVersionId',v_version_id)
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Deterministic completion requirements + outcome linkage
-- ---------------------------------------------------------------------------

create or replace function public.employer_micro_cert_requirements_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_requirement jsonb,
  p_company_badge_id text default null,
  p_certification_definition_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_before public.wf_employer_micro_cert_versions%rowtype;
  v_requirement jsonb;
  v_badge_id text:=nullif(btrim(coalesce(p_company_badge_id,'')),'');
  v_cert_id text:=nullif(btrim(coalesce(p_certification_definition_id,'')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_before
  from public.wf_employer_micro_cert_versions
  where micro_cert_version_id=v_version_id
  for update;

  v_requirement:=security.normalize_micro_cert_passing_requirement(p_requirement);

  if v_badge_id is not null and not exists(
    select 1 from public.wf_company_badges b
    where b.company_badge_id=v_badge_id
      and b.employer_id=p_employer_id
      and b.active=true
  ) then
    raise exception 'Company Badge is outside the Employer scope or inactive';
  end if;

  if v_cert_id is not null and not exists(
    select 1 from public.wf_employer_certification_definitions c
    where c.certification_definition_id=v_cert_id
      and c.employer_id=p_employer_id
      and c.micro_cert_id=p_micro_cert_id
      and c.active=true
  ) then
    raise exception 'Employer Certification is outside the course scope or inactive';
  end if;

  update public.wf_employer_micro_cert_versions
  set passing_requirement=v_requirement,
      company_badge_id=v_badge_id,
      certification_definition_id=v_cert_id,
      updated_at=now()
  where micro_cert_version_id=v_version_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_REQUIREMENTS_UPDATED',
    'employer_micro_cert_version',v_version_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'passingRequirement',v_before.passing_requirement,
      'companyBadgeId',v_before.company_badge_id,
      'certificationDefinitionId',v_before.certification_definition_id
    ),
    jsonb_build_object(
      'passingRequirement',v_requirement,
      'companyBadgeId',v_badge_id,
      'certificationDefinitionId',v_cert_id
    ),
    jsonb_build_object('source','W11-05','microCertId',p_micro_cert_id)
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Version clone includes simple W11-05 checkpoints.
-- Assessment deep cloning remains W11-05A because questions/answer keys are
-- part of that authoring boundary.
-- ---------------------------------------------------------------------------

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
  v_section record;
  v_lesson record;
  v_block record;
  v_checkpoint record;
  v_new_section_id text;
  v_new_lesson_id text;
  v_section_map jsonb:='{}'::jsonb;
  v_section_count integer:=0;
  v_lesson_count integer:=0;
  v_block_count integer:=0;
  v_checkpoint_count integer:=0;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select * into v_course
  from public.wf_employer_micro_certs
  where micro_cert_id=p_micro_cert_id
    and employer_id=p_employer_id
  for update;
  if not found then raise exception 'Micro-Certification not found'; end if;

  select * into v_current
  from public.wf_employer_micro_cert_versions
  where micro_cert_version_id=v_course.current_version_id;
  if not found then
    raise exception 'Current Micro-Certification version not found';
  end if;

  select coalesce(max(version_number),0)+1
  into v_next
  from public.wf_employer_micro_cert_versions
  where micro_cert_id=p_micro_cert_id;

  insert into public.wf_employer_micro_cert_versions(
    micro_cert_version_id,micro_cert_id,version_number,status,
    learning_objective,content_type,content_url,equipment_process_context,
    safety_notes,duration_minutes,passing_requirement,company_badge_id,
    certification_definition_id,published_at,created_by_user_id,
    created_at,updated_at
  ) values(
    v_version_id,p_micro_cert_id,v_next,'draft',
    v_current.learning_objective,v_current.content_type,v_current.content_url,
    v_current.equipment_process_context,v_current.safety_notes,
    v_current.duration_minutes,v_current.passing_requirement,
    v_current.company_badge_id,v_current.certification_definition_id,
    null,v_user_id,now(),now()
  );

  for v_section in
    select *
    from public.wf_employer_micro_cert_sections
    where micro_cert_version_id=v_current.micro_cert_version_id
    order by sequence_no
  loop
    v_new_section_id:=security.new_legacy_id('MCS');
    insert into public.wf_employer_micro_cert_sections(
      section_id,micro_cert_version_id,sequence_no,title,description,required,
      created_by_user_id,created_at,updated_at
    ) values(
      v_new_section_id,v_version_id,v_section.sequence_no,v_section.title,
      v_section.description,v_section.required,v_user_id,now(),now()
    );
    v_section_map:=v_section_map ||
      jsonb_build_object(v_section.section_id,v_new_section_id);
    v_section_count:=v_section_count+1;
  end loop;

  for v_lesson in
    select *
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_current.micro_cert_version_id
    order by sequence_no
  loop
    v_new_lesson_id:=security.new_legacy_id('MCL');

    insert into public.wf_employer_micro_cert_lessons(
      lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
      learning_objective,estimated_minutes,required,status,created_by_user_id,
      created_at,updated_at
    ) values(
      v_new_lesson_id,v_version_id,
      case
        when v_lesson.section_id is null then null
        else v_section_map->>v_lesson.section_id
      end,
      v_lesson.sequence_no,v_lesson.title,v_lesson.description,
      v_lesson.learning_objective,v_lesson.estimated_minutes,
      v_lesson.required,
      case when v_lesson.status='archived' then 'archived' else 'draft' end,
      v_user_id,now(),now()
    );
    v_lesson_count:=v_lesson_count+1;

    for v_block in
      select *
      from public.wf_employer_micro_cert_lesson_blocks
      where lesson_id=v_lesson.lesson_id
      order by sequence_no
    loop
      insert into public.wf_employer_micro_cert_lesson_blocks(
        lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,
        created_at,updated_at
      ) values(
        security.new_legacy_id('LCB'),v_new_lesson_id,v_block.sequence_no,
        v_block.block_type,v_block.title,v_block.content,v_block.required,
        now(),now()
      );
      v_block_count:=v_block_count+1;
    end loop;
  end loop;

  for v_checkpoint in
    select *
    from public.wf_employer_micro_cert_checkpoints
    where micro_cert_version_id=v_current.micro_cert_version_id
    order by sequence_no
  loop
    insert into public.wf_employer_micro_cert_checkpoints(
      checkpoint_id,micro_cert_version_id,sequence_no,title,prompt,
      checkpoint_type,config,required,weight,created_by_user_id,
      created_at,updated_at
    ) values(
      security.new_legacy_id('MCP'),v_version_id,v_checkpoint.sequence_no,
      v_checkpoint.title,v_checkpoint.prompt,v_checkpoint.checkpoint_type,
      v_checkpoint.config,v_checkpoint.required,v_checkpoint.weight,
      v_user_id,now(),now()
    );
    v_checkpoint_count:=v_checkpoint_count+1;
  end loop;

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
      'status','draft',
      'clonedSectionCount',v_section_count,
      'clonedLessonCount',v_lesson_count,
      'clonedBlockCount',v_block_count,
      'clonedCheckpointCount',v_checkpoint_count
    ),
    jsonb_build_object('source','W11-05')
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- API grants
-- ---------------------------------------------------------------------------

revoke all on function public.employer_micro_cert_module_detail(text,text)
  from public,anon;
revoke all on function public.employer_micro_cert_checkpoint_create(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_checkpoint_update(text,text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_checkpoint_delete(text,text,text)
  from public,anon;
revoke all on function public.employer_micro_cert_checkpoints_reorder(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_requirements_update(text,text,jsonb,text,text)
  from public,anon;

grant execute on function public.employer_micro_cert_module_detail(text,text)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_checkpoint_create(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_checkpoint_update(text,text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_checkpoint_delete(text,text,text)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_checkpoints_reorder(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_requirements_update(text,text,jsonb,text,text)
  to authenticated,service_role;
