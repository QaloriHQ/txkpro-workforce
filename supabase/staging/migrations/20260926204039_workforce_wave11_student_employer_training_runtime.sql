-- W11-07 — Student Employer Training runtime.
-- Adds Student-scoped read/write RPCs, explainable lesson progress primitives,
-- deterministic assessment attempt persistence, and assignment/version-scoped
-- private media authorization. W11-08 retains ownership of final completion.

create table if not exists public.wf_micro_cert_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_progress_id text not null unique default security.new_legacy_id('MLP'),
  assignment_id text not null
    references public.wf_micro_cert_assignments(assignment_id) on delete cascade,
  micro_cert_version_id text not null
    references public.wf_employer_micro_cert_versions(micro_cert_version_id) on delete cascade,
  lesson_id text not null
    references public.wf_employer_micro_cert_lessons(lesson_id) on delete cascade,
  started_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id,lesson_id)
);

create index if not exists idx_wf_micro_cert_lesson_progress_assignment
  on public.wf_micro_cert_lesson_progress(assignment_id,completed_at,updated_at desc);

create index if not exists idx_wf_micro_cert_lesson_progress_version
  on public.wf_micro_cert_lesson_progress(micro_cert_version_id,assignment_id);

alter table public.wf_micro_cert_lesson_progress enable row level security;
revoke all on table public.wf_micro_cert_lesson_progress
  from public,anon,authenticated;
grant all on table public.wf_micro_cert_lesson_progress to service_role;

create unique index if not exists ux_wf_micro_cert_assessment_attempts_in_progress
  on public.wf_micro_cert_assessment_attempts(assignment_id,assessment_id)
  where status='in_progress';

create or replace function security.student_learning_assignment_row(
  p_assignment_id text
)
returns public.wf_micro_cert_assignments
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_student_id text:=security.current_student_id();
  v_assignment public.wf_micro_cert_assignments%rowtype;
begin
  if v_student_id is null then
    raise exception 'Student membership required';
  end if;

  select * into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=p_assignment_id
    and a.student_id=v_student_id;

  if not found then
    raise exception 'Employer Training assignment not found';
  end if;

  if v_assignment.status='cancelled' then
    raise exception 'Employer Training assignment is cancelled';
  end if;

  return v_assignment;
end;
$$;

revoke all on function security.student_learning_assignment_row(text)
  from public,anon,authenticated;
grant execute on function security.student_learning_assignment_row(text)
  to service_role;

create or replace function security.student_employer_training_progress(
  p_assignment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_required_lessons integer:=0;
  v_completed_required_lessons integer:=0;
  v_all_lessons integer:=0;
  v_completed_lessons integer:=0;
  v_required_checkpoints integer:=0;
  v_completed_required_checkpoints integer:=0;
  v_all_checkpoints integer:=0;
  v_completed_checkpoints integer:=0;
  v_required_assessments integer:=0;
  v_passed_required_assessments integer:=0;
  v_all_assessments integer:=0;
  v_passed_assessments integer:=0;
  v_required_total integer:=0;
  v_required_complete integer:=0;
  v_percent numeric:=0;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  select
    count(*) filter(where l.required),
    count(*) filter(where l.required and lp.completed_at is not null),
    count(*),
    count(*) filter(where lp.completed_at is not null)
  into
    v_required_lessons,v_completed_required_lessons,
    v_all_lessons,v_completed_lessons
  from public.wf_employer_micro_cert_lessons l
  left join public.wf_micro_cert_lesson_progress lp
    on lp.assignment_id=v_assignment.assignment_id
   and lp.lesson_id=l.lesson_id
  where l.micro_cert_version_id=v_assignment.micro_cert_version_id
    and l.status in ('ready','published');

  select
    count(*) filter(where cp.required),
    count(*) filter(
      where cp.required and exists(
        select 1
        from public.wf_micro_cert_checkpoint_responses cr
        where cr.assignment_id=v_assignment.assignment_id
          and cr.checkpoint_id=cp.checkpoint_id
          and coalesce(cr.score,0)>=100
      )
    ),
    count(*),
    count(*) filter(
      where exists(
        select 1
        from public.wf_micro_cert_checkpoint_responses cr
        where cr.assignment_id=v_assignment.assignment_id
          and cr.checkpoint_id=cp.checkpoint_id
          and coalesce(cr.score,0)>=100
      )
    )
  into
    v_required_checkpoints,v_completed_required_checkpoints,
    v_all_checkpoints,v_completed_checkpoints
  from public.wf_employer_micro_cert_checkpoints cp
  where cp.micro_cert_version_id=v_assignment.micro_cert_version_id;

  select
    count(*) filter(where a.required),
    count(*) filter(
      where a.required and exists(
        select 1
        from public.wf_micro_cert_assessment_attempts aa
        where aa.assignment_id=v_assignment.assignment_id
          and aa.assessment_id=a.assessment_id
          and aa.status='passed'
      )
    ),
    count(*),
    count(*) filter(
      where exists(
        select 1
        from public.wf_micro_cert_assessment_attempts aa
        where aa.assignment_id=v_assignment.assignment_id
          and aa.assessment_id=a.assessment_id
          and aa.status='passed'
      )
    )
  into
    v_required_assessments,v_passed_required_assessments,
    v_all_assessments,v_passed_assessments
  from public.wf_employer_micro_cert_assessments a
  where a.micro_cert_version_id=v_assignment.micro_cert_version_id;

  v_required_total:=
    v_required_lessons+v_required_checkpoints+v_required_assessments;
  v_required_complete:=
    v_completed_required_lessons+
    v_completed_required_checkpoints+
    v_passed_required_assessments;

  if v_required_total>0 then
    v_percent:=round((v_required_complete::numeric/v_required_total::numeric)*100,2);
  end if;

  return jsonb_build_object(
    'requiredItems',jsonb_build_object(
      'completed',v_required_complete,
      'total',v_required_total,
      'percent',v_percent
    ),
    'lessons',jsonb_build_object(
      'completed',v_completed_lessons,
      'total',v_all_lessons,
      'requiredCompleted',v_completed_required_lessons,
      'requiredTotal',v_required_lessons
    ),
    'checkpoints',jsonb_build_object(
      'completed',v_completed_checkpoints,
      'total',v_all_checkpoints,
      'requiredCompleted',v_completed_required_checkpoints,
      'requiredTotal',v_required_checkpoints
    ),
    'assessments',jsonb_build_object(
      'passed',v_passed_assessments,
      'total',v_all_assessments,
      'requiredPassed',v_passed_required_assessments,
      'requiredTotal',v_required_assessments
    )
  );
end;
$$;

revoke all on function security.student_employer_training_progress(text)
  from public,anon,authenticated;
grant execute on function security.student_employer_training_progress(text)
  to service_role;

create or replace function security.ensure_student_employer_training_started(
  p_assignment_id text
)
returns public.wf_micro_cert_assignments
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_employer_id text;
  v_exposure_event_id text;
  v_event_key text;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  if v_assignment.status='completed' then
    raise exception 'Completed Employer Training assignment is read-only';
  end if;

  v_before:=jsonb_build_object(
    'status',v_assignment.status,
    'startedAt',v_assignment.started_at
  );

  if v_assignment.status='assigned' then
    update public.wf_micro_cert_assignments
    set status='in_progress',
        started_at=coalesce(started_at,now()),
        updated_at=now()
    where assignment_id=v_assignment.assignment_id
    returning * into v_assignment;
  end if;

  select mc.employer_id
  into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  if v_employer_id is null then
    raise exception 'Employer Training employer not found';
  end if;
  if v_assignment.institution_id is null then
    raise exception 'Employer Training assignment requires Institution context';
  end if;

  v_event_key:='employer-training-started:'||v_assignment.assignment_id;

  insert into public.wf_employer_exposure_events(
    exposure_event_id,event_key,student_id,employer_id,institution_id,
    event_type,source_type,source_id,micro_cert_id,assignment_id,
    occurred_at,metadata,created_at
  ) values(
    security.new_legacy_id('EEX'),
    v_event_key,
    v_assignment.student_id,
    v_employer_id,
    v_assignment.institution_id,
    'EMPLOYER_TRAINING_STARTED',
    'assignment',
    v_assignment.assignment_id,
    v_assignment.micro_cert_id,
    v_assignment.assignment_id,
    coalesce(v_assignment.started_at,now()),
    jsonb_build_object(
      'microCertVersionId',v_assignment.micro_cert_version_id
    ),
    now()
  )
  on conflict(event_key) do update
    set event_key=excluded.event_key
  returning exposure_event_id into v_exposure_event_id;

  v_after:=jsonb_build_object(
    'status',v_assignment.status,
    'startedAt',v_assignment.started_at
  );

  perform security.emit_employer_learning_event(
    p_event_type=>'EMPLOYER_TRAINING_STARTED',
    p_target_id=>v_exposure_event_id,
    p_event_key=>v_event_key,
    p_source=>'student',
    p_employer_id=>v_employer_id,
    p_institution_id=>v_assignment.institution_id,
    p_student_id=>v_assignment.student_id,
    p_actor_type=>'user',
    p_before=>v_before,
    p_after=>v_after,
    p_metadata=>jsonb_build_object(
      'exposure_event_id',v_exposure_event_id,
      'assignment_id',v_assignment.assignment_id,
      'micro_cert_id',v_assignment.micro_cert_id,
      'event_type','EMPLOYER_TRAINING_STARTED',
      'source_type','assignment',
      'micro_cert_version_id',v_assignment.micro_cert_version_id
    ),
    p_result=>'success'
  );

  return v_assignment;
end;
$$;

revoke all on function security.ensure_student_employer_training_started(text)
  from public,anon,authenticated;
grant execute on function security.ensure_student_employer_training_started(text)
  to service_role;

create or replace function public.student_employer_training_assignments()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_student_id text:=security.current_student_id();
begin
  if v_student_id is null then
    raise exception 'Student membership required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignmentId',a.assignment_id,
      'status',a.status,
      'assignedAt',a.assigned_at,
      'startedAt',a.started_at,
      'completedAt',a.completed_at,
      'cancelledAt',a.cancelled_at,
      'institutionId',a.institution_id,
      'cohortId',a.cohort_id,
      'microCertId',a.micro_cert_id,
      'microCertVersionId',a.micro_cert_version_id,
      'versionNumber',v.version_number,
      'versionStatus',v.status,
      'employerId',mc.employer_id,
      'employerName',ctr.business_name,
      'title',mc.title,
      'description',mc.description,
      'learningObjective',v.learning_objective,
      'durationMinutes',v.duration_minutes,
      'progress',case
        when a.status='cancelled' then null
        else security.student_employer_training_progress(a.assignment_id)
      end
    ) order by
      case a.status
        when 'in_progress' then 1
        when 'assigned' then 2
        when 'completed' then 3
        else 4
      end,
      a.assigned_at desc
    )
    from public.wf_micro_cert_assignments a
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
    join public.contractors ctr
      on ctr.contractor_id=mc.employer_id
    where a.student_id=v_student_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.student_employer_training_assignments()
  from public,anon;
grant execute on function public.student_employer_training_assignments()
  to authenticated,service_role;

create or replace function public.student_employer_training_assignment(
  p_assignment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_employer_id text;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  select mc.employer_id
  into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  return jsonb_build_object(
    'assignment',jsonb_build_object(
      'assignmentId',v_assignment.assignment_id,
      'status',v_assignment.status,
      'assignedAt',v_assignment.assigned_at,
      'startedAt',v_assignment.started_at,
      'completedAt',v_assignment.completed_at,
      'institutionId',v_assignment.institution_id,
      'cohortId',v_assignment.cohort_id,
      'microCertId',v_assignment.micro_cert_id,
      'microCertVersionId',v_assignment.micro_cert_version_id
    ),
    'course',(
      select jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'title',mc.title,
        'description',mc.description,
        'employerId',mc.employer_id,
        'employerName',ctr.business_name,
        'microCertVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'versionStatus',v.status,
        'learningObjective',v.learning_objective,
        'durationMinutes',v.duration_minutes,
        'equipmentProcessContext',v.equipment_process_context,
        'safetyNotes',v.safety_notes
      )
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=v_assignment.micro_cert_version_id
       and v.micro_cert_id=mc.micro_cert_id
      join public.contractors ctr
        on ctr.contractor_id=mc.employer_id
      where mc.micro_cert_id=v_assignment.micro_cert_id
    ),
    'sections',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sectionId',s.section_id,
        'sequence',s.sequence_no,
        'title',s.title,
        'description',s.description,
        'required',s.required
      ) order by s.sequence_no,s.created_at)
      from public.wf_employer_micro_cert_sections s
      where s.micro_cert_version_id=v_assignment.micro_cert_version_id
    ),'[]'::jsonb),
    'lessons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'lessonId',l.lesson_id,
        'sectionId',l.section_id,
        'sequence',l.sequence_no,
        'title',l.title,
        'description',l.description,
        'learningObjective',l.learning_objective,
        'estimatedMinutes',l.estimated_minutes,
        'required',l.required,
        'status',l.status,
        'startedAt',lp.started_at,
        'lastViewedAt',lp.last_viewed_at,
        'completedAt',lp.completed_at,
        'blocks',coalesce((
          select jsonb_agg(jsonb_build_object(
            'lessonBlockId',b.lesson_block_id,
            'lessonId',b.lesson_id,
            'sequence',b.sequence_no,
            'blockType',b.block_type,
            'title',b.title,
            'content',
              b.content
              - (case when b.content ? 'mediaAssetId' then 'url' else '__none__' end)
              - (case when b.content ? 'posterMediaAssetId' then 'posterUrl' else '__none__' end)
              - (case when b.content ? 'captionsMediaAssetId' then 'captionsUrl' else '__none__' end),
            'required',b.required
          ) order by b.sequence_no,b.created_at)
          from public.wf_employer_micro_cert_lesson_blocks b
          where b.lesson_id=l.lesson_id
        ),'[]'::jsonb)
      ) order by coalesce(l.section_id,''),l.sequence_no,l.created_at)
      from public.wf_employer_micro_cert_lessons l
      left join public.wf_micro_cert_lesson_progress lp
        on lp.assignment_id=v_assignment.assignment_id
       and lp.lesson_id=l.lesson_id
      where l.micro_cert_version_id=v_assignment.micro_cert_version_id
        and l.status in ('ready','published')
    ),'[]'::jsonb),
    'checkpoints',coalesce((
      select jsonb_agg(jsonb_build_object(
        'checkpointId',cp.checkpoint_id,
        'sequence',cp.sequence_no,
        'title',cp.title,
        'prompt',cp.prompt,
        'checkpointType',cp.checkpoint_type,
        'config',cp.config,
        'required',cp.required,
        'weight',cp.weight,
        'satisfied',exists(
          select 1
          from public.wf_micro_cert_checkpoint_responses cr
          where cr.assignment_id=v_assignment.assignment_id
            and cr.checkpoint_id=cp.checkpoint_id
            and coalesce(cr.score,0)>=100
        ),
        'latestResponse',(
          select jsonb_build_object(
            'checkpointResponseId',cr.checkpoint_response_id,
            'attemptNumber',cr.attempt_number,
            'response',cr.response_json,
            'score',cr.score,
            'submittedAt',cr.submitted_at
          )
          from public.wf_micro_cert_checkpoint_responses cr
          where cr.assignment_id=v_assignment.assignment_id
            and cr.checkpoint_id=cp.checkpoint_id
          order by cr.attempt_number desc
          limit 1
        )
      ) order by cp.sequence_no,cp.created_at)
      from public.wf_employer_micro_cert_checkpoints cp
      where cp.micro_cert_version_id=v_assignment.micro_cert_version_id
    ),'[]'::jsonb),
    'assessments',coalesce((
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
        'questionCount',(
          select count(*)
          from public.wf_employer_micro_cert_assessment_questions q
          where q.assessment_id=a.assessment_id
        ),
        'eligibility',security.employer_learning_assessment_attempt_eligibility(
          v_assignment.assignment_id,a.assessment_id
        ),
        'latestAttempt',(
          select jsonb_build_object(
            'assessmentAttemptId',aa.assessment_attempt_id,
            'attemptNumber',aa.attempt_number,
            'status',aa.status,
            'score',aa.score,
            'startedAt',aa.started_at,
            'submittedAt',aa.submitted_at
          )
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=a.assessment_id
          order by aa.attempt_number desc
          limit 1
        )
      ) order by a.sequence_no,a.created_at)
      from public.wf_employer_micro_cert_assessments a
      where a.micro_cert_version_id=v_assignment.micro_cert_version_id
    ),'[]'::jsonb),
    'progress',security.student_employer_training_progress(v_assignment.assignment_id)
  );
end;
$$;

revoke all on function public.student_employer_training_assignment(text)
  from public,anon;
grant execute on function public.student_employer_training_assignment(text)
  to authenticated,service_role;

create or replace function public.student_employer_training_start(
  p_assignment_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);
  if v_assignment.status<>'completed' then
    perform security.ensure_student_employer_training_started(p_assignment_id);
  end if;
  return public.student_employer_training_assignment(p_assignment_id);
end;
$$;

revoke all on function public.student_employer_training_start(text)
  from public,anon;
grant execute on function public.student_employer_training_start(text)
  to authenticated,service_role;

create or replace function public.student_employer_training_lesson_touch(
  p_assignment_id text,
  p_lesson_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
begin
  v_assignment:=security.ensure_student_employer_training_started(p_assignment_id);

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_assignment.micro_cert_version_id
      and l.status in ('ready','published')
  ) then
    raise exception 'Lesson is outside the assigned course version';
  end if;

  insert into public.wf_micro_cert_lesson_progress(
    lesson_progress_id,assignment_id,micro_cert_version_id,lesson_id,
    started_at,last_viewed_at,created_at,updated_at
  ) values(
    security.new_legacy_id('MLP'),
    v_assignment.assignment_id,
    v_assignment.micro_cert_version_id,
    p_lesson_id,
    now(),now(),now(),now()
  )
  on conflict(assignment_id,lesson_id) do update
    set last_viewed_at=now(),
        updated_at=now();

  return security.student_employer_training_progress(v_assignment.assignment_id);
end;
$$;

revoke all on function public.student_employer_training_lesson_touch(text,text)
  from public,anon;
grant execute on function public.student_employer_training_lesson_touch(text,text)
  to authenticated,service_role;

create or replace function public.student_employer_training_lesson_complete(
  p_assignment_id text,
  p_lesson_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_progress public.wf_micro_cert_lesson_progress%rowtype;
  v_employer_id text;
begin
  v_assignment:=security.ensure_student_employer_training_started(p_assignment_id);

  if not exists(
    select 1
    from public.wf_employer_micro_cert_lessons l
    where l.lesson_id=p_lesson_id
      and l.micro_cert_version_id=v_assignment.micro_cert_version_id
      and l.status in ('ready','published')
  ) then
    raise exception 'Lesson is outside the assigned course version';
  end if;

  insert into public.wf_micro_cert_lesson_progress(
    lesson_progress_id,assignment_id,micro_cert_version_id,lesson_id,
    started_at,last_viewed_at,completed_at,created_at,updated_at
  ) values(
    security.new_legacy_id('MLP'),
    v_assignment.assignment_id,
    v_assignment.micro_cert_version_id,
    p_lesson_id,
    now(),now(),now(),now(),now()
  )
  on conflict(assignment_id,lesson_id) do update
    set last_viewed_at=now(),
        completed_at=coalesce(public.wf_micro_cert_lesson_progress.completed_at,now()),
        updated_at=now()
  returning * into v_progress;

  select mc.employer_id into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,institution_id,student_id,result,after_json,metadata
  ) values(
    (select auth.uid()),
    security.current_legacy_user_id(),
    'MICRO_CERT_LESSON_COMPLETED',
    'micro_cert_lesson_progress',
    v_progress.lesson_progress_id,
    'workforce-student-employer-training',
    v_employer_id,
    v_assignment.institution_id,
    v_assignment.student_id,
    'success',
    jsonb_build_object(
      'assignmentId',v_assignment.assignment_id,
      'microCertVersionId',v_assignment.micro_cert_version_id,
      'lessonId',p_lesson_id,
      'completedAt',v_progress.completed_at
    ),
    jsonb_build_object('source','W11-07')
  );

  return security.student_employer_training_progress(v_assignment.assignment_id);
end;
$$;

revoke all on function public.student_employer_training_lesson_complete(text,text)
  from public,anon;
grant execute on function public.student_employer_training_lesson_complete(text,text)
  to authenticated,service_role;

create or replace function public.student_employer_training_checkpoint_submit(
  p_assignment_id text,
  p_checkpoint_id text,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_checkpoint public.wf_employer_micro_cert_checkpoints%rowtype;
  v_attempt integer;
  v_satisfied boolean:=false;
  v_score numeric:=0;
  v_response_id text:=security.new_legacy_id('MCR');
  v_employer_id text;
begin
  v_assignment:=security.ensure_student_employer_training_started(p_assignment_id);

  select * into v_checkpoint
  from public.wf_employer_micro_cert_checkpoints cp
  where cp.checkpoint_id=p_checkpoint_id
    and cp.micro_cert_version_id=v_assignment.micro_cert_version_id;

  if not found then
    raise exception 'Checkpoint is outside the assigned course version';
  end if;

  if p_response is null or jsonb_typeof(p_response)<>'object' then
    raise exception 'Checkpoint response must be an object';
  end if;

  if v_checkpoint.checkpoint_type in ('acknowledgement','confirmation') then
    v_satisfied:=jsonb_typeof(p_response->'value')='boolean'
      and coalesce((p_response->>'value')::boolean,false);
  elsif v_checkpoint.checkpoint_type='reflection' then
    v_satisfied:=nullif(btrim(coalesce(p_response->>'text','')),'') is not null;
  end if;

  v_score:=case when v_satisfied then 100 else 0 end;

  select coalesce(max(cr.attempt_number),0)+1
  into v_attempt
  from public.wf_micro_cert_checkpoint_responses cr
  where cr.assignment_id=v_assignment.assignment_id
    and cr.checkpoint_id=v_checkpoint.checkpoint_id;

  insert into public.wf_micro_cert_checkpoint_responses(
    checkpoint_response_id,assignment_id,micro_cert_version_id,
    checkpoint_id,attempt_number,response_json,is_correct,score,
    submitted_at,created_at
  ) values(
    v_response_id,
    v_assignment.assignment_id,
    v_assignment.micro_cert_version_id,
    v_checkpoint.checkpoint_id,
    v_attempt,
    p_response,
    v_satisfied,
    v_score,
    now(),now()
  );

  select mc.employer_id into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,institution_id,student_id,result,after_json,metadata
  ) values(
    (select auth.uid()),
    security.current_legacy_user_id(),
    'MICRO_CERT_CHECKPOINT_RESPONDED',
    'micro_cert_checkpoint_response',
    v_response_id,
    'workforce-student-employer-training',
    v_employer_id,
    v_assignment.institution_id,
    v_assignment.student_id,
    'success',
    jsonb_build_object(
      'assignmentId',v_assignment.assignment_id,
      'checkpointId',v_checkpoint.checkpoint_id,
      'attemptNumber',v_attempt,
      'satisfied',v_satisfied,
      'score',v_score
    ),
    jsonb_build_object('source','W11-07')
  );

  return jsonb_build_object(
    'checkpointResponseId',v_response_id,
    'checkpointId',v_checkpoint.checkpoint_id,
    'attemptNumber',v_attempt,
    'satisfied',v_satisfied,
    'score',v_score,
    'progress',security.student_employer_training_progress(v_assignment.assignment_id)
  );
end;
$$;

revoke all on function public.student_employer_training_checkpoint_submit(text,text,jsonb)
  from public,anon;
grant execute on function public.student_employer_training_checkpoint_submit(text,text,jsonb)
  to authenticated,service_role;

create or replace function public.student_employer_training_assessment(
  p_assignment_id text,
  p_assessment_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_assessment public.wf_employer_micro_cert_assessments%rowtype;
  v_attempt_id text;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  select * into v_assessment
  from public.wf_employer_micro_cert_assessments a
  where a.assessment_id=p_assessment_id
    and a.micro_cert_version_id=v_assignment.micro_cert_version_id;

  if not found then
    raise exception 'Assessment is outside the assigned course version';
  end if;

  select aa.assessment_attempt_id
  into v_attempt_id
  from public.wf_micro_cert_assessment_attempts aa
  where aa.assignment_id=v_assignment.assignment_id
    and aa.assessment_id=v_assessment.assessment_id
    and aa.status='in_progress'
  order by aa.attempt_number desc
  limit 1;

  return jsonb_build_object(
    'definition',jsonb_build_object(
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
        ) order by
          case when v_assessment.randomize_questions
            then md5(q.question_id||coalesce(v_attempt_id,v_assignment.assignment_id))
            else null end,
          case when not v_assessment.randomize_questions
            then q.sequence_no else null end,
          q.question_id
        )
        from public.wf_employer_micro_cert_assessment_questions q
        where q.assessment_id=v_assessment.assessment_id
      ),'[]'::jsonb)
    ),
    'eligibility',security.employer_learning_assessment_attempt_eligibility(
      v_assignment.assignment_id,v_assessment.assessment_id
    ),
    'currentAttempt',(
      select jsonb_build_object(
        'assessmentAttemptId',aa.assessment_attempt_id,
        'attemptNumber',aa.attempt_number,
        'status',aa.status,
        'score',aa.score,
        'startedAt',aa.started_at,
        'submittedAt',aa.submitted_at
      )
      from public.wf_micro_cert_assessment_attempts aa
      where aa.assignment_id=v_assignment.assignment_id
        and aa.assessment_id=v_assessment.assessment_id
        and aa.status='in_progress'
      order by aa.attempt_number desc
      limit 1
    ),
    'attempts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessmentAttemptId',aa.assessment_attempt_id,
        'attemptNumber',aa.attempt_number,
        'status',aa.status,
        'score',aa.score,
        'startedAt',aa.started_at,
        'submittedAt',aa.submitted_at
      ) order by aa.attempt_number desc)
      from public.wf_micro_cert_assessment_attempts aa
      where aa.assignment_id=v_assignment.assignment_id
        and aa.assessment_id=v_assessment.assessment_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.student_employer_training_assessment(text,text)
  from public,anon;
grant execute on function public.student_employer_training_assessment(text,text)
  to authenticated,service_role;

create or replace function public.student_employer_training_assessment_start(
  p_assignment_id text,
  p_assessment_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_assessment public.wf_employer_micro_cert_assessments%rowtype;
  v_eligibility jsonb;
  v_attempt_id text:=security.new_legacy_id('MAT');
  v_attempt_number integer;
  v_employer_id text;
begin
  v_assignment:=security.ensure_student_employer_training_started(p_assignment_id);

  select * into v_assessment
  from public.wf_employer_micro_cert_assessments a
  where a.assessment_id=p_assessment_id
    and a.micro_cert_version_id=v_assignment.micro_cert_version_id;
  if not found then
    raise exception 'Assessment is outside the assigned course version';
  end if;

  v_eligibility:=security.employer_learning_assessment_attempt_eligibility(
    v_assignment.assignment_id,v_assessment.assessment_id
  );

  if not coalesce((v_eligibility->>'allowed')::boolean,false) then
    if v_eligibility->>'reason'='attempt_in_progress' then
      return public.student_employer_training_assessment(
        v_assignment.assignment_id,v_assessment.assessment_id
      );
    end if;
    raise exception 'Assessment attempt not allowed: %',v_eligibility->>'reason';
  end if;

  v_attempt_number:=(v_eligibility->>'nextAttemptNumber')::integer;

  begin
    insert into public.wf_micro_cert_assessment_attempts(
      assessment_attempt_id,assignment_id,assessment_id,attempt_number,
      status,score,started_at,grading_method,metadata,created_at,updated_at
    ) values(
      v_attempt_id,
      v_assignment.assignment_id,
      v_assessment.assessment_id,
      v_attempt_number,
      'in_progress',
      null,
      now(),
      'automatic',
      jsonb_build_object('source','W11-07'),
      now(),now()
    );
  exception when unique_violation then
    return public.student_employer_training_assessment(
      v_assignment.assignment_id,v_assessment.assessment_id
    );
  end;

  select mc.employer_id into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,institution_id,student_id,result,after_json,metadata
  ) values(
    (select auth.uid()),
    security.current_legacy_user_id(),
    'MICRO_CERT_ASSESSMENT_STARTED',
    'micro_cert_assessment_attempt',
    v_attempt_id,
    'workforce-student-employer-training',
    v_employer_id,
    v_assignment.institution_id,
    v_assignment.student_id,
    'success',
    jsonb_build_object(
      'assignmentId',v_assignment.assignment_id,
      'assessmentId',v_assessment.assessment_id,
      'attemptNumber',v_attempt_number,
      'status','in_progress'
    ),
    jsonb_build_object('source','W11-07')
  );

  return public.student_employer_training_assessment(
    v_assignment.assignment_id,v_assessment.assessment_id
  );
end;
$$;

revoke all on function public.student_employer_training_assessment_start(text,text)
  from public,anon;
grant execute on function public.student_employer_training_assessment_start(text,text)
  to authenticated,service_role;

create or replace function public.student_employer_training_assessment_submit(
  p_assignment_id text,
  p_assessment_id text,
  p_assessment_attempt_id text,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_assessment public.wf_employer_micro_cert_assessments%rowtype;
  v_attempt public.wf_micro_cert_assessment_attempts%rowtype;
  v_score jsonb;
  v_item jsonb;
  v_result jsonb;
  v_question_id text;
  v_response jsonb;
  v_response_id text;
  v_status text;
  v_employer_id text;
  v_response_count integer;
  v_distinct_count integer;
begin
  v_assignment:=security.ensure_student_employer_training_started(p_assignment_id);

  select * into v_assessment
  from public.wf_employer_micro_cert_assessments a
  where a.assessment_id=p_assessment_id
    and a.micro_cert_version_id=v_assignment.micro_cert_version_id;
  if not found then
    raise exception 'Assessment is outside the assigned course version';
  end if;

  select * into v_attempt
  from public.wf_micro_cert_assessment_attempts aa
  where aa.assessment_attempt_id=p_assessment_attempt_id
    and aa.assignment_id=v_assignment.assignment_id
    and aa.assessment_id=v_assessment.assessment_id
  for update;
  if not found then raise exception 'Assessment attempt not found'; end if;
  if v_attempt.status<>'in_progress' then
    raise exception 'Assessment attempt is no longer in progress';
  end if;

  if p_responses is null or jsonb_typeof(p_responses)<>'array' then
    raise exception 'Assessment responses must be an array';
  end if;

  select
    jsonb_array_length(p_responses),
    count(distinct x->>'questionId')
  into v_response_count,v_distinct_count
  from jsonb_array_elements(p_responses) x;

  if v_response_count<>v_distinct_count then
    raise exception 'Assessment responses contain duplicate question IDs';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_responses) x
    where nullif(btrim(coalesce(x->>'questionId','')),'') is null
       or not exists(
         select 1
         from public.wf_employer_micro_cert_assessment_questions q
         where q.question_id=x->>'questionId'
           and q.assessment_id=v_assessment.assessment_id
       )
  ) then
    raise exception 'Assessment response contains a question outside this assessment';
  end if;

  v_score:=security.score_employer_learning_assessment(
    v_assessment.assessment_id,p_responses
  );

  if not coalesce((v_score->>'valid')::boolean,false) then
    raise exception 'Assessment submission is missing required responses';
  end if;

  for v_item in select * from jsonb_array_elements(p_responses)
  loop
    v_question_id:=v_item->>'questionId';
    v_response:=coalesce(v_item->'response','{}'::jsonb);

    select x into v_result
    from jsonb_array_elements(v_score->'results') x
    where x->>'questionId'=v_question_id
    limit 1;

    v_response_id:=security.new_legacy_id('MAR');

    insert into public.wf_micro_cert_assessment_responses(
      assessment_response_id,assessment_attempt_id,assessment_id,question_id,
      response,is_correct,score,answered_at,created_at
    ) values(
      v_response_id,
      v_attempt.assessment_attempt_id,
      v_assessment.assessment_id,
      v_question_id,
      v_response,
      case when v_result is null then null else (v_result->>'isCorrect')::boolean end,
      case when v_result is null then null else (v_result->>'score')::numeric end,
      now(),now()
    )
    on conflict(assessment_attempt_id,question_id) do update
      set response=excluded.response,
          is_correct=excluded.is_correct,
          score=excluded.score,
          answered_at=excluded.answered_at;
  end loop;

  v_status:=case
    when coalesce((v_score->>'passed')::boolean,false) then 'passed'
    else 'not_passed'
  end;

  update public.wf_micro_cert_assessment_attempts
  set status=v_status,
      score=(v_score->>'score')::numeric,
      submitted_at=now(),
      graded_at=now(),
      grading_method='automatic',
      updated_at=now()
  where assessment_attempt_id=v_attempt.assessment_attempt_id;

  select mc.employer_id into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    employer_id,institution_id,student_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),
    security.current_legacy_user_id(),
    'MICRO_CERT_ASSESSMENT_SUBMITTED',
    'micro_cert_assessment_attempt',
    v_attempt.assessment_attempt_id,
    'workforce-student-employer-training',
    v_employer_id,
    v_assignment.institution_id,
    v_assignment.student_id,
    'success',
    jsonb_build_object(
      'status',v_attempt.status,
      'score',v_attempt.score
    ),
    jsonb_build_object(
      'status',v_status,
      'score',(v_score->>'score')::numeric,
      'passed',(v_score->>'passed')::boolean
    ),
    jsonb_build_object(
      'source','W11-07',
      'assignmentId',v_assignment.assignment_id,
      'assessmentId',v_assessment.assessment_id,
      'attemptNumber',v_attempt.attempt_number
    )
  );

  return jsonb_build_object(
    'attempt',jsonb_build_object(
      'assessmentAttemptId',v_attempt.assessment_attempt_id,
      'attemptNumber',v_attempt.attempt_number,
      'status',v_status,
      'score',(v_score->>'score')::numeric
    ),
    'score',v_score,
    'eligibility',security.employer_learning_assessment_attempt_eligibility(
      v_assignment.assignment_id,v_assessment.assessment_id
    ),
    'progress',security.student_employer_training_progress(v_assignment.assignment_id)
  );
end;
$$;

revoke all on function public.student_employer_training_assessment_submit(
  text,text,text,jsonb
) from public,anon;
grant execute on function public.student_employer_training_assessment_submit(
  text,text,text,jsonb
) to authenticated,service_role;

create or replace function public.student_employer_training_media_authorization(
  p_assignment_id text,
  p_media_asset_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_asset public.wf_employer_learning_media_assets%rowtype;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  select * into v_asset
  from public.wf_employer_learning_media_assets m
  where m.media_asset_id=p_media_asset_id
    and m.status='ready'
    and exists(
      select 1
      from public.wf_employer_micro_cert_lessons l
      join public.wf_employer_micro_cert_lesson_blocks b
        on b.lesson_id=l.lesson_id
      where l.micro_cert_version_id=v_assignment.micro_cert_version_id
        and l.status in ('ready','published')
        and (
          b.content->>'mediaAssetId'=m.media_asset_id
          or b.content->>'posterMediaAssetId'=m.media_asset_id
          or b.content->>'captionsMediaAssetId'=m.media_asset_id
        )
    );

  if not found then
    raise exception 'Media is not available for this assigned course version';
  end if;

  return jsonb_build_object(
    'mediaAssetId',v_asset.media_asset_id,
    'bucketId',v_asset.bucket_id,
    'storagePath',v_asset.storage_path,
    'originalFilename',v_asset.original_filename,
    'displayName',v_asset.display_name,
    'mediaKind',v_asset.media_kind,
    'mimeType',v_asset.mime_type,
    'extension',v_asset.extension,
    'sizeBytes',v_asset.size_bytes
  );
end;
$$;

revoke all on function public.student_employer_training_media_authorization(text,text)
  from public,anon;
grant execute on function public.student_employer_training_media_authorization(text,text)
  to authenticated,service_role;

comment on table public.wf_micro_cert_lesson_progress is
  'W11-07 explainable per-assignment lesson interaction evidence. It does not own or infer final Micro-Certification completion.';
comment on function public.student_employer_training_assignment(text) is
  'Student-safe pinned-version Employer Training runtime. Assessment answer keys and Employer-private authoring data are intentionally omitted.';
comment on function public.student_employer_training_media_authorization(text,text) is
  'Authorizes one private media asset only when referenced by a lesson block in the authenticated Student own non-cancelled assignment pinned version.';
