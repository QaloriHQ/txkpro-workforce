-- W11-05A hardening: validate assessment JSON-shape constraints and
-- centralize deterministic max-attempt eligibility for downstream runtime use.

alter table public.wf_employer_micro_cert_assessments
  validate constraint wf_employer_micro_cert_assessments_config_object_check;

alter table public.wf_employer_micro_cert_assessment_questions
  validate constraint wf_employer_micro_cert_assessment_questions_options_array_check;

alter table public.wf_employer_micro_cert_assessment_questions
  validate constraint wf_employer_micro_cert_assessment_questions_answer_key_object_check;

create or replace function security.employer_learning_assessment_attempt_eligibility(
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
  v_attempts_used integer:=0;
  v_next_attempt integer:=1;
  v_in_progress boolean:=false;
  v_already_passed boolean:=false;
  v_allowed boolean:=false;
  v_reason text;
begin
  select * into v_assignment
  from public.wf_micro_cert_assignments
  where assignment_id=p_assignment_id;
  if not found then raise exception 'Micro-Certification assignment not found'; end if;

  select * into v_assessment
  from public.wf_employer_micro_cert_assessments
  where assessment_id=p_assessment_id;
  if not found then raise exception 'Assessment not found'; end if;

  if v_assignment.micro_cert_version_id<>v_assessment.micro_cert_version_id then
    raise exception 'Assessment is outside the assigned course version';
  end if;

  select
    count(*) filter (where status<>'voided'),
    coalesce(max(attempt_number),0)+1,
    bool_or(status='in_progress'),
    bool_or(status='passed')
  into v_attempts_used,v_next_attempt,v_in_progress,v_already_passed
  from public.wf_micro_cert_assessment_attempts
  where assignment_id=p_assignment_id
    and assessment_id=p_assessment_id;

  v_in_progress:=coalesce(v_in_progress,false);
  v_already_passed:=coalesce(v_already_passed,false);

  if v_already_passed then
    v_allowed:=false;
    v_reason:='already_passed';
  elsif v_in_progress then
    v_allowed:=false;
    v_reason:='attempt_in_progress';
  elsif v_assessment.max_attempts is not null
        and v_attempts_used>=v_assessment.max_attempts then
    v_allowed:=false;
    v_reason:='maximum_attempts_reached';
  else
    v_allowed:=true;
    v_reason:='eligible';
  end if;

  return jsonb_build_object(
    'assignmentId',v_assignment.assignment_id,
    'assessmentId',v_assessment.assessment_id,
    'microCertVersionId',v_assessment.micro_cert_version_id,
    'allowed',v_allowed,
    'reason',v_reason,
    'attemptsUsed',v_attempts_used,
    'maxAttempts',v_assessment.max_attempts,
    'nextAttemptNumber',v_next_attempt,
    'alreadyPassed',v_already_passed,
    'attemptInProgress',v_in_progress
  );
end;
$$;

revoke all on function security.employer_learning_assessment_attempt_eligibility(text,text)
  from public,anon,authenticated;
grant execute on function security.employer_learning_assessment_attempt_eligibility(text,text)
  to service_role;
