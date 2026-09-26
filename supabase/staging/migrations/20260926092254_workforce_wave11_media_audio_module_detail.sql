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
            'image','video','audio','document','download','link','embed','button'
          )
          and nullif(btrim(coalesce(b.content->>'url','')),'') is not null
      ),'[]'::jsonb)
    )
  );
end;
$$;
