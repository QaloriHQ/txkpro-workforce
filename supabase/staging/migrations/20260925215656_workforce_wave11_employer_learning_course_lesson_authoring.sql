-- W11-04A: Employer course and lesson authoring.
-- Adds scoped authoring RPCs for versioned lessons and ordered content blocks.
-- Direct table access remains closed; authorization is derived server-side.

create or replace function security.current_mutable_employer_micro_cert_version(
  p_employer_id text,
  p_micro_cert_id text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_version_id text;
  v_status text;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select mc.current_version_id,v.status
  into v_version_id,v_status
  from public.wf_employer_micro_certs mc
  join public.wf_employer_micro_cert_versions v
    on v.micro_cert_version_id=mc.current_version_id
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id
  for update of mc,v;

  if not found then
    raise exception 'Micro-Certification not found';
  end if;

  if v_status in ('live','archived') then
    raise exception 'MICRO_CERT_VERSION_IMMUTABLE';
  end if;

  return v_version_id;
end;
$$;

create or replace function security.validate_employer_learning_block(
  p_block_type text,
  p_content jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_type text:=lower(btrim(coalesce(p_block_type,'')));
begin
  if v_type not in ('text','video','image','document','link','embed','safety_note') then
    raise exception 'Invalid Employer Learning content block type';
  end if;

  if p_content is null or jsonb_typeof(p_content)<>'object' then
    raise exception 'Content block content must be an object';
  end if;

  if v_type in ('text','safety_note') then
    if nullif(btrim(coalesce(p_content->>'text','')),'') is null then
      raise exception 'Text content is required for % block',v_type;
    end if;
  else
    if nullif(btrim(coalesce(p_content->>'url','')),'') is null then
      raise exception 'URL is required for % block',v_type;
    end if;
  end if;
end;
$$;

create or replace function public.employer_micro_cert_authoring_detail(
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

  v_base:=public.employer_micro_cert_detail(p_employer_id,p_micro_cert_id);

  return v_base || jsonb_build_object(
    'lessons',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lessonId',l.lesson_id,
          'microCertVersionId',l.micro_cert_version_id,
          'sequence',l.sequence_no,
          'title',l.title,
          'description',l.description,
          'learningObjective',l.learning_objective,
          'estimatedMinutes',l.estimated_minutes,
          'required',l.required,
          'status',l.status,
          'createdByUserId',l.created_by_user_id,
          'createdAt',l.created_at,
          'updatedAt',l.updated_at,
          'blocks',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'lessonBlockId',b.lesson_block_id,
                'lessonId',b.lesson_id,
                'sequence',b.sequence_no,
                'blockType',b.block_type,
                'title',b.title,
                'content',b.content,
                'required',b.required,
                'createdAt',b.created_at,
                'updatedAt',b.updated_at
              )
              order by b.sequence_no,b.created_at
            )
            from public.wf_employer_micro_cert_lesson_blocks b
            where b.lesson_id=l.lesson_id
          ),'[]'::jsonb)
        )
        order by l.sequence_no,l.created_at
      )
      from public.wf_employer_micro_cert_lessons l
      where l.micro_cert_version_id=v_version_id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.employer_micro_cert_lesson_create(
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
  v_lesson_id text:=security.new_legacy_id('MCL');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_objective text:=nullif(btrim(coalesce(p_payload->>'learningObjective','')),'');
  v_minutes integer;
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_sequence integer;
  v_status text:=lower(coalesce(nullif(btrim(p_payload->>'status'),''),'draft'));
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if v_title is null then raise exception 'Lesson title is required'; end if;
  if length(v_title)>200 then raise exception 'Lesson title must be 200 characters or fewer'; end if;
  if v_description is not null and length(v_description)>4000 then
    raise exception 'Lesson description must be 4000 characters or fewer';
  end if;
  if v_objective is not null and length(v_objective)>4000 then
    raise exception 'Lesson learning objective must be 4000 characters or fewer';
  end if;
  if v_status not in ('draft','ready') then
    raise exception 'New lessons must be draft or ready';
  end if;

  if p_payload ? 'estimatedMinutes'
     and p_payload->>'estimatedMinutes' is not null
     and btrim(p_payload->>'estimatedMinutes')<>'' then
    v_minutes:=(p_payload->>'estimatedMinutes')::integer;
    if v_minutes<0 then raise exception 'estimatedMinutes must be non-negative'; end if;
  end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,
    created_at,updated_at
  ) values(
    v_lesson_id,v_version_id,v_sequence,v_title,v_description,
    v_objective,v_minutes,v_required,v_status,v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_CREATED',
    'employer_micro_cert_lesson',v_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id,
      'lessonId',v_lesson_id,
      'sequence',v_sequence,
      'title',v_title,
      'status',v_status
    ),
    jsonb_build_object('source','W11-04A')
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
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
  v_lesson public.wf_employer_micro_cert_lessons%rowtype;
  v_before jsonb;
  v_title text;
  v_description text;
  v_objective text;
  v_minutes integer;
  v_status text;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_lesson
  from public.wf_employer_micro_cert_lessons
  where lesson_id=p_lesson_id
    and micro_cert_version_id=v_version_id
  for update;

  if not found then raise exception 'Lesson not found'; end if;
  if v_lesson.status='archived' then raise exception 'LESSON_ARCHIVED'; end if;

  v_before:=jsonb_build_object(
    'title',v_lesson.title,
    'description',v_lesson.description,
    'learningObjective',v_lesson.learning_objective,
    'estimatedMinutes',v_lesson.estimated_minutes,
    'required',v_lesson.required,
    'status',v_lesson.status
  );

  v_title:=case when p_payload ? 'title'
    then nullif(btrim(coalesce(p_payload->>'title','')),'')
    else v_lesson.title end;
  if v_title is null then raise exception 'Lesson title is required'; end if;
  if length(v_title)>200 then raise exception 'Lesson title must be 200 characters or fewer'; end if;

  v_description:=case when p_payload ? 'description'
    then nullif(btrim(coalesce(p_payload->>'description','')),'')
    else v_lesson.description end;
  if v_description is not null and length(v_description)>4000 then
    raise exception 'Lesson description must be 4000 characters or fewer';
  end if;

  v_objective:=case when p_payload ? 'learningObjective'
    then nullif(btrim(coalesce(p_payload->>'learningObjective','')),'')
    else v_lesson.learning_objective end;
  if v_objective is not null and length(v_objective)>4000 then
    raise exception 'Lesson learning objective must be 4000 characters or fewer';
  end if;

  if p_payload ? 'estimatedMinutes' then
    if p_payload->>'estimatedMinutes' is null
       or btrim(coalesce(p_payload->>'estimatedMinutes',''))='' then
      v_minutes:=null;
    else
      v_minutes:=(p_payload->>'estimatedMinutes')::integer;
      if v_minutes<0 then raise exception 'estimatedMinutes must be non-negative'; end if;
    end if;
  else
    v_minutes:=v_lesson.estimated_minutes;
  end if;

  v_status:=case when p_payload ? 'status'
    then lower(nullif(btrim(coalesce(p_payload->>'status','')),''))
    else v_lesson.status end;
  if v_status not in ('draft','ready') then
    raise exception 'Editable lesson status must be draft or ready';
  end if;

  update public.wf_employer_micro_cert_lessons
  set title=v_title,
      description=v_description,
      learning_objective=v_objective,
      estimated_minutes=v_minutes,
      required=case when p_payload ? 'required'
        then (p_payload->>'required')::boolean else required end,
      status=v_status,
      updated_at=now()
  where lesson_id=p_lesson_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_UPDATED',
    'employer_micro_cert_lesson',p_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    jsonb_build_object(
      'title',v_title,
      'description',v_description,
      'learningObjective',v_objective,
      'estimatedMinutes',v_minutes,
      'required',case when p_payload ? 'required'
        then (p_payload->>'required')::boolean else v_lesson.required end,
      'status',v_status
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_archive(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_lesson public.wf_employer_micro_cert_lessons%rowtype;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_lesson
  from public.wf_employer_micro_cert_lessons
  where lesson_id=p_lesson_id
    and micro_cert_version_id=v_version_id
  for update;

  if not found then raise exception 'Lesson not found'; end if;

  if v_lesson.status<>'archived' then
    update public.wf_employer_micro_cert_lessons
    set status='archived',updated_at=now()
    where lesson_id=p_lesson_id;

    insert into public.platform_audit_events(
      actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
      employer_id,result,before_json,after_json,metadata
    ) values(
      (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_ARCHIVED',
      'employer_micro_cert_lesson',p_lesson_id,'workforce-employer-learning',
      p_employer_id,'success',
      jsonb_build_object('status',v_lesson.status),
      jsonb_build_object('status','archived'),
      jsonb_build_object(
        'source','W11-04A',
        'microCertId',p_micro_cert_id,
        'microCertVersionId',v_version_id
      )
    );
  end if;

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_duplicate(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_source public.wf_employer_micro_cert_lessons%rowtype;
  v_new_lesson_id text:=security.new_legacy_id('MCL');
  v_sequence integer;
  v_block record;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_source
  from public.wf_employer_micro_cert_lessons
  where lesson_id=p_lesson_id
    and micro_cert_version_id=v_version_id;

  if not found then raise exception 'Lesson not found'; end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,
    created_at,updated_at
  ) values(
    v_new_lesson_id,v_version_id,v_sequence,
    left(v_source.title || ' Copy',200),
    v_source.description,v_source.learning_objective,v_source.estimated_minutes,
    v_source.required,'draft',v_user_id,now(),now()
  );

  for v_block in
    select *
    from public.wf_employer_micro_cert_lesson_blocks
    where lesson_id=p_lesson_id
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
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_DUPLICATED',
    'employer_micro_cert_lesson',v_new_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object('sourceLessonId',p_lesson_id),
    jsonb_build_object(
      'lessonId',v_new_lesson_id,
      'sequence',v_sequence,
      'status','draft'
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lessons_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_ids jsonb
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
  v_actual_count integer;
  v_distinct_count integer;
  v_i integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if p_lesson_ids is null or jsonb_typeof(p_lesson_ids)<>'array' then
    raise exception 'lessonIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),
         count(distinct value)
  into v_ids,v_actual_count,v_distinct_count
  from jsonb_array_elements_text(p_lesson_ids) with ordinality as x(value,ordinality);

  if v_actual_count<>v_distinct_count then
    raise exception 'lessonIds must not contain duplicates';
  end if;

  if v_actual_count<>(
    select count(*)
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_version_id
  ) then
    raise exception 'lessonIds must contain every lesson in the current version exactly once';
  end if;

  if exists(
    select 1
    from unnest(v_ids) as x(lesson_id)
    where not exists(
      select 1
      from public.wf_employer_micro_cert_lessons l
      where l.lesson_id=x.lesson_id
        and l.micro_cert_version_id=v_version_id
    )
  ) then
    raise exception 'lessonIds contains a lesson outside the current course version';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lessonId',lesson_id,'sequence',sequence_no
  ) order by sequence_no),'[]'::jsonb)
  into v_before
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lessons
    set sequence_no=-v_i,updated_at=now()
    where lesson_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lessons
    set sequence_no=v_i,updated_at=now()
    where lesson_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSONS_REORDERED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'lessonId',lesson_id,'sequence',sequence_no
    ) order by sequence_no),'[]'::jsonb)
     from public.wf_employer_micro_cert_lessons
     where micro_cert_version_id=v_version_id),
    jsonb_build_object(
      'source','W11-04A',
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_block_create(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
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
  v_block_id text:=security.new_legacy_id('LCB');
  v_block_type text:=lower(btrim(coalesce(p_payload->>'blockType','')));
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_content jsonb:=coalesce(p_payload->'content','{}'::jsonb);
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  perform security.validate_employer_learning_block(v_block_type,v_content);

  if v_title is not null and length(v_title)>200 then
    raise exception 'Content block title must be 200 characters or fewer';
  end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_id=p_lesson_id;

  insert into public.wf_employer_micro_cert_lesson_blocks(
    lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,
    created_at,updated_at
  ) values(
    v_block_id,p_lesson_id,v_sequence,v_block_type,v_title,v_content,v_required,
    now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCK_CREATED',
    'employer_micro_cert_lesson_block',v_block_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonBlockId',v_block_id,
      'lessonId',p_lesson_id,
      'blockType',v_block_type,
      'sequence',v_sequence,
      'required',v_required
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_block_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_id text,
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
  v_block public.wf_employer_micro_cert_lesson_blocks%rowtype;
  v_before jsonb;
  v_block_type text;
  v_title text;
  v_content jsonb;
  v_required boolean;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  select * into v_block
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_block_id=p_lesson_block_id
    and lesson_id=p_lesson_id
  for update;

  if not found then raise exception 'Content block not found'; end if;

  v_before:=jsonb_build_object(
    'blockType',v_block.block_type,
    'title',v_block.title,
    'content',v_block.content,
    'required',v_block.required
  );

  v_block_type:=case when p_payload ? 'blockType'
    then lower(btrim(coalesce(p_payload->>'blockType','')))
    else v_block.block_type end;
  v_title:=case when p_payload ? 'title'
    then nullif(btrim(coalesce(p_payload->>'title','')),'')
    else v_block.title end;
  v_content:=case when p_payload ? 'content'
    then p_payload->'content' else v_block.content end;
  v_required:=case when p_payload ? 'required'
    then (p_payload->>'required')::boolean else v_block.required end;

  if v_title is not null and length(v_title)>200 then
    raise exception 'Content block title must be 200 characters or fewer';
  end if;

  perform security.validate_employer_learning_block(v_block_type,v_content);

  update public.wf_employer_micro_cert_lesson_blocks
  set block_type=v_block_type,
      title=v_title,
      content=v_content,
      required=v_required,
      updated_at=now()
  where lesson_block_id=p_lesson_block_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCK_UPDATED',
    'employer_micro_cert_lesson_block',p_lesson_block_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    jsonb_build_object(
      'blockType',v_block_type,
      'title',v_title,
      'content',v_content,
      'required',v_required
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id,
      'lessonId',p_lesson_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_block_delete(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_block public.wf_employer_micro_cert_lesson_blocks%rowtype;
  v_deleted_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  select * into v_block
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_block_id=p_lesson_block_id
    and lesson_id=p_lesson_id
  for update;

  if not found then raise exception 'Content block not found'; end if;
  v_deleted_sequence:=v_block.sequence_no;

  delete from public.wf_employer_micro_cert_lesson_blocks
  where lesson_block_id=p_lesson_block_id;

  update public.wf_employer_micro_cert_lesson_blocks
  set sequence_no=sequence_no-1,updated_at=now()
  where lesson_id=p_lesson_id
    and sequence_no>v_deleted_sequence;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCK_DELETED',
    'employer_micro_cert_lesson_block',p_lesson_block_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonBlockId',p_lesson_block_id,
      'lessonId',p_lesson_id,
      'blockType',v_block.block_type,
      'sequence',v_block.sequence_no,
      'content',v_block.content
    ),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_lesson_blocks_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_lesson_block_ids jsonb
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
  v_actual_count integer;
  v_distinct_count integer;
  v_i integer;
  v_before jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Lesson not found or archived';
  end if;

  if p_lesson_block_ids is null or jsonb_typeof(p_lesson_block_ids)<>'array' then
    raise exception 'lessonBlockIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),
         count(distinct value)
  into v_ids,v_actual_count,v_distinct_count
  from jsonb_array_elements_text(p_lesson_block_ids) with ordinality as x(value,ordinality);

  if v_actual_count<>v_distinct_count then
    raise exception 'lessonBlockIds must not contain duplicates';
  end if;

  if v_actual_count<>(
    select count(*)
    from public.wf_employer_micro_cert_lesson_blocks
    where lesson_id=p_lesson_id
  ) then
    raise exception 'lessonBlockIds must contain every block in the lesson exactly once';
  end if;

  if exists(
    select 1
    from unnest(v_ids) as x(block_id)
    where not exists(
      select 1
      from public.wf_employer_micro_cert_lesson_blocks b
      where b.lesson_block_id=x.block_id
        and b.lesson_id=p_lesson_id
    )
  ) then
    raise exception 'lessonBlockIds contains a block outside the lesson';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lessonBlockId',lesson_block_id,'sequence',sequence_no
  ) order by sequence_no),'[]'::jsonb)
  into v_before
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_id=p_lesson_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=-v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_lesson_blocks
    set sequence_no=v_i,updated_at=now()
    where lesson_block_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_LESSON_BLOCKS_REORDERED',
    'employer_micro_cert_lesson',p_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',v_before,
    (select coalesce(jsonb_agg(jsonb_build_object(
      'lessonBlockId',lesson_block_id,'sequence',sequence_no
    ) order by sequence_no),'[]'::jsonb)
     from public.wf_employer_micro_cert_lesson_blocks
     where lesson_id=p_lesson_id),
    jsonb_build_object(
      'source','W11-04A',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

-- Deep version clone: a new course version now carries an editable snapshot
-- of the current lesson hierarchy and ordered content blocks.
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
  v_lesson record;
  v_block record;
  v_new_lesson_id text;
  v_lesson_count integer:=0;
  v_block_count integer:=0;
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

  for v_lesson in
    select *
    from public.wf_employer_micro_cert_lessons
    where micro_cert_version_id=v_current.micro_cert_version_id
    order by sequence_no
  loop
    v_new_lesson_id:=security.new_legacy_id('MCL');

    insert into public.wf_employer_micro_cert_lessons(
      lesson_id,micro_cert_version_id,sequence_no,title,description,
      learning_objective,estimated_minutes,required,status,created_by_user_id,
      created_at,updated_at
    ) values(
      v_new_lesson_id,v_version_id,v_lesson.sequence_no,v_lesson.title,
      v_lesson.description,v_lesson.learning_objective,v_lesson.estimated_minutes,
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
      'clonedLessonCount',v_lesson_count,
      'clonedBlockCount',v_block_count
    ),
    jsonb_build_object('source','W11-04A')
  );

  return public.employer_micro_cert_authoring_detail(p_employer_id,p_micro_cert_id);
end;
$$;

revoke all on function security.current_mutable_employer_micro_cert_version(text,text)
from public,anon,authenticated;
revoke all on function security.validate_employer_learning_block(text,jsonb)
from public,anon,authenticated;
grant execute on function security.current_mutable_employer_micro_cert_version(text,text)
to service_role;
grant execute on function security.validate_employer_learning_block(text,jsonb)
to service_role;

revoke all on function public.employer_micro_cert_authoring_detail(text,text)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_create(text,text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_update(text,text,text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_archive(text,text,text)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_duplicate(text,text,text)
from public,anon;
revoke all on function public.employer_micro_cert_lessons_reorder(text,text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_block_create(text,text,text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_block_update(text,text,text,text,jsonb)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_block_delete(text,text,text,text)
from public,anon;
revoke all on function public.employer_micro_cert_lesson_blocks_reorder(text,text,text,jsonb)
from public,anon;

grant execute on function public.employer_micro_cert_authoring_detail(text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_create(text,text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_update(text,text,text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_archive(text,text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_duplicate(text,text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lessons_reorder(text,text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_block_create(text,text,text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_block_update(text,text,text,text,jsonb)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_block_delete(text,text,text,text)
to authenticated,service_role;
grant execute on function public.employer_micro_cert_lesson_blocks_reorder(text,text,text,jsonb)
to authenticated,service_role;
