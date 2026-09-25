-- W11-04C audit hardening.
-- Restores audit semantics preserved by W11-04A and adds Employer-wide reuse provenance.

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
  v_section_id text:=nullif(btrim(coalesce(p_payload->>'sectionId','')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if v_title is null then raise exception 'Lesson title is required'; end if;
  if length(v_title)>200 then
    raise exception 'Lesson title must be 200 characters or fewer';
  end if;
  if v_status not in ('draft','ready') then
    raise exception 'New lessons must be draft or ready';
  end if;

  if v_section_id is not null and not exists(
    select 1
    from public.wf_employer_micro_cert_sections s
    where s.section_id=v_section_id
      and s.micro_cert_version_id=v_version_id
  ) then
    raise exception 'Section outside current course version';
  end if;

  if p_payload ? 'estimatedMinutes'
     and nullif(btrim(coalesce(p_payload->>'estimatedMinutes','')),'') is not null then
    v_minutes:=(p_payload->>'estimatedMinutes')::integer;
    if v_minutes<0 then
      raise exception 'estimatedMinutes must be non-negative';
    end if;
  end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,
    created_at,updated_at
  ) values(
    v_lesson_id,v_version_id,v_section_id,v_sequence,v_title,v_description,
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
      'sectionId',v_section_id,
      'sequence',v_sequence,
      'title',v_title,
      'status',v_status
    ),
    jsonb_build_object('source','W11-04C')
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
end;
$$;

create or replace function public.employer_learning_reusable_block_insert(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_reusable_block_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_reusable public.wf_employer_learning_reusable_blocks%rowtype;
  v_sequence integer;
  v_block_id text:=security.new_legacy_id('LCB');
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

  select * into v_reusable
  from public.wf_employer_learning_reusable_blocks
  where reusable_block_id=p_reusable_block_id
    and employer_id=p_employer_id
    and active=true;
  if not found then raise exception 'Reusable block not found'; end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lesson_blocks
  where lesson_id=p_lesson_id;

  insert into public.wf_employer_micro_cert_lesson_blocks(
    lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,
    created_at,updated_at
  ) values(
    v_block_id,p_lesson_id,v_sequence,v_reusable.block_type,
    v_reusable.title,v_reusable.content,true,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_REUSABLE_BLOCK_INSERTED',
    'employer_micro_cert_lesson_block',v_block_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonBlockId',v_block_id,
      'lessonId',p_lesson_id,
      'reusableBlockId',p_reusable_block_id,
      'blockType',v_reusable.block_type,
      'sequence',v_sequence
    ),
    jsonb_build_object(
      'source','W11-04C',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
end;
$$;

create or replace function public.employer_learning_lesson_template_save(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_id text,
  p_title text
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
  v_snapshot jsonb;
  v_id text:=security.new_legacy_id('ELT');
  v_title text:=nullif(btrim(coalesce(p_title,'')),'');
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );
  if v_title is null then
    raise exception 'Lesson template title is required';
  end if;

  select * into v_lesson
  from public.wf_employer_micro_cert_lessons
  where lesson_id=p_lesson_id
    and micro_cert_version_id=v_version_id;
  if not found then raise exception 'Lesson not found'; end if;

  v_snapshot:=jsonb_build_object(
    'title',v_lesson.title,
    'description',v_lesson.description,
    'learningObjective',v_lesson.learning_objective,
    'estimatedMinutes',v_lesson.estimated_minutes,
    'required',v_lesson.required,
    'blocks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'blockType',b.block_type,
        'title',b.title,
        'content',b.content,
        'required',b.required
      ) order by b.sequence_no)
      from public.wf_employer_micro_cert_lesson_blocks b
      where b.lesson_id=p_lesson_id
    ),'[]'::jsonb)
  );

  insert into public.wf_employer_learning_lesson_templates(
    lesson_template_id,employer_id,title,description,snapshot,source_lesson_id,
    active,created_by_user_id,created_at,updated_at
  ) values(
    v_id,p_employer_id,v_title,v_lesson.description,v_snapshot,p_lesson_id,
    true,v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_LESSON_TEMPLATE_SAVED',
    'employer_learning_lesson_template',v_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonTemplateId',v_id,
      'sourceLessonId',p_lesson_id,
      'title',v_title
    ),
    jsonb_build_object(
      'source','W11-04C',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_learning_reusable_library(p_employer_id);
end;
$$;

create or replace function public.employer_learning_lesson_template_insert(
  p_employer_id text,
  p_micro_cert_id text,
  p_lesson_template_id text,
  p_section_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_template public.wf_employer_learning_lesson_templates%rowtype;
  v_lesson_id text:=security.new_legacy_id('MCL');
  v_sequence integer;
  v_block jsonb;
  v_block_seq integer:=0;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if p_section_id is not null and not exists(
    select 1
    from public.wf_employer_micro_cert_sections s
    where s.section_id=p_section_id
      and s.micro_cert_version_id=v_version_id
  ) then
    raise exception 'Section outside current course version';
  end if;

  select * into v_template
  from public.wf_employer_learning_lesson_templates
  where lesson_template_id=p_lesson_template_id
    and employer_id=p_employer_id
    and active=true;
  if not found then raise exception 'Lesson template not found'; end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_lessons
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_lessons(
    lesson_id,micro_cert_version_id,section_id,sequence_no,title,description,
    learning_objective,estimated_minutes,required,status,created_by_user_id,
    created_at,updated_at
  ) values(
    v_lesson_id,v_version_id,p_section_id,v_sequence,
    coalesce(nullif(btrim(v_template.snapshot->>'title'),''),v_template.title),
    nullif(v_template.snapshot->>'description',''),
    nullif(v_template.snapshot->>'learningObjective',''),
    nullif(v_template.snapshot->>'estimatedMinutes','')::integer,
    coalesce((v_template.snapshot->>'required')::boolean,true),
    'draft',v_user_id,now(),now()
  );

  for v_block in
    select value
    from jsonb_array_elements(
      coalesce(v_template.snapshot->'blocks','[]'::jsonb)
    )
  loop
    v_block_seq:=v_block_seq+1;
    insert into public.wf_employer_micro_cert_lesson_blocks(
      lesson_block_id,lesson_id,sequence_no,block_type,title,content,required,
      created_at,updated_at
    ) values(
      security.new_legacy_id('LCB'),v_lesson_id,v_block_seq,
      v_block->>'blockType',nullif(v_block->>'title',''),
      coalesce(v_block->'content','{}'::jsonb),
      coalesce((v_block->>'required')::boolean,true),now(),now()
    );
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'EMPLOYER_LEARNING_LESSON_TEMPLATE_INSERTED',
    'employer_micro_cert_lesson',v_lesson_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonId',v_lesson_id,
      'lessonTemplateId',p_lesson_template_id,
      'sectionId',p_section_id,
      'sequence',v_sequence,
      'blockCount',v_block_seq
    ),
    jsonb_build_object(
      'source','W11-04C',
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
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
  v_section record;
  v_lesson record;
  v_block record;
  v_new_section_id text;
  v_new_lesson_id text;
  v_section_map jsonb:='{}'::jsonb;
  v_section_count integer:=0;
  v_lesson_count integer:=0;
  v_block_count integer:=0;
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
      'clonedBlockCount',v_block_count
    ),
    jsonb_build_object('source','W11-04C')
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
end;
$$;
