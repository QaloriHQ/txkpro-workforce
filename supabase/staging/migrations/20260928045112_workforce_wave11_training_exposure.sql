-- W11-14: observable Employer Training engagement only; no inferred hiring intent.
insert into public.wf_employer_learning_event_contracts (
  event_type,contract_version,source_basis,target_type,allowed_sources,
  requires_employer_id,requires_institution_id,requires_student_id,requires_before_after,
  required_metadata_keys,cross_app_consequences,description,active
) values (
  'EMPLOYER_TRAINING_COMPLETED',1,'source-derived','employer_exposure_event',
  array['system'],true,true,true,false,
  array['exposure_event_id','assignment_id','micro_cert_id','completion_id','event_type','source_type'],
  '["Employer Exposure","Employer Learning Analytics","Audit"]'::jsonb,
  'Observed passed Employer Training completion, derived from canonical completion evidence; no inferred employment intent.',
  true
)
on conflict(event_type) do update set
  contract_version=excluded.contract_version,
  source_basis=excluded.source_basis,
  target_type=excluded.target_type,
  allowed_sources=excluded.allowed_sources,
  requires_employer_id=excluded.requires_employer_id,
  requires_institution_id=excluded.requires_institution_id,
  requires_student_id=excluded.requires_student_id,
  requires_before_after=excluded.requires_before_after,
  required_metadata_keys=excluded.required_metadata_keys,
  cross_app_consequences=excluded.cross_app_consequences,
  description=excluded.description,
  active=true,
  updated_at=now();

create or replace function security.record_employer_training_completion_exposure_backfill(p_completion_id text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_completion public.wf_micro_cert_completions%rowtype;
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_employer_id text;
  v_exposure_event_id text;
  v_key text;
begin
  select * into v_completion from public.wf_micro_cert_completions
  where completion_id=p_completion_id and outcome='passed';
  if not found then return; end if;
  select * into v_assignment from public.wf_micro_cert_assignments
    where assignment_id=v_completion.assignment_id;
  select employer_id into v_employer_id from public.wf_employer_micro_certs
    where micro_cert_id=v_assignment.micro_cert_id;
  if v_assignment.institution_id is null or v_employer_id is null then
    raise exception 'Canonical completion exposure requires Employer and Institution scope';
  end if;
  v_key:='employer-training-completed:'||v_completion.completion_id;
  insert into public.wf_employer_exposure_events (
    event_key,student_id,employer_id,institution_id,event_type,source_type,
    source_id,micro_cert_id,assignment_id,occurred_at,metadata
  ) values (
    v_key,v_assignment.student_id,v_employer_id,v_assignment.institution_id,
    'EMPLOYER_TRAINING_COMPLETED','completion',v_completion.completion_id,
    v_assignment.micro_cert_id,v_assignment.assignment_id,v_completion.completed_at,
    jsonb_build_object('microCertVersionId',v_assignment.micro_cert_version_id,
                       'completionId',v_completion.completion_id,'outcome','passed',
                       'observedEngagement',true)
  )
  on conflict(event_key) do nothing;
  select exposure_event_id into v_exposure_event_id
  from public.wf_employer_exposure_events where event_key=v_key;
  perform security.emit_employer_learning_event(
    p_event_type=>'EMPLOYER_TRAINING_COMPLETED',
    p_target_id=>v_exposure_event_id,p_event_key=>v_key,
    p_source=>'system',p_employer_id=>v_employer_id,
    p_institution_id=>v_assignment.institution_id,p_student_id=>v_assignment.student_id,
    p_actor_type=>'system',
    p_after=>jsonb_build_object('outcome','passed','completedAt',v_completion.completed_at),
    p_metadata=>jsonb_build_object(
      'exposure_event_id',v_exposure_event_id,'assignment_id',v_assignment.assignment_id,
      'micro_cert_id',v_assignment.micro_cert_id,'completion_id',v_completion.completion_id,
      'event_type','EMPLOYER_TRAINING_COMPLETED','source_type','completion',
      'micro_cert_version_id',v_assignment.micro_cert_version_id,
      'observed_engagement',true
    ),p_result=>'success'
  );
end;
$$;
revoke all on function security.record_employer_training_completion_exposure_backfill(text) from public,anon,authenticated;

create or replace function security.record_employer_training_completion_exposure()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform security.record_employer_training_completion_exposure_backfill(new.completion_id);
  return new;
end;
$$;
revoke all on function security.record_employer_training_completion_exposure() from public,anon,authenticated;
drop trigger if exists wf_training_completion_exposure on public.wf_micro_cert_completions;
create trigger wf_training_completion_exposure
after insert on public.wf_micro_cert_completions
for each row when (new.outcome='passed')
execute function security.record_employer_training_completion_exposure();

create or replace function public.student_employer_training_preview(p_assignment_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_assignment public.wf_micro_cert_assignments%rowtype;
  v_employer_id text;
  v_key text;
  v_exposure_event_id text;
  v_inserted boolean:=false;
begin
  v_assignment:=security.student_learning_assignment_row(p_assignment_id);
  if v_assignment.status <> 'assigned' then
    return jsonb_build_object('recorded',false);
  end if;
  select employer_id into v_employer_id from public.wf_employer_micro_certs
    where micro_cert_id=v_assignment.micro_cert_id;
  if v_employer_id is null or v_assignment.institution_id is null then
    raise exception 'Assigned training requires Employer and Institution scope';
  end if;
  -- Once per assignment per UTC day: preserves repeat engagement without
  -- counting client retries, tab remounts, or Next.js server prefetches.
  v_key:='employer-training-preview:'||v_assignment.assignment_id||':'||
    to_char(now() at time zone 'UTC','YYYY-MM-DD');
  insert into public.wf_employer_exposure_events (
    event_key,student_id,employer_id,institution_id,event_type,source_type,
    source_id,micro_cert_id,assignment_id,metadata
  ) values (
    v_key,v_assignment.student_id,v_employer_id,v_assignment.institution_id,
    'EMPLOYER_TRAINING_PREVIEWED','assignment',v_assignment.assignment_id,
    v_assignment.micro_cert_id,v_assignment.assignment_id,
    jsonb_build_object('microCertVersionId',v_assignment.micro_cert_version_id,
                       'observedEngagement',true)
  )
  on conflict(event_key) do nothing
  returning exposure_event_id into v_exposure_event_id;
  v_inserted:=found;
  if not v_inserted then
    select exposure_event_id into v_exposure_event_id
    from public.wf_employer_exposure_events where event_key=v_key;
  end if;
  perform security.emit_employer_learning_event(
    p_event_type=>'EMPLOYER_TRAINING_PREVIEWED',
    p_target_id=>v_exposure_event_id,p_event_key=>v_key,
    p_source=>'student',p_employer_id=>v_employer_id,
    p_institution_id=>v_assignment.institution_id,p_student_id=>v_assignment.student_id,
    p_actor_type=>'user',
    p_after=>jsonb_build_object('status',v_assignment.status),
    p_metadata=>jsonb_build_object(
      'exposure_event_id',v_exposure_event_id,'micro_cert_id',v_assignment.micro_cert_id,
      'assignment_id',v_assignment.assignment_id,
      'event_type','EMPLOYER_TRAINING_PREVIEWED','source_type','assignment',
      'micro_cert_version_id',v_assignment.micro_cert_version_id,
      'observed_engagement',true
    ),p_result=>'success'
  );
  return jsonb_build_object('recorded',v_inserted,'exposureEventId',v_exposure_event_id);
end;
$$;
revoke all on function public.student_employer_training_preview(text) from public,anon,authenticated;
grant execute on function public.student_employer_training_preview(text) to authenticated,service_role;

create or replace function public.student_employer_training_exposure()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_student_id text;
begin
  if (select auth.uid()) is null then raise exception 'Student membership required'; end if;
  select p.student_id into v_student_id
  from public.wf_student_profiles p
  join public.users u on u.user_id=p.user_id
  where u.auth_user_id=(select auth.uid())
  limit 1;
  if v_student_id is null then raise exception 'Student membership required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'exposureEventId',x.exposure_event_id,'eventType',x.event_type,
      'employerName',x.employer_name,'courseTitle',x.course_title,
      'occurredAt',x.occurred_at
    ) order by x.occurred_at desc)
    from (
      select e.exposure_event_id,e.event_type,e.occurred_at,
             c.business_name as employer_name,mc.title as course_title
      from public.wf_employer_exposure_events e
      join public.contractors c on c.contractor_id=e.employer_id
      left join public.wf_employer_micro_certs mc on mc.micro_cert_id=e.micro_cert_id
      where e.student_id=v_student_id
        and e.event_type in ('EMPLOYER_TRAINING_PREVIEWED','EMPLOYER_TRAINING_STARTED',
                             'EMPLOYER_TRAINING_COMPLETED')
      order by e.occurred_at desc
      limit 30
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.student_employer_training_exposure() from public,anon,authenticated;
grant execute on function public.student_employer_training_exposure() to authenticated,service_role;

-- Reconcile existing canonical passed completions without changing assignment
-- state or creating new completion evidence.
do $$
declare v_completion public.wf_micro_cert_completions%rowtype;
begin
  for v_completion in
    select * from public.wf_micro_cert_completions where outcome='passed'
  loop
    perform security.record_employer_training_completion_exposure_backfill(v_completion.completion_id);
  end loop;
end;
$$;
