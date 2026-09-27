
-- W11-08 — canonical Employer Training completion rules.
-- Completion is company-specific readiness evidence. It never creates or mutates
-- Instructor Verified Skill evidence, Company Badges, or Employer Certifications.

create or replace function security.employer_training_completion_evaluation(
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
  v_version public.wf_employer_micro_cert_versions%rowtype;
  v_requirement jsonb;
  v_checkpoint_mode text;
  v_checkpoint_min numeric;
  v_require_lessons boolean;
  v_require_assessments boolean;

  v_required_lessons integer:=0;
  v_completed_required_lessons integer:=0;
  v_required_lesson_ids jsonb:='[]'::jsonb;
  v_completed_required_lesson_ids jsonb:='[]'::jsonb;

  v_required_checkpoints integer:=0;
  v_satisfied_required_checkpoints integer:=0;
  v_required_checkpoint_ids jsonb:='[]'::jsonb;
  v_satisfied_required_checkpoint_ids jsonb:='[]'::jsonb;
  v_checkpoint_weight_total numeric:=0;
  v_checkpoint_weight_satisfied numeric:=0;
  v_checkpoint_percent numeric:=100;

  v_required_assessments integer:=0;
  v_passed_required_assessments integer:=0;
  v_exhausted_required_assessments integer:=0;
  v_in_progress_required_assessments integer:=0;
  v_required_assessment_ids jsonb:='[]'::jsonb;
  v_passed_required_assessment_ids jsonb:='[]'::jsonb;
  v_exhausted_required_assessment_ids jsonb:='[]'::jsonb;

  v_lesson_gate boolean;
  v_checkpoint_gate boolean;
  v_assessment_gate boolean;
  v_scope_gate boolean;
  v_status_gate boolean;
  v_eligible boolean;
  v_blocked_reasons jsonb:='[]'::jsonb;
  v_existing_completion_id text;
begin
  select *
  into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=p_assignment_id;

  if not found then
    raise exception 'Employer Training assignment not found';
  end if;

  select *
  into v_version
  from public.wf_employer_micro_cert_versions v
  where v.micro_cert_version_id=v_assignment.micro_cert_version_id
    and v.micro_cert_id=v_assignment.micro_cert_id;

  if not found then
    raise exception 'Assigned Employer Training version not found';
  end if;

  v_requirement:=case
    when coalesce(v_version.passing_requirement,'{}'::jsonb)='{}'::jsonb then
      jsonb_build_object(
        'completionRuleVersion',1,
        'checkpointMode','all_required',
        'minimumCheckpointPercent',100,
        'requireAllRequiredLessons',true,
        'requireAllRequiredAssessments',true
      )
    else security.normalize_micro_cert_passing_requirement(
      v_version.passing_requirement
    )
  end;

  v_checkpoint_mode:=v_requirement->>'checkpointMode';
  v_checkpoint_min:=(v_requirement->>'minimumCheckpointPercent')::numeric;
  v_require_lessons:=(v_requirement->>'requireAllRequiredLessons')::boolean;
  v_require_assessments:=(v_requirement->>'requireAllRequiredAssessments')::boolean;

  select
    count(*) filter(where x.required),
    count(*) filter(where x.required and x.completed_at is not null),
    coalesce(
      jsonb_agg(to_jsonb(x.lesson_id) order by x.sequence_no,x.lesson_id)
        filter(where x.required),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(x.lesson_id) order by x.sequence_no,x.lesson_id)
        filter(where x.required and x.completed_at is not null),
      '[]'::jsonb
    )
  into
    v_required_lessons,
    v_completed_required_lessons,
    v_required_lesson_ids,
    v_completed_required_lesson_ids
  from (
    select
      l.lesson_id,
      l.sequence_no,
      l.required,
      lp.completed_at
    from public.wf_employer_micro_cert_lessons l
    left join public.wf_micro_cert_lesson_progress lp
      on lp.assignment_id=v_assignment.assignment_id
     and lp.lesson_id=l.lesson_id
    where l.micro_cert_version_id=v_assignment.micro_cert_version_id
      and l.status in ('ready','published')
  ) x;

  select
    count(*) filter(where x.required),
    count(*) filter(where x.required and x.satisfied),
    coalesce(
      jsonb_agg(to_jsonb(x.checkpoint_id) order by x.sequence_no,x.checkpoint_id)
        filter(where x.required),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(x.checkpoint_id) order by x.sequence_no,x.checkpoint_id)
        filter(where x.required and x.satisfied),
      '[]'::jsonb
    ),
    coalesce(sum(x.weight) filter(where x.required),0),
    coalesce(sum(x.weight) filter(where x.required and x.satisfied),0)
  into
    v_required_checkpoints,
    v_satisfied_required_checkpoints,
    v_required_checkpoint_ids,
    v_satisfied_required_checkpoint_ids,
    v_checkpoint_weight_total,
    v_checkpoint_weight_satisfied
  from (
    select
      cp.checkpoint_id,
      cp.sequence_no,
      cp.required,
      cp.weight,
      exists(
        select 1
        from public.wf_micro_cert_checkpoint_responses cr
        where cr.assignment_id=v_assignment.assignment_id
          and cr.checkpoint_id=cp.checkpoint_id
          and coalesce(cr.score,0)>=100
      ) as satisfied
    from public.wf_employer_micro_cert_checkpoints cp
    where cp.micro_cert_version_id=v_assignment.micro_cert_version_id
  ) x;

  if v_required_checkpoints=0 then
    v_checkpoint_percent:=100;
  elsif v_checkpoint_weight_total>0 then
    v_checkpoint_percent:=round(
      (v_checkpoint_weight_satisfied/v_checkpoint_weight_total)*100,
      2
    );
  else
    v_checkpoint_percent:=round(
      (v_satisfied_required_checkpoints::numeric/
       v_required_checkpoints::numeric)*100,
      2
    );
  end if;

  select
    count(*),
    count(*) filter(where x.passed),
    count(*) filter(where x.exhausted),
    count(*) filter(where x.in_progress),
    coalesce(
      jsonb_agg(to_jsonb(x.assessment_id) order by x.sequence_no,x.assessment_id),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(x.assessment_id) order by x.sequence_no,x.assessment_id)
        filter(where x.passed),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(x.assessment_id) order by x.sequence_no,x.assessment_id)
        filter(where x.exhausted),
      '[]'::jsonb
    )
  into
    v_required_assessments,
    v_passed_required_assessments,
    v_exhausted_required_assessments,
    v_in_progress_required_assessments,
    v_required_assessment_ids,
    v_passed_required_assessment_ids,
    v_exhausted_required_assessment_ids
  from (
    select
      a.assessment_id,
      a.sequence_no,
      exists(
        select 1
        from public.wf_micro_cert_assessment_attempts aa
        where aa.assignment_id=v_assignment.assignment_id
          and aa.assessment_id=a.assessment_id
          and aa.status='passed'
      ) as passed,
      exists(
        select 1
        from public.wf_micro_cert_assessment_attempts aa
        where aa.assignment_id=v_assignment.assignment_id
          and aa.assessment_id=a.assessment_id
          and aa.status='in_progress'
      ) as in_progress,
      (
        a.max_attempts is not null
        and (
          select count(*)
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=a.assessment_id
            and aa.status in ('submitted','passed','not_passed')
        )>=a.max_attempts
        and not exists(
          select 1
          from public.wf_micro_cert_assessment_attempts aa
          where aa.assignment_id=v_assignment.assignment_id
            and aa.assessment_id=a.assessment_id
            and aa.status='passed'
        )
      ) as exhausted
    from public.wf_employer_micro_cert_assessments a
    where a.micro_cert_version_id=v_assignment.micro_cert_version_id
      and a.required=true
  ) x;

  v_lesson_gate:=
    not v_require_lessons
    or v_completed_required_lessons=v_required_lessons;

  v_checkpoint_gate:=case
    when v_checkpoint_mode='weighted_percent'
      then v_checkpoint_percent>=v_checkpoint_min
    else v_satisfied_required_checkpoints=v_required_checkpoints
  end;

  v_assessment_gate:=
    not v_require_assessments
    or v_passed_required_assessments=v_required_assessments;

  v_scope_gate:=v_assignment.institution_id is not null;
  v_status_gate:=v_assignment.status<>'cancelled';

  v_eligible:=
    v_lesson_gate
    and v_checkpoint_gate
    and v_assessment_gate
    and v_scope_gate
    and v_status_gate;

  if not v_status_gate then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('assignment_cancelled');
  end if;
  if not v_scope_gate then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('missing_institution_context');
  end if;
  if not v_lesson_gate then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('required_lessons_incomplete');
  end if;
  if not v_checkpoint_gate then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('checkpoint_requirement_not_met');
  end if;
  if not v_assessment_gate then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('required_assessments_not_passed');
  end if;
  if v_exhausted_required_assessments>0 then
    v_blocked_reasons:=v_blocked_reasons||jsonb_build_array('required_assessment_attempts_exhausted');
  end if;

  select c.completion_id
  into v_existing_completion_id
  from public.wf_micro_cert_completions c
  where c.assignment_id=v_assignment.assignment_id
    and c.outcome='passed'
  order by c.completed_at
  limit 1;

  return jsonb_build_object(
    'assignmentId',v_assignment.assignment_id,
    'assignmentStatus',v_assignment.status,
    'microCertId',v_assignment.micro_cert_id,
    'microCertVersionId',v_assignment.micro_cert_version_id,
    'versionNumber',v_version.version_number,
    'versionStatus',v_version.status,
    'rule',v_requirement,
    'lessons',jsonb_build_object(
      'gateEnabled',v_require_lessons,
      'requiredTotal',v_required_lessons,
      'requiredCompleted',v_completed_required_lessons,
      'requiredLessonIds',v_required_lesson_ids,
      'completedRequiredLessonIds',v_completed_required_lesson_ids,
      'passed',v_lesson_gate
    ),
    'checkpoints',jsonb_build_object(
      'mode',v_checkpoint_mode,
      'minimumPercent',v_checkpoint_min,
      'requiredTotal',v_required_checkpoints,
      'requiredSatisfied',v_satisfied_required_checkpoints,
      'weightTotal',v_checkpoint_weight_total,
      'weightSatisfied',v_checkpoint_weight_satisfied,
      'percent',v_checkpoint_percent,
      'requiredCheckpointIds',v_required_checkpoint_ids,
      'satisfiedRequiredCheckpointIds',v_satisfied_required_checkpoint_ids,
      'passed',v_checkpoint_gate
    ),
    'assessments',jsonb_build_object(
      'gateEnabled',v_require_assessments,
      'requiredTotal',v_required_assessments,
      'requiredPassed',v_passed_required_assessments,
      'requiredExhausted',v_exhausted_required_assessments,
      'requiredInProgress',v_in_progress_required_assessments,
      'requiredAssessmentIds',v_required_assessment_ids,
      'passedRequiredAssessmentIds',v_passed_required_assessment_ids,
      'exhaustedRequiredAssessmentIds',v_exhausted_required_assessment_ids,
      'passed',v_assessment_gate
    ),
    'eligibleForCompletion',v_eligible,
    'blockedReasons',v_blocked_reasons,
    'completionId',v_existing_completion_id,
    'outcome',case when v_existing_completion_id is null then null else 'passed' end,
    'technicalSkillVerified',false,
    'evidenceCategory','employer_training'
  );
end;
$$;

revoke all on function security.employer_training_completion_evaluation(text)
  from public,anon,authenticated;
grant execute on function security.employer_training_completion_evaluation(text)
  to service_role;

create or replace function security.finalize_employer_training_completion(
  p_assignment_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_employer_id text;
  v_evaluation jsonb;
  v_completion public.wf_micro_cert_completions%rowtype;
  v_completion_id text;
  v_attempt_number integer;
  v_before jsonb;
  v_after jsonb;
begin
  select *
  into v_assignment
  from public.wf_micro_cert_assignments a
  where a.assignment_id=p_assignment_id
  for update;

  if not found then
    raise exception 'Employer Training assignment not found';
  end if;

  select c.*
  into v_completion
  from public.wf_micro_cert_completions c
  where c.assignment_id=v_assignment.assignment_id
    and c.outcome='passed'
  order by c.completed_at
  limit 1;

  if found then
    if v_assignment.status<>'completed' then
      update public.wf_micro_cert_assignments
      set status='completed',
          completed_at=coalesce(completed_at,v_completion.completed_at),
          updated_at=now()
      where assignment_id=v_assignment.assignment_id;
    end if;

    return jsonb_build_object(
      'completed',true,
      'alreadyCompleted',true,
      'completion',jsonb_build_object(
        'completionId',v_completion.completion_id,
        'assignmentId',v_completion.assignment_id,
        'outcome',v_completion.outcome,
        'score',v_completion.score,
        'evidence',v_completion.evidence,
        'completedAt',v_completion.completed_at
      ),
      'evaluation',
        security.employer_training_completion_evaluation(v_assignment.assignment_id)
    );
  end if;

  v_evaluation:=
    security.employer_training_completion_evaluation(v_assignment.assignment_id);

  if not coalesce((v_evaluation->>'eligibleForCompletion')::boolean,false) then
    return jsonb_build_object(
      'completed',false,
      'alreadyCompleted',false,
      'completion',null,
      'evaluation',v_evaluation
    );
  end if;

  select mc.employer_id
  into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=v_assignment.micro_cert_id;

  if v_employer_id is null then
    raise exception 'Employer Training employer not found';
  end if;

  select coalesce(max(c.attempt_number),0)+1
  into v_attempt_number
  from public.wf_micro_cert_completions c
  where c.assignment_id=v_assignment.assignment_id;

  v_completion_id:=security.new_legacy_id('MCC');

  begin
    insert into public.wf_micro_cert_completions(
      completion_id,assignment_id,attempt_number,outcome,score,evidence,
      completed_at,created_at
    ) values(
      v_completion_id,
      v_assignment.assignment_id,
      v_attempt_number,
      'passed',
      null,
      v_evaluation || jsonb_build_object(
        'evidenceType','employer_training_completion',
        'recordedBy','W11-08',
        'recordedAt',now()
      ),
      now(),
      now()
    )
    returning * into v_completion;
  exception when unique_violation then
    select c.*
    into v_completion
    from public.wf_micro_cert_completions c
    where c.assignment_id=v_assignment.assignment_id
      and c.outcome='passed'
    order by c.completed_at
    limit 1;

    if not found then
      raise;
    end if;
  end;

  v_before:=jsonb_build_object(
    'status',v_assignment.status,
    'completedAt',v_assignment.completed_at
  );

  update public.wf_micro_cert_assignments
  set status='completed',
      started_at=coalesce(started_at,now()),
      completed_at=coalesce(completed_at,v_completion.completed_at),
      updated_at=now()
  where assignment_id=v_assignment.assignment_id
  returning * into v_assignment;

  v_after:=jsonb_build_object(
    'status',v_assignment.status,
    'completedAt',v_assignment.completed_at
  );

  perform security.emit_employer_learning_event(
    p_event_type=>'MICRO_CERT_COMPLETED',
    p_target_id=>v_completion.completion_id,
    p_event_key=>'micro-cert-completed:'||v_assignment.assignment_id,
    p_source=>'system',
    p_employer_id=>v_employer_id,
    p_institution_id=>v_assignment.institution_id,
    p_student_id=>v_assignment.student_id,
    p_actor_type=>'system',
    p_before=>v_before,
    p_after=>v_after,
    p_metadata=>jsonb_build_object(
      'completion_id',v_completion.completion_id,
      'assignment_id',v_assignment.assignment_id,
      'micro_cert_id',v_assignment.micro_cert_id,
      'micro_cert_version_id',v_assignment.micro_cert_version_id,
      'outcome','passed',
      'evidence_category','employer_training',
      'technical_skill_verified',false
    ),
    p_result=>'success'
  );

  return jsonb_build_object(
    'completed',true,
    'alreadyCompleted',false,
    'completion',jsonb_build_object(
      'completionId',v_completion.completion_id,
      'assignmentId',v_completion.assignment_id,
      'outcome',v_completion.outcome,
      'score',v_completion.score,
      'evidence',v_completion.evidence,
      'completedAt',v_completion.completed_at
    ),
    'evaluation',
      security.employer_training_completion_evaluation(v_assignment.assignment_id)
  );
end;
$$;

revoke all on function security.finalize_employer_training_completion(text)
  from public,anon,authenticated;
grant execute on function security.finalize_employer_training_completion(text)
  to service_role;

create or replace function security.evaluate_employer_training_completion_from_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform security.finalize_employer_training_completion(new.assignment_id);
  return null;
end;
$$;

revoke all on function security.evaluate_employer_training_completion_from_evidence()
  from public,anon,authenticated;
grant execute on function security.evaluate_employer_training_completion_from_evidence()
  to service_role;

drop trigger if exists trg_wf_lesson_progress_completion_eval
  on public.wf_micro_cert_lesson_progress;
create constraint trigger trg_wf_lesson_progress_completion_eval
after insert or update
on public.wf_micro_cert_lesson_progress
deferrable initially deferred
for each row
when (new.completed_at is not null)
execute function security.evaluate_employer_training_completion_from_evidence();

drop trigger if exists trg_wf_checkpoint_response_completion_eval
  on public.wf_micro_cert_checkpoint_responses;
create constraint trigger trg_wf_checkpoint_response_completion_eval
after insert or update
on public.wf_micro_cert_checkpoint_responses
deferrable initially deferred
for each row
when (coalesce(new.score,0)>=100)
execute function security.evaluate_employer_training_completion_from_evidence();

drop trigger if exists trg_wf_assessment_attempt_completion_eval
  on public.wf_micro_cert_assessment_attempts;
create constraint trigger trg_wf_assessment_attempt_completion_eval
after insert or update
on public.wf_micro_cert_assessment_attempts
deferrable initially deferred
for each row
when (new.status='passed')
execute function security.evaluate_employer_training_completion_from_evidence();

create or replace function public.student_employer_training_completion_status(
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
  v_completion public.wf_micro_cert_completions%rowtype;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);

  select c.*
  into v_completion
  from public.wf_micro_cert_completions c
  where c.assignment_id=v_assignment.assignment_id
    and c.outcome='passed'
  order by c.completed_at
  limit 1;

  return jsonb_build_object(
    'completion',case
      when v_completion.completion_id is null then null
      else jsonb_build_object(
        'completionId',v_completion.completion_id,
        'assignmentId',v_completion.assignment_id,
        'outcome',v_completion.outcome,
        'score',v_completion.score,
        'evidence',v_completion.evidence,
        'completedAt',v_completion.completed_at
      )
    end,
    'evaluation',
      security.employer_training_completion_evaluation(v_assignment.assignment_id)
  );
end;
$$;

revoke all on function public.student_employer_training_completion_status(text)
  from public,anon;
grant execute on function public.student_employer_training_completion_status(text)
  to authenticated,service_role;

create or replace function public.student_employer_training_completion_evaluate(
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

  if v_assignment.status='cancelled' then
    raise exception 'Employer Training assignment is cancelled';
  end if;

  return security.finalize_employer_training_completion(
    v_assignment.assignment_id
  );
end;
$$;

revoke all on function public.student_employer_training_completion_evaluate(text)
  from public,anon;
grant execute on function public.student_employer_training_completion_evaluate(text)
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
    perform security.finalize_employer_training_completion(p_assignment_id);
  end if;

  return public.student_employer_training_assignment(p_assignment_id);
end;
$$;

revoke all on function public.student_employer_training_start(text)
  from public,anon;
grant execute on function public.student_employer_training_start(text)
  to authenticated,service_role;

comment on function security.employer_training_completion_evaluation(text) is
  'W11-08 canonical, pinned-version Employer Training completion evaluator. It uses required lessons, configured checkpoint rules, and required assessment pass state. It never mutates Instructor Verified Skills.';
comment on function security.finalize_employer_training_completion(text) is
  'W11-08 idempotent completion finalizer. Creates passed Micro-Certification completion evidence, transitions assignment to completed, and emits MICRO_CERT_COMPLETED exactly once. Company Badge and Employer Certification issuance remain downstream tasks.';
comment on function public.student_employer_training_completion_status(text) is
  'Student-safe completion status for the authenticated Student own assignment. No assessment answer keys or Employer-private authoring data are returned.';
