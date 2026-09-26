-- W11-05A follow-up: clone assessments/questions into new course versions
-- and support authoring-safe assessment duplication.

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
  v_assessment record;
  v_question record;
  v_new_section_id text;
  v_new_lesson_id text;
  v_new_assessment_id text;
  v_section_map jsonb:='{}'::jsonb;
  v_lesson_map jsonb:='{}'::jsonb;
  v_section_count integer:=0;
  v_lesson_count integer:=0;
  v_block_count integer:=0;
  v_checkpoint_count integer:=0;
  v_assessment_count integer:=0;
  v_question_count integer:=0;
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

    v_lesson_map:=v_lesson_map ||
      jsonb_build_object(v_lesson.lesson_id,v_new_lesson_id);
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

  for v_assessment in
    select *
    from public.wf_employer_micro_cert_assessments
    where micro_cert_version_id=v_current.micro_cert_version_id
    order by sequence_no
  loop
    v_new_assessment_id:=security.new_legacy_id('ASM');

    if v_assessment.lesson_id is not null
       and nullif(v_lesson_map->>v_assessment.lesson_id,'') is null then
      raise exception 'Assessment lesson mapping failed during course version clone';
    end if;

    insert into public.wf_employer_micro_cert_assessments(
      assessment_id,micro_cert_version_id,lesson_id,sequence_no,title,description,
      assessment_type,passing_score,max_attempts,required,randomize_questions,
      show_feedback,config,created_by_user_id,created_at,updated_at
    ) values(
      v_new_assessment_id,v_version_id,
      case when v_assessment.lesson_id is null
        then null else v_lesson_map->>v_assessment.lesson_id end,
      v_assessment.sequence_no,v_assessment.title,v_assessment.description,
      v_assessment.assessment_type,v_assessment.passing_score,
      v_assessment.max_attempts,v_assessment.required,
      v_assessment.randomize_questions,v_assessment.show_feedback,
      v_assessment.config,v_user_id,now(),now()
    );
    v_assessment_count:=v_assessment_count+1;

    for v_question in
      select *
      from public.wf_employer_micro_cert_assessment_questions
      where assessment_id=v_assessment.assessment_id
      order by sequence_no
    loop
      insert into public.wf_employer_micro_cert_assessment_questions(
        question_id,assessment_id,sequence_no,question_type,prompt,options,
        answer_key,points,required,feedback_correct,feedback_incorrect,
        created_by_user_id,created_at,updated_at
      ) values(
        security.new_legacy_id('ASQ'),v_new_assessment_id,
        v_question.sequence_no,v_question.question_type,v_question.prompt,
        v_question.options,v_question.answer_key,v_question.points,
        v_question.required,v_question.feedback_correct,
        v_question.feedback_incorrect,v_user_id,now(),now()
      );
      v_question_count:=v_question_count+1;
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
      'clonedBlockCount',v_block_count,
      'clonedCheckpointCount',v_checkpoint_count,
      'clonedAssessmentCount',v_assessment_count,
      'clonedAssessmentQuestionCount',v_question_count
    ),
    jsonb_build_object('source','W11-05A')
  );

  return public.employer_micro_cert_authoring_detail(
    p_employer_id,p_micro_cert_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_duplicate(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  v_source public.wf_employer_micro_cert_assessments%rowtype;
  v_new_assessment_id text:=security.new_legacy_id('ASM');
  v_sequence integer;
  v_question record;
  v_question_count integer:=0;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into v_source
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id
    and micro_cert_version_id=v_version_id;
  if not found then raise exception 'Assessment not found'; end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_assessments
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_assessments(
    assessment_id,micro_cert_version_id,lesson_id,sequence_no,title,description,
    assessment_type,passing_score,max_attempts,required,randomize_questions,
    show_feedback,config,created_by_user_id,created_at,updated_at
  ) values(
    v_new_assessment_id,v_version_id,v_source.lesson_id,v_sequence,
    left(v_source.title || ' — Copy',200),v_source.description,
    v_source.assessment_type,v_source.passing_score,v_source.max_attempts,
    v_source.required,v_source.randomize_questions,v_source.show_feedback,
    v_source.config,v_user_id,now(),now()
  );

  for v_question in
    select *
    from public.wf_employer_micro_cert_assessment_questions
    where assessment_id=p_assessment_id
    order by sequence_no
  loop
    insert into public.wf_employer_micro_cert_assessment_questions(
      question_id,assessment_id,sequence_no,question_type,prompt,options,
      answer_key,points,required,feedback_correct,feedback_incorrect,
      created_by_user_id,created_at,updated_at
    ) values(
      security.new_legacy_id('ASQ'),v_new_assessment_id,
      v_question.sequence_no,v_question.question_type,v_question.prompt,
      v_question.options,v_question.answer_key,v_question.points,
      v_question.required,v_question.feedback_correct,
      v_question.feedback_incorrect,v_user_id,now(),now()
    );
    v_question_count:=v_question_count+1;
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_DUPLICATED',
    'employer_micro_cert_assessment',v_new_assessment_id,
    'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object('sourceAssessmentId',p_assessment_id),
    jsonb_build_object(
      'assessmentId',v_new_assessment_id,'sequence',v_sequence,
      'clonedQuestionCount',v_question_count
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,v_new_assessment_id
  );
end;
$$;

revoke all on function public.employer_micro_cert_assessment_duplicate(text,text,text)
  from public,anon;
grant execute on function public.employer_micro_cert_assessment_duplicate(text,text,text)
  to authenticated,service_role;
