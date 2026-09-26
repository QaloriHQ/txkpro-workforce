-- W11-05A: Employer assessment authoring, answer-key confidentiality,
-- deterministic question validation/scoring, and student-safe preview definitions.

alter table public.wf_employer_micro_cert_assessment_questions
  add column if not exists created_by_user_id text
    references public.users(user_id) on delete set null;

create index if not exists idx_wf_assessment_questions_created_by
  on public.wf_employer_micro_cert_assessment_questions(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists idx_wf_assessments_version_lesson
  on public.wf_employer_micro_cert_assessments(micro_cert_version_id,lesson_id);

create index if not exists idx_wf_assessment_questions_assessment
  on public.wf_employer_micro_cert_assessment_questions(assessment_id,sequence_no);

alter table public.wf_employer_micro_cert_assessments
  add constraint wf_employer_micro_cert_assessments_config_object_check
  check (jsonb_typeof(config)='object') not valid;

alter table public.wf_employer_micro_cert_assessment_questions
  add constraint wf_employer_micro_cert_assessment_questions_options_array_check
  check (jsonb_typeof(options)='array') not valid;

alter table public.wf_employer_micro_cert_assessment_questions
  add constraint wf_employer_micro_cert_assessment_questions_answer_key_object_check
  check (jsonb_typeof(answer_key)='object') not valid;

create or replace function security.validate_employer_learning_assessment_question(
  p_question_type text,
  p_prompt text,
  p_options jsonb,
  p_answer_key jsonb,
  p_points numeric,
  p_feedback_correct text default null,
  p_feedback_incorrect text default null
)
returns void
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_type text:=lower(btrim(coalesce(p_question_type,'')));
  v_options jsonb:=coalesce(p_options,'[]'::jsonb);
  v_key jsonb:=coalesce(p_answer_key,'{}'::jsonb);
  v_option_count integer;
  v_distinct_count integer;
  v_correct_count integer;
  v_correct_distinct integer;
  v_mode text;
  v_min numeric;
  v_max numeric;
  v_tolerance numeric;
begin
  if v_type not in (
    'single_choice','multiple_choice','true_false','acknowledgement','numeric'
  ) then
    raise exception 'Invalid assessment question type';
  end if;

  if nullif(btrim(coalesce(p_prompt,'')),'') is null then
    raise exception 'Question prompt is required';
  end if;
  if length(p_prompt)>5000 then
    raise exception 'Question prompt must be 5000 characters or fewer';
  end if;
  if p_points is null or p_points<=0 or p_points>1000 then
    raise exception 'Question points must be greater than 0 and no more than 1000';
  end if;
  if p_feedback_correct is not null and length(p_feedback_correct)>2000 then
    raise exception 'Correct feedback must be 2000 characters or fewer';
  end if;
  if p_feedback_incorrect is not null and length(p_feedback_incorrect)>2000 then
    raise exception 'Incorrect feedback must be 2000 characters or fewer';
  end if;
  if jsonb_typeof(v_options)<>'array' then
    raise exception 'Question options must be an array';
  end if;
  if jsonb_typeof(v_key)<>'object' then
    raise exception 'Question answer key must be an object';
  end if;

  if v_type in ('single_choice','multiple_choice') then
    v_option_count:=jsonb_array_length(v_options);
    if v_option_count<2 or v_option_count>20 then
      raise exception 'Choice questions require between 2 and 20 options';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_options) o
      where jsonb_typeof(o)<>'object'
         or nullif(btrim(coalesce(o->>'id','')),'') is null
         or nullif(btrim(coalesce(o->>'label','')),'') is null
         or length(o->>'id')>100
         or length(o->>'label')>500
    ) then
      raise exception 'Each choice option requires a valid id and label';
    end if;

    select count(distinct o->>'id')
    into v_distinct_count
    from jsonb_array_elements(v_options) o;

    if v_distinct_count<>v_option_count then
      raise exception 'Choice option ids must be unique';
    end if;

    if v_type='single_choice' then
      if nullif(btrim(coalesce(v_key->>'correctOptionId','')),'') is null then
        raise exception 'Single-choice answer key requires correctOptionId';
      end if;
      if not exists(
        select 1 from jsonb_array_elements(v_options) o
        where o->>'id'=v_key->>'correctOptionId'
      ) then
        raise exception 'Single-choice correctOptionId must match an option';
      end if;
    else
      if jsonb_typeof(v_key->'correctOptionIds')<>'array' then
        raise exception 'Multiple-choice answer key requires correctOptionIds';
      end if;
      select count(*),count(distinct value)
      into v_correct_count,v_correct_distinct
      from jsonb_array_elements_text(v_key->'correctOptionIds');

      if v_correct_count<1 then
        raise exception 'Multiple-choice answer key requires at least one correct option';
      end if;
      if v_correct_count<>v_correct_distinct then
        raise exception 'Multiple-choice correctOptionIds must be unique';
      end if;
      if exists(
        select 1
        from jsonb_array_elements_text(v_key->'correctOptionIds') x(value)
        where not exists(
          select 1 from jsonb_array_elements(v_options) o
          where o->>'id'=x.value
        )
      ) then
        raise exception 'Multiple-choice correctOptionIds must match authored options';
      end if;
    end if;

  elsif v_type='true_false' then
    if jsonb_typeof(v_key->'correct')<>'boolean' then
      raise exception 'True/false answer key requires boolean correct';
    end if;

  elsif v_type='acknowledgement' then
    if jsonb_typeof(v_key->'requiredValue')<>'boolean' then
      raise exception 'Acknowledgement answer key requires boolean requiredValue';
    end if;

  elsif v_type='numeric' then
    v_mode:=coalesce(nullif(btrim(v_key->>'mode'),''),'exact');
    if v_mode not in ('exact','range') then
      raise exception 'Numeric answer mode must be exact or range';
    end if;

    if v_mode='exact' then
      if jsonb_typeof(v_key->'value')<>'number' then
        raise exception 'Exact numeric answer requires numeric value';
      end if;
      if v_key ? 'tolerance' then
        if jsonb_typeof(v_key->'tolerance')<>'number' then
          raise exception 'Numeric tolerance must be numeric';
        end if;
        v_tolerance:=(v_key->>'tolerance')::numeric;
        if v_tolerance<0 then
          raise exception 'Numeric tolerance cannot be negative';
        end if;
      end if;
    else
      if jsonb_typeof(v_key->'min')<>'number'
         or jsonb_typeof(v_key->'max')<>'number' then
        raise exception 'Numeric range answer requires numeric min and max';
      end if;
      v_min:=(v_key->>'min')::numeric;
      v_max:=(v_key->>'max')::numeric;
      if v_min>v_max then
        raise exception 'Numeric range min cannot exceed max';
      end if;
    end if;
  end if;
end;
$$;

revoke all on function security.validate_employer_learning_assessment_question(
  text,text,jsonb,jsonb,numeric,text,text
) from public,anon,authenticated;
grant execute on function security.validate_employer_learning_assessment_question(
  text,text,jsonb,jsonb,numeric,text,text
) to service_role;

create or replace function security.employer_learning_student_assessment_definition(
  p_assessment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assessment public.wf_employer_micro_cert_assessments%rowtype;
begin
  select * into v_assessment
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id;
  if not found then raise exception 'Assessment not found'; end if;

  return jsonb_build_object(
    'assessmentId',v_assessment.assessment_id,
    'microCertVersionId',v_assessment.micro_cert_version_id,
    'lessonId',v_assessment.lesson_id,
    'sequence',v_assessment.sequence_no,
    'title',v_assessment.title,
    'description',v_assessment.description,
    'assessmentType',v_assessment.assessment_type,
    'passingScore',v_assessment.passing_score,
    'maxAttempts',v_assessment.max_attempts,
    'required',v_assessment.required,
    'randomizeQuestions',v_assessment.randomize_questions,
    'showFeedback',v_assessment.show_feedback,
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId',q.question_id,
        'sequence',q.sequence_no,
        'questionType',q.question_type,
        'prompt',q.prompt,
        'options',q.options,
        'points',q.points,
        'required',q.required
      ) order by q.sequence_no,q.created_at)
      from public.wf_employer_micro_cert_assessment_questions q
      where q.assessment_id=v_assessment.assessment_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function security.employer_learning_student_assessment_definition(text)
  from public,anon,authenticated;
grant execute on function security.employer_learning_student_assessment_definition(text)
  to service_role;

create or replace function public.employer_micro_cert_assessment_preview(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_version_id text;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  select mc.current_version_id into v_version_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;
  if not found then raise exception 'Micro-Certification not found'; end if;

  if not exists(
    select 1
    from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then
    raise exception 'Assessment not found';
  end if;

  return security.employer_learning_student_assessment_definition(p_assessment_id);
end;
$$;

revoke all on function public.employer_micro_cert_assessment_preview(text,text,text)
  from public,anon;
grant execute on function public.employer_micro_cert_assessment_preview(text,text,text)
  to authenticated,service_role;

create or replace function security.grade_employer_learning_assessment_question(
  p_question_id text,
  p_response jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  q public.wf_employer_micro_cert_assessment_questions%rowtype;
  v_correct boolean:=false;
  v_response_ids text[];
  v_key_ids text[];
  v_value numeric;
  v_expected numeric;
  v_tolerance numeric;
  v_min numeric;
  v_max numeric;
begin
  select * into q
  from public.wf_employer_micro_cert_assessment_questions
  where question_id=p_question_id;
  if not found then raise exception 'Assessment question not found'; end if;

  if p_response is null or jsonb_typeof(p_response)<>'object' then
    return jsonb_build_object(
      'questionId',q.question_id,'isCorrect',false,'score',0,
      'pointsPossible',q.points
    );
  end if;

  if q.question_type='single_choice' then
    v_correct:=nullif(btrim(coalesce(p_response->>'optionId','')),'')
      = q.answer_key->>'correctOptionId';

  elsif q.question_type='multiple_choice' then
    if jsonb_typeof(p_response->'optionIds')='array' then
      select coalesce(array_agg(distinct value order by value),array[]::text[])
      into v_response_ids
      from jsonb_array_elements_text(p_response->'optionIds');

      select coalesce(array_agg(distinct value order by value),array[]::text[])
      into v_key_ids
      from jsonb_array_elements_text(q.answer_key->'correctOptionIds');

      v_correct:=v_response_ids=v_key_ids;
    end if;

  elsif q.question_type='true_false' then
    if jsonb_typeof(p_response->'value')='boolean' then
      v_correct:=(p_response->>'value')::boolean
        =(q.answer_key->>'correct')::boolean;
    end if;

  elsif q.question_type='acknowledgement' then
    if jsonb_typeof(p_response->'value')='boolean' then
      v_correct:=(p_response->>'value')::boolean
        =(q.answer_key->>'requiredValue')::boolean;
    end if;

  elsif q.question_type='numeric' then
    if jsonb_typeof(p_response->'value')='number' then
      v_value:=(p_response->>'value')::numeric;
      if coalesce(q.answer_key->>'mode','exact')='range' then
        v_min:=(q.answer_key->>'min')::numeric;
        v_max:=(q.answer_key->>'max')::numeric;
        v_correct:=v_value between v_min and v_max;
      else
        v_expected:=(q.answer_key->>'value')::numeric;
        v_tolerance:=coalesce((q.answer_key->>'tolerance')::numeric,0);
        v_correct:=abs(v_value-v_expected)<=v_tolerance;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'questionId',q.question_id,
    'isCorrect',v_correct,
    'score',case when v_correct then q.points else 0 end,
    'pointsPossible',q.points,
    'feedback',case when v_correct then q.feedback_correct else q.feedback_incorrect end
  );
end;
$$;

revoke all on function security.grade_employer_learning_assessment_question(text,jsonb)
  from public,anon,authenticated;
grant execute on function security.grade_employer_learning_assessment_question(text,jsonb)
  to service_role;

create or replace function security.score_employer_learning_assessment(
  p_assessment_id text,
  p_responses jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  a public.wf_employer_micro_cert_assessments%rowtype;
  q record;
  v_response jsonb;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_missing_required text[]:=array[]::text[];
  v_earned numeric:=0;
  v_possible numeric:=0;
  v_percentage numeric:=0;
begin
  select * into a
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id;
  if not found then raise exception 'Assessment not found'; end if;

  if p_responses is null or jsonb_typeof(p_responses)<>'array' then
    raise exception 'Assessment responses must be an array';
  end if;

  for q in
    select *
    from public.wf_employer_micro_cert_assessment_questions
    where assessment_id=p_assessment_id
    order by sequence_no
  loop
    select x->'response'
    into v_response
    from jsonb_array_elements(p_responses) x
    where x->>'questionId'=q.question_id
    limit 1;

    if v_response is null then
      if q.required then
        v_missing_required:=array_append(v_missing_required,q.question_id);
      else
        continue;
      end if;
    end if;

    v_result:=security.grade_employer_learning_assessment_question(
      q.question_id,coalesce(v_response,'{}'::jsonb)
    );
    v_earned:=v_earned+coalesce((v_result->>'score')::numeric,0);
    v_possible:=v_possible+q.points;

    if not a.show_feedback then
      v_result:=v_result-'feedback';
    end if;
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  if v_possible>0 then
    v_percentage:=round((v_earned/v_possible)*100,2);
  end if;

  return jsonb_build_object(
    'assessmentId',a.assessment_id,
    'valid',coalesce(array_length(v_missing_required,1),0)=0 and v_possible>0,
    'missingRequiredQuestionIds',to_jsonb(v_missing_required),
    'score',v_percentage,
    'pointsEarned',v_earned,
    'pointsPossible',v_possible,
    'passed',
      coalesce(array_length(v_missing_required,1),0)=0
      and v_possible>0
      and v_percentage>=a.passing_score,
    'passingScore',a.passing_score,
    'results',v_results
  );
end;
$$;

revoke all on function security.score_employer_learning_assessment(text,jsonb)
  from public,anon,authenticated;
grant execute on function security.score_employer_learning_assessment(text,jsonb)
  to service_role;

create or replace function public.employer_micro_cert_assessment_preview_score(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
  p_responses jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_version_id text;
begin
  if not security.can_view_employer_learning_as_employer(p_employer_id) then
    raise exception 'Employer Learning access denied';
  end if;

  select mc.current_version_id into v_version_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;
  if not found then raise exception 'Micro-Certification not found'; end if;

  if not exists(
    select 1
    from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then
    raise exception 'Assessment not found';
  end if;

  return security.score_employer_learning_assessment(
    p_assessment_id,p_responses
  );
end;
$$;

revoke all on function public.employer_micro_cert_assessment_preview_score(
  text,text,text,jsonb
) from public,anon;
grant execute on function public.employer_micro_cert_assessment_preview_score(
  text,text,text,jsonb
) to authenticated,service_role;

create or replace function public.employer_micro_cert_assessment_authoring_detail(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  a public.wf_employer_micro_cert_assessments%rowtype;
  v_version_id text;
begin
  if not security.can_manage_employer_learning_content(p_employer_id) then
    raise exception 'Employer Learning management denied';
  end if;

  select mc.current_version_id into v_version_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=p_micro_cert_id
    and mc.employer_id=p_employer_id;
  if not found then raise exception 'Micro-Certification not found'; end if;

  select * into a
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id
    and micro_cert_version_id=v_version_id;
  if not found then raise exception 'Assessment not found'; end if;

  return jsonb_build_object(
    'assessmentId',a.assessment_id,
    'microCertVersionId',a.micro_cert_version_id,
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
    'config',a.config,
    'createdByUserId',a.created_by_user_id,
    'createdAt',a.created_at,
    'updatedAt',a.updated_at,
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId',q.question_id,
        'assessmentId',q.assessment_id,
        'sequence',q.sequence_no,
        'questionType',q.question_type,
        'prompt',q.prompt,
        'options',q.options,
        'answerKey',q.answer_key,
        'points',q.points,
        'required',q.required,
        'feedbackCorrect',q.feedback_correct,
        'feedbackIncorrect',q.feedback_incorrect,
        'createdByUserId',q.created_by_user_id,
        'createdAt',q.created_at,
        'updatedAt',q.updated_at
      ) order by q.sequence_no,q.created_at)
      from public.wf_employer_micro_cert_assessment_questions q
      where q.assessment_id=a.assessment_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.employer_micro_cert_assessment_authoring_detail(
  text,text,text
) from public,anon;
grant execute on function public.employer_micro_cert_assessment_authoring_detail(
  text,text,text
) to authenticated,service_role;

create or replace function public.employer_micro_cert_assessment_create(
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
  v_assessment_id text:=security.new_legacy_id('ASM');
  v_lesson_id text:=nullif(btrim(coalesce(p_payload->>'lessonId','')),'');
  v_title text:=nullif(btrim(coalesce(p_payload->>'title','')),'');
  v_description text:=nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_type text:=lower(coalesce(nullif(btrim(p_payload->>'assessmentType'),''),'lesson_quiz'));
  v_passing numeric:=coalesce((p_payload->>'passingScore')::numeric,80);
  v_max integer:=nullif(p_payload->>'maxAttempts','')::integer;
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_randomize boolean:=coalesce((p_payload->>'randomizeQuestions')::boolean,false);
  v_feedback boolean:=coalesce((p_payload->>'showFeedback')::boolean,true);
  v_config jsonb:=coalesce(p_payload->'config','{}'::jsonb);
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if v_title is null then raise exception 'Assessment title is required'; end if;
  if length(v_title)>200 then raise exception 'Assessment title must be 200 characters or fewer'; end if;
  if v_description is not null and length(v_description)>4000 then
    raise exception 'Assessment description must be 4000 characters or fewer';
  end if;
  if v_type not in ('checkpoint','lesson_quiz','final_assessment') then
    raise exception 'Invalid assessment type';
  end if;
  if v_passing<0 or v_passing>100 then
    raise exception 'Passing score must be between 0 and 100';
  end if;
  if v_max is not null and (v_max<1 or v_max>100) then
    raise exception 'Maximum attempts must be between 1 and 100';
  end if;
  if jsonb_typeof(v_config)<>'object' then
    raise exception 'Assessment config must be an object';
  end if;

  if v_type='final_assessment' then
    v_lesson_id:=null;
  elsif v_lesson_id is null then
    raise exception 'Lesson assessment requires a lesson';
  end if;

  if v_lesson_id is not null and not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=v_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Assessment lesson is outside the current course version';
  end if;

  select coalesce(max(sequence_no),0)+1
  into v_sequence
  from public.wf_employer_micro_cert_assessments
  where micro_cert_version_id=v_version_id;

  insert into public.wf_employer_micro_cert_assessments(
    assessment_id,micro_cert_version_id,lesson_id,sequence_no,title,description,
    assessment_type,passing_score,max_attempts,required,randomize_questions,
    show_feedback,config,created_by_user_id,created_at,updated_at
  ) values(
    v_assessment_id,v_version_id,v_lesson_id,v_sequence,v_title,v_description,
    v_type,v_passing,v_max,v_required,v_randomize,v_feedback,v_config,v_user_id,
    now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_CREATED',
    'employer_micro_cert_assessment',v_assessment_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'assessmentId',v_assessment_id,'lessonId',v_lesson_id,'title',v_title,
      'assessmentType',v_type,'passingScore',v_passing,'maxAttempts',v_max,
      'required',v_required,'randomizeQuestions',v_randomize,
      'showFeedback',v_feedback
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,v_assessment_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
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
  a public.wf_employer_micro_cert_assessments%rowtype;
  v_lesson_id text;
  v_title text;
  v_description text;
  v_type text;
  v_passing numeric;
  v_max integer;
  v_required boolean;
  v_randomize boolean;
  v_feedback boolean;
  v_config jsonb;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into a
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id
    and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Assessment not found'; end if;

  v_title:=case when p_payload ? 'title'
    then nullif(btrim(coalesce(p_payload->>'title','')),'') else a.title end;
  v_description:=case when p_payload ? 'description'
    then nullif(btrim(coalesce(p_payload->>'description','')),'')
    else a.description end;
  v_type:=case when p_payload ? 'assessmentType'
    then lower(nullif(btrim(coalesce(p_payload->>'assessmentType','')),''))
    else a.assessment_type end;
  v_lesson_id:=case when p_payload ? 'lessonId'
    then nullif(btrim(coalesce(p_payload->>'lessonId','')),'')
    else a.lesson_id end;
  v_passing:=case when p_payload ? 'passingScore'
    then (p_payload->>'passingScore')::numeric else a.passing_score end;
  v_max:=case when p_payload ? 'maxAttempts'
    then nullif(p_payload->>'maxAttempts','')::integer else a.max_attempts end;
  v_required:=case when p_payload ? 'required'
    then (p_payload->>'required')::boolean else a.required end;
  v_randomize:=case when p_payload ? 'randomizeQuestions'
    then (p_payload->>'randomizeQuestions')::boolean else a.randomize_questions end;
  v_feedback:=case when p_payload ? 'showFeedback'
    then (p_payload->>'showFeedback')::boolean else a.show_feedback end;
  v_config:=case when p_payload ? 'config'
    then p_payload->'config' else a.config end;

  if v_title is null then raise exception 'Assessment title is required'; end if;
  if length(v_title)>200 then raise exception 'Assessment title must be 200 characters or fewer'; end if;
  if v_description is not null and length(v_description)>4000 then
    raise exception 'Assessment description must be 4000 characters or fewer';
  end if;
  if v_type not in ('checkpoint','lesson_quiz','final_assessment') then
    raise exception 'Invalid assessment type';
  end if;
  if v_passing<0 or v_passing>100 then
    raise exception 'Passing score must be between 0 and 100';
  end if;
  if v_max is not null and (v_max<1 or v_max>100) then
    raise exception 'Maximum attempts must be between 1 and 100';
  end if;
  if v_config is null or jsonb_typeof(v_config)<>'object' then
    raise exception 'Assessment config must be an object';
  end if;

  if v_type='final_assessment' then
    v_lesson_id:=null;
  elsif v_lesson_id is null then
    raise exception 'Lesson assessment requires a lesson';
  end if;

  if v_lesson_id is not null and not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=v_lesson_id
      and l.micro_cert_version_id=v_version_id
      and l.status<>'archived'
  ) then
    raise exception 'Assessment lesson is outside the current course version';
  end if;

  update public.wf_employer_micro_cert_assessments
  set lesson_id=v_lesson_id,title=v_title,description=v_description,
      assessment_type=v_type,passing_score=v_passing,max_attempts=v_max,
      required=v_required,randomize_questions=v_randomize,
      show_feedback=v_feedback,config=v_config,updated_at=now()
  where assessment_id=p_assessment_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_UPDATED',
    'employer_micro_cert_assessment',p_assessment_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'lessonId',a.lesson_id,'title',a.title,'assessmentType',a.assessment_type,
      'passingScore',a.passing_score,'maxAttempts',a.max_attempts,
      'required',a.required,'randomizeQuestions',a.randomize_questions,
      'showFeedback',a.show_feedback
    ),
    jsonb_build_object(
      'lessonId',v_lesson_id,'title',v_title,'assessmentType',v_type,
      'passingScore',v_passing,'maxAttempts',v_max,'required',v_required,
      'randomizeQuestions',v_randomize,'showFeedback',v_feedback
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,p_assessment_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_delete(
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
  a public.wf_employer_micro_cert_assessments%rowtype;
  v_ids text[];
  v_i integer;
  v_temp integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  select * into a
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id
    and micro_cert_version_id=v_version_id
  for update;
  if not found then raise exception 'Assessment not found'; end if;

  delete from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id;

  select coalesce(array_agg(assessment_id order by sequence_no),array[]::text[]),
         coalesce(max(sequence_no),0)+1000000
  into v_ids,v_temp
  from public.wf_employer_micro_cert_assessments
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessments
    set sequence_no=v_temp+v_i,updated_at=now()
    where assessment_id=v_ids[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessments
    set sequence_no=v_i,updated_at=now()
    where assessment_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_DELETED',
    'employer_micro_cert_assessment',p_assessment_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'title',a.title,'assessmentType',a.assessment_type,'lessonId',a.lesson_id
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_assessments_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_ids jsonb
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
  v_count integer;
  v_distinct integer;
  v_i integer;
  v_temp integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if p_assessment_ids is null or jsonb_typeof(p_assessment_ids)<>'array' then
    raise exception 'assessmentIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),count(distinct value)
  into v_ids,v_count,v_distinct
  from jsonb_array_elements_text(p_assessment_ids)
    with ordinality as x(value,ordinality);

  if v_count<>v_distinct then
    raise exception 'assessmentIds must not contain duplicates';
  end if;

  if v_count<>(select count(*) from public.wf_employer_micro_cert_assessments
    where micro_cert_version_id=v_version_id) then
    raise exception 'assessmentIds must contain every assessment exactly once';
  end if;

  if exists(
    select 1 from unnest(v_ids) x(id)
    where not exists(
      select 1 from public.wf_employer_micro_cert_assessments a
      where a.assessment_id=x.id and a.micro_cert_version_id=v_version_id
    )
  ) then
    raise exception 'assessmentIds contains an assessment outside the current version';
  end if;

  select coalesce(max(sequence_no),0)+1000000
  into v_temp
  from public.wf_employer_micro_cert_assessments
  where micro_cert_version_id=v_version_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessments
    set sequence_no=v_temp+v_i,updated_at=now()
    where assessment_id=v_ids[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessments
    set sequence_no=v_i,updated_at=now()
    where assessment_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENTS_REORDERED',
    'employer_micro_cert',p_micro_cert_id,'workforce-employer-learning',
    p_employer_id,'success',
    jsonb_build_object(
      'source','W11-05A','microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_module_detail(p_employer_id,p_micro_cert_id);
end;
$$;

create or replace function public.employer_micro_cert_assessment_question_create(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
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
  v_question_id text:=security.new_legacy_id('ASQ');
  v_type text:=lower(nullif(btrim(coalesce(p_payload->>'questionType','')),''));
  v_prompt text:=nullif(btrim(coalesce(p_payload->>'prompt','')),'');
  v_options jsonb:=coalesce(p_payload->'options','[]'::jsonb);
  v_key jsonb:=coalesce(p_payload->'answerKey','{}'::jsonb);
  v_points numeric:=coalesce((p_payload->>'points')::numeric,1);
  v_required boolean:=coalesce((p_payload->>'required')::boolean,true);
  v_correct text:=nullif(btrim(coalesce(p_payload->>'feedbackCorrect','')),'');
  v_incorrect text:=nullif(btrim(coalesce(p_payload->>'feedbackIncorrect','')),'');
  v_sequence integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1 from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then raise exception 'Assessment not found'; end if;

  perform security.validate_employer_learning_assessment_question(
    v_type,v_prompt,v_options,v_key,v_points,v_correct,v_incorrect
  );

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.wf_employer_micro_cert_assessment_questions
  where assessment_id=p_assessment_id;

  insert into public.wf_employer_micro_cert_assessment_questions(
    question_id,assessment_id,sequence_no,question_type,prompt,options,
    answer_key,points,required,feedback_correct,feedback_incorrect,
    created_by_user_id,created_at,updated_at
  ) values(
    v_question_id,p_assessment_id,v_sequence,v_type,v_prompt,v_options,
    v_key,v_points,v_required,v_correct,v_incorrect,v_user_id,now(),now()
  );

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_QUESTION_CREATED',
    'employer_micro_cert_assessment_question',v_question_id,
    'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object(
      'questionId',v_question_id,'assessmentId',p_assessment_id,
      'questionType',v_type,'points',v_points,'required',v_required,
      'optionCount',jsonb_array_length(v_options),
      'answerKeyConfigured',true
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,p_assessment_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_question_update(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
  p_question_id text,
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
  q public.wf_employer_micro_cert_assessment_questions%rowtype;
  v_type text;
  v_prompt text;
  v_options jsonb;
  v_key jsonb;
  v_points numeric;
  v_required boolean;
  v_correct text;
  v_incorrect text;
  v_answer_changed boolean;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1 from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then raise exception 'Assessment not found'; end if;

  select * into q
  from public.wf_employer_micro_cert_assessment_questions
  where question_id=p_question_id
    and assessment_id=p_assessment_id
  for update;
  if not found then raise exception 'Assessment question not found'; end if;

  v_type:=case when p_payload ? 'questionType'
    then lower(nullif(btrim(coalesce(p_payload->>'questionType','')),''))
    else q.question_type end;
  v_prompt:=case when p_payload ? 'prompt'
    then nullif(btrim(coalesce(p_payload->>'prompt','')),'') else q.prompt end;
  v_options:=case when p_payload ? 'options'
    then p_payload->'options' else q.options end;
  v_key:=case when p_payload ? 'answerKey'
    then p_payload->'answerKey' else q.answer_key end;
  v_points:=case when p_payload ? 'points'
    then (p_payload->>'points')::numeric else q.points end;
  v_required:=case when p_payload ? 'required'
    then (p_payload->>'required')::boolean else q.required end;
  v_correct:=case when p_payload ? 'feedbackCorrect'
    then nullif(btrim(coalesce(p_payload->>'feedbackCorrect','')),'')
    else q.feedback_correct end;
  v_incorrect:=case when p_payload ? 'feedbackIncorrect'
    then nullif(btrim(coalesce(p_payload->>'feedbackIncorrect','')),'')
    else q.feedback_incorrect end;

  perform security.validate_employer_learning_assessment_question(
    v_type,v_prompt,v_options,v_key,v_points,v_correct,v_incorrect
  );

  v_answer_changed:=v_key is distinct from q.answer_key;

  update public.wf_employer_micro_cert_assessment_questions
  set question_type=v_type,prompt=v_prompt,options=v_options,answer_key=v_key,
      points=v_points,required=v_required,feedback_correct=v_correct,
      feedback_incorrect=v_incorrect,updated_at=now()
  where question_id=p_question_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_QUESTION_UPDATED',
    'employer_micro_cert_assessment_question',p_question_id,
    'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object(
      'questionType',q.question_type,'points',q.points,'required',q.required,
      'optionCount',jsonb_array_length(q.options)
    ),
    jsonb_build_object(
      'questionType',v_type,'points',v_points,'required',v_required,
      'optionCount',jsonb_array_length(v_options),
      'answerKeyChanged',v_answer_changed
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id,'assessmentId',p_assessment_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,p_assessment_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_question_delete(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
  p_question_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_version_id text;
  q public.wf_employer_micro_cert_assessment_questions%rowtype;
  v_ids text[];
  v_i integer;
  v_temp integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1 from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then raise exception 'Assessment not found'; end if;

  select * into q
  from public.wf_employer_micro_cert_assessment_questions
  where question_id=p_question_id
    and assessment_id=p_assessment_id
  for update;
  if not found then raise exception 'Assessment question not found'; end if;

  delete from public.wf_employer_micro_cert_assessment_questions
  where question_id=p_question_id;

  select coalesce(array_agg(question_id order by sequence_no),array[]::text[]),
         coalesce(max(sequence_no),0)+1000000
  into v_ids,v_temp
  from public.wf_employer_micro_cert_assessment_questions
  where assessment_id=p_assessment_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessment_questions
    set sequence_no=v_temp+v_i,updated_at=now()
    where question_id=v_ids[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessment_questions
    set sequence_no=v_i,updated_at=now()
    where question_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,before_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_QUESTION_DELETED',
    'employer_micro_cert_assessment_question',p_question_id,
    'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object(
      'questionType',q.question_type,'points',q.points,'required',q.required
    ),
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id,'assessmentId',p_assessment_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,p_assessment_id
  );
end;
$$;

create or replace function public.employer_micro_cert_assessment_questions_reorder(
  p_employer_id text,
  p_micro_cert_id text,
  p_assessment_id text,
  p_question_ids jsonb
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
  v_count integer;
  v_distinct integer;
  v_i integer;
  v_temp integer;
begin
  v_version_id:=security.current_mutable_employer_micro_cert_version(
    p_employer_id,p_micro_cert_id
  );

  if not exists(
    select 1 from public.wf_employer_micro_cert_assessments a
    where a.assessment_id=p_assessment_id
      and a.micro_cert_version_id=v_version_id
  ) then raise exception 'Assessment not found'; end if;

  if p_question_ids is null or jsonb_typeof(p_question_ids)<>'array' then
    raise exception 'questionIds must be an array';
  end if;

  select coalesce(array_agg(value order by ordinality),array[]::text[]),
         count(*),count(distinct value)
  into v_ids,v_count,v_distinct
  from jsonb_array_elements_text(p_question_ids)
    with ordinality as x(value,ordinality);

  if v_count<>v_distinct then
    raise exception 'questionIds must not contain duplicates';
  end if;
  if v_count<>(select count(*) from public.wf_employer_micro_cert_assessment_questions
    where assessment_id=p_assessment_id) then
    raise exception 'questionIds must contain every question exactly once';
  end if;
  if exists(
    select 1 from unnest(v_ids) x(id)
    where not exists(
      select 1 from public.wf_employer_micro_cert_assessment_questions q
      where q.question_id=x.id and q.assessment_id=p_assessment_id
    )
  ) then
    raise exception 'questionIds contains a question outside the assessment';
  end if;

  select coalesce(max(sequence_no),0)+1000000 into v_temp
  from public.wf_employer_micro_cert_assessment_questions
  where assessment_id=p_assessment_id;

  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessment_questions
    set sequence_no=v_temp+v_i,updated_at=now()
    where question_id=v_ids[v_i];
  end loop;
  for v_i in 1..coalesce(array_length(v_ids,1),0) loop
    update public.wf_employer_micro_cert_assessment_questions
    set sequence_no=v_i,updated_at=now()
    where question_id=v_ids[v_i];
  end loop;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,result,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSESSMENT_QUESTIONS_REORDERED',
    'employer_micro_cert_assessment',p_assessment_id,
    'workforce-employer-learning',p_employer_id,'success',
    jsonb_build_object(
      'source','W11-05A','microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id
    )
  );

  return public.employer_micro_cert_assessment_authoring_detail(
    p_employer_id,p_micro_cert_id,p_assessment_id
  );
end;
$$;

revoke all on function public.employer_micro_cert_assessment_create(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_update(text,text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_delete(text,text,text)
  from public,anon;
revoke all on function public.employer_micro_cert_assessments_reorder(text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_question_create(text,text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_question_update(text,text,text,text,jsonb)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_question_delete(text,text,text,text)
  from public,anon;
revoke all on function public.employer_micro_cert_assessment_questions_reorder(text,text,text,jsonb)
  from public,anon;

grant execute on function public.employer_micro_cert_assessment_create(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_update(text,text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_delete(text,text,text)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessments_reorder(text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_question_create(text,text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_question_update(text,text,text,text,jsonb)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_question_delete(text,text,text,text)
  to authenticated,service_role;
grant execute on function public.employer_micro_cert_assessment_questions_reorder(text,text,text,jsonb)
  to authenticated,service_role;
