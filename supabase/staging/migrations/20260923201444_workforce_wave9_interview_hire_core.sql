create table if not exists public.wf_interview_requests (
  id uuid primary key default gen_random_uuid(),
  interview_request_id text not null unique default security.new_legacy_id('INT'),
  student_id text not null,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  created_by_user_id text,
  referral_id text,
  hiring_need_id text,
  trade_id text,
  role_title text not null,
  message text,
  scheduling_url text,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','declined','scheduling','scheduled','completed','cancelled','expired','no_response')),
  response_note text,
  sent_at timestamptz,
  responded_at timestamptz,
  scheduled_for timestamptz,
  interview_format text,
  location_detail text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_interview_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_id text not null unique default security.new_legacy_id('IEV'),
  interview_request_id text not null references public.wf_interview_requests(interview_request_id) on delete cascade,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  interviewer_user_id text,
  next_step text not null default 'not_set'
    check (next_step in ('not_set','continue','hold','close','prepare_hire')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(interview_request_id)
);

create table if not exists public.wf_placements (
  id uuid primary key default gen_random_uuid(),
  placement_id text not null unique default security.new_legacy_id('PLC'),
  student_id text not null,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  referral_id text,
  interview_request_id text references public.wf_interview_requests(interview_request_id),
  hiring_need_id text,
  created_by_user_id text,
  role_title text not null,
  trade_id text,
  hire_date date not null,
  employment_type text,
  status text not null default 'pending_start'
    check (status in ('pending_start','active','ended','unknown')),
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_retention_milestones (
  id uuid primary key default gen_random_uuid(),
  milestone_id text not null unique default security.new_legacy_id('RTM'),
  placement_id text not null references public.wf_placements(placement_id) on delete cascade,
  day_number integer not null check (day_number in (30,60,90)),
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','due','sending','sent','responded','skipped','failed','cancelled')),
  sent_at timestamptz,
  response_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(placement_id, day_number)
);

create table if not exists public.wf_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null unique default security.new_legacy_id('NTF'),
  recipient_user_id text not null,
  event_type text not null,
  target_type text not null,
  target_id text,
  channel text not null default 'in_app',
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','failed','read','dismissed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_interviews_employer_status_idx
  on public.wf_interview_requests(employer_id,status,updated_at desc);
create index if not exists wf_interviews_student_status_idx
  on public.wf_interview_requests(student_id,status,updated_at desc);
create index if not exists wf_interviews_referral_idx
  on public.wf_interview_requests(referral_id) where referral_id is not null;
create index if not exists wf_interviews_hiring_need_idx
  on public.wf_interview_requests(hiring_need_id) where hiring_need_id is not null;
create index if not exists wf_placements_employer_status_idx
  on public.wf_placements(employer_id,status,hire_date desc);
create index if not exists wf_placements_student_status_idx
  on public.wf_placements(student_id,status,hire_date desc);
create unique index if not exists wf_placements_active_unique
  on public.wf_placements(employer_id,student_id)
  where status in ('pending_start','active');
create index if not exists wf_retention_due_idx
  on public.wf_retention_milestones(status,scheduled_for);
create index if not exists wf_notifications_recipient_idx
  on public.wf_notifications(recipient_user_id,status,created_at desc);

create or replace function security.current_student_id()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select s.student_id
  from public.wf_student_profiles s
  where s.user_id=security.current_legacy_user_id()
  order by s.created_at nulls last,s.student_id
  limit 1;
$$;

create or replace function security.student_owns(p_student_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or p_student_id=security.current_student_id(),
    false
  );
$$;

create or replace function security.can_manage_interview(
  p_employer_id text,
  p_hiring_need_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.has_employer_role(
      p_employer_id,
      array['employer_owner','employer_admin','recruiter']
    )
    or (
      p_hiring_need_id is not null
      and security.has_employer_role(p_employer_id,array['hiring_manager'])
      and security.hiring_manager_can_use_need(p_employer_id,p_hiring_need_id)
    ),
    false
  );
$$;

create or replace function public.employer_request_interview(
  p_employer_id text,
  p_student_id text,
  p_hiring_need_id text default null,
  p_referral_id text default null,
  p_role_title text default null,
  p_trade_id text default null,
  p_message text default null,
  p_scheduling_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student public.wf_student_profiles%rowtype;
  v_referral public.wf_referrals%rowtype;
  v_need public.wf_hiring_needs%rowtype;
  v_interview_id text;
  v_existing text;
  v_student_user_id text;
  v_role_title text;
  v_trade_id text;
  v_institution_id text;
begin
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,p_hiring_need_id) then
    raise exception 'Approved Employer interview permission required';
  end if;

  select * into v_student
  from public.wf_student_profiles
  where student_id=p_student_id;
  if not found then raise exception 'Student not found'; end if;

  if p_hiring_need_id is not null then
    select * into v_need
    from public.wf_hiring_needs
    where employer_id=p_employer_id and hiring_need_id=p_hiring_need_id;
    if not found then raise exception 'Hiring Need not found'; end if;
  end if;

  if p_referral_id is not null then
    select * into v_referral
    from public.wf_referrals
    where referral_id=p_referral_id
      and employer_id=p_employer_id
      and student_id=p_student_id
      and status not in ('hired','closed','expired');
    if not found then raise exception 'Referral is not available for interview'; end if;
    v_institution_id:=v_referral.institution_id;
  else
    if coalesce(
      nullif(lower(v_student.discoverability_status),''),
      lower(coalesce(v_student.profile_visibility,'private'))
    ) not in ('employer_discoverable','employer','public','network') then
      raise exception 'Student is not Employer-discoverable';
    end if;

    if not exists(
      select 1 from public.wf_employer_talent_scopes ts
      where ts.employer_id=p_employer_id
        and ts.active=true
        and (ts.starts_at is null or ts.starts_at<=now())
        and (ts.ends_at is null or ts.ends_at>now())
        and (ts.institution_id is null or ts.institution_id=v_student.school_id)
        and (ts.cohort_id is null or ts.cohort_id=v_student.cohort_id)
        and (ts.trade_id is null or ts.trade_id=v_student.primary_trade_id)
    ) then
      raise exception 'Student is outside Employer Talent scope';
    end if;
    v_institution_id:=v_student.school_id;
  end if;

  select i.interview_request_id into v_existing
  from public.wf_interview_requests i
  where i.employer_id=p_employer_id
    and i.student_id=p_student_id
    and coalesce(i.hiring_need_id,'')=coalesce(p_hiring_need_id,'')
    and coalesce(i.referral_id,'')=coalesce(p_referral_id,'')
    and i.status in ('draft','sent','accepted','scheduling','scheduled','completed')
  order by i.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'interviewRequestId',v_existing,
      'status',(select status from public.wf_interview_requests where interview_request_id=v_existing),
      'created',false
    );
  end if;

  v_interview_id:=security.new_legacy_id('INT');
  v_role_title:=coalesce(nullif(btrim(coalesce(p_role_title,'')),''),v_need.title,'Interview');
  v_trade_id:=coalesce(nullif(btrim(coalesce(p_trade_id,'')),''),v_need.trade_id,v_student.primary_trade_id);

  insert into public.wf_interview_requests(
    interview_request_id,student_id,employer_id,created_by_user_id,referral_id,hiring_need_id,
    trade_id,role_title,message,scheduling_url,status,sent_at
  ) values(
    v_interview_id,p_student_id,p_employer_id,security.current_legacy_user_id(),p_referral_id,p_hiring_need_id,
    v_trade_id,v_role_title,nullif(btrim(coalesce(p_message,'')),''),nullif(btrim(coalesce(p_scheduling_url,'')),''),
    'sent',now()
  );

  if p_referral_id is not null then
    update public.wf_referrals
    set status='interview_requested',updated_at=now()
    where referral_id=p_referral_id
      and status in ('referred','delivered','viewed','interview_declined');
  end if;

  select user_id into v_student_user_id
  from public.wf_student_profiles
  where student_id=p_student_id;

  if v_student_user_id is not null then
    insert into public.wf_notifications(
      recipient_user_id,event_type,target_type,target_id,channel,status,payload
    ) values(
      v_student_user_id,'INTERVIEW_REQUESTED','interview',v_interview_id,'in_app','queued',
      jsonb_build_object('employerId',p_employer_id,'roleTitle',v_role_title)
    );
  end if;

  perform security.emit_workforce_event(
    'INTERVIEW_REQUESTED','interview',v_interview_id,p_employer_id,v_institution_id,p_student_id,
    null,
    jsonb_build_object(
      'status','sent','referralId',p_referral_id,'hiringNeedId',p_hiring_need_id,'roleTitle',v_role_title
    ),
    jsonb_build_object('source','employer_request_interview'),
    'success',
    'interview_requested:'||v_interview_id,
    null
  );

  return jsonb_build_object('interviewRequestId',v_interview_id,'status','sent','created',true);
end;
$$;

create or replace function public.student_respond_interview(
  p_interview_request_id text,
  p_response text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_interview public.wf_interview_requests%rowtype;
  v_response text:=lower(btrim(coalesce(p_response,'')));
  v_referral_status text;
  v_institution_id text;
begin
  if v_response not in ('accepted','declined','scheduling') then
    raise exception 'Invalid interview response';
  end if;

  select * into v_interview
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id
  for update;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.student_owns(v_interview.student_id) then
    raise exception 'Student interview access required';
  end if;
  if v_interview.status not in ('sent','no_response') then
    raise exception 'Interview request is not awaiting a Student response';
  end if;

  update public.wf_interview_requests
  set status=v_response,
      response_note=nullif(btrim(coalesce(p_note,'')),''),
      responded_at=now(),
      updated_at=now()
  where interview_request_id=p_interview_request_id
  returning * into v_interview;

  if v_interview.referral_id is not null then
    v_referral_status:=case when v_response='declined' then 'interview_declined' else 'interview_accepted' end;
    update public.wf_referrals
    set status=v_referral_status,updated_at=now()
    where referral_id=v_interview.referral_id
      and status not in ('hired','closed','expired');
    select institution_id into v_institution_id
    from public.wf_referrals
    where referral_id=v_interview.referral_id;
  else
    select school_id into v_institution_id
    from public.wf_student_profiles
    where student_id=v_interview.student_id;
  end if;

  if v_interview.created_by_user_id is not null then
    insert into public.wf_notifications(
      recipient_user_id,event_type,target_type,target_id,channel,status,payload
    ) values(
      v_interview.created_by_user_id,'INTERVIEW_RESPONDED','interview',v_interview.interview_request_id,
      'in_app','queued',
      jsonb_build_object('response',v_response,'studentId',v_interview.student_id)
    );
  end if;

  perform security.emit_workforce_event(
    'INTERVIEW_RESPONDED','interview',v_interview.interview_request_id,
    v_interview.employer_id,v_institution_id,v_interview.student_id,
    jsonb_build_object('status','sent'),
    jsonb_build_object('status',v_response,'respondedAt',v_interview.responded_at),
    jsonb_build_object('source','student_respond_interview'),
    'success',
    'interview_responded:'||v_interview.interview_request_id,
    null
  );

  return jsonb_build_object(
    'interviewRequestId',v_interview.interview_request_id,
    'status',v_interview.status,
    'respondedAt',v_interview.responded_at
  );
end;
$$;

create or replace function public.employer_schedule_interview(
  p_employer_id text,
  p_interview_request_id text,
  p_scheduled_for timestamptz,
  p_format text,
  p_location_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_interview public.wf_interview_requests%rowtype;
begin
  select * into v_interview
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id
    and employer_id=p_employer_id
  for update;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,v_interview.hiring_need_id) then
    raise exception 'Employer interview permission required';
  end if;
  if v_interview.status not in ('accepted','scheduling','scheduled') then
    raise exception 'Interview is not ready for scheduling';
  end if;
  if p_scheduled_for is null then raise exception 'Interview date/time is required'; end if;

  update public.wf_interview_requests
  set status='scheduled',
      scheduled_for=p_scheduled_for,
      interview_format=left(nullif(btrim(coalesce(p_format,'')),''),80),
      location_detail=left(nullif(btrim(coalesce(p_location_detail,'')),''),500),
      updated_at=now()
  where interview_request_id=p_interview_request_id
  returning * into v_interview;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,employer_id,student_id,
    result,before_json,after_json,source
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),'INTERVIEW_SCHEDULED','interview',
    v_interview.interview_request_id,p_employer_id,v_interview.student_id,'success',
    null,
    jsonb_build_object('status','scheduled','scheduledFor',v_interview.scheduled_for,'format',v_interview.interview_format),
    'workforce-interview'
  );

  return jsonb_build_object(
    'interviewRequestId',v_interview.interview_request_id,
    'status',v_interview.status,
    'scheduledFor',v_interview.scheduled_for,
    'format',v_interview.interview_format
  );
end;
$$;

create or replace function public.employer_complete_interview(
  p_employer_id text,
  p_interview_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_interview public.wf_interview_requests%rowtype;
begin
  select * into v_interview
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id
    and employer_id=p_employer_id
  for update;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,v_interview.hiring_need_id) then
    raise exception 'Employer interview permission required';
  end if;
  if v_interview.status<>'scheduled' then
    raise exception 'Only scheduled interviews can be completed';
  end if;

  update public.wf_interview_requests
  set status='completed',completed_at=now(),updated_at=now()
  where interview_request_id=p_interview_request_id
  returning * into v_interview;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,employer_id,student_id,
    result,after_json,source
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),'INTERVIEW_COMPLETED','interview',
    v_interview.interview_request_id,p_employer_id,v_interview.student_id,'success',
    jsonb_build_object('status','completed','completedAt',v_interview.completed_at),
    'workforce-interview'
  );

  return jsonb_build_object(
    'interviewRequestId',v_interview.interview_request_id,
    'status',v_interview.status,
    'completedAt',v_interview.completed_at
  );
end;
$$;

create or replace function public.employer_save_interview_evaluation(
  p_employer_id text,
  p_interview_request_id text,
  p_next_step text,
  p_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_interview public.wf_interview_requests%rowtype;
  v_eval public.wf_interview_evaluations%rowtype;
  v_next text:=lower(btrim(coalesce(p_next_step,'not_set')));
begin
  if v_next not in ('not_set','continue','hold','close','prepare_hire') then
    raise exception 'Invalid evaluation next step';
  end if;

  select * into v_interview
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id
    and employer_id=p_employer_id;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,v_interview.hiring_need_id) then
    raise exception 'Employer evaluation permission required';
  end if;

  insert into public.wf_interview_evaluations(
    interview_request_id,employer_id,interviewer_user_id,next_step,summary
  ) values(
    p_interview_request_id,p_employer_id,security.current_legacy_user_id(),v_next,
    left(nullif(btrim(coalesce(p_summary,'')),''),4000)
  )
  on conflict (interview_request_id) do update
  set interviewer_user_id=security.current_legacy_user_id(),
      next_step=excluded.next_step,
      summary=excluded.summary,
      updated_at=now()
  returning * into v_eval;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,employer_id,student_id,
    result,after_json,source
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),'INTERVIEW_EVALUATION_SAVED',
    'interview_evaluation',v_eval.evaluation_id,p_employer_id,v_interview.student_id,'success',
    jsonb_build_object('interviewRequestId',p_interview_request_id,'nextStep',v_eval.next_step),
    'workforce-interview'
  );

  return jsonb_build_object(
    'evaluationId',v_eval.evaluation_id,
    'interviewRequestId',v_eval.interview_request_id,
    'nextStep',v_eval.next_step,
    'summary',v_eval.summary,
    'updatedAt',v_eval.updated_at
  );
end;
$$;

create or replace function public.employer_record_hire(
  p_employer_id text,
  p_interview_request_id text,
  p_role_title text,
  p_trade_id text,
  p_hire_date date,
  p_employment_type text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_interview public.wf_interview_requests%rowtype;
  v_placement public.wf_placements%rowtype;
  v_status text;
  v_institution_id text;
  v_student_user_id text;
  v_day integer;
begin
  select * into v_interview
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id
    and employer_id=p_employer_id
  for update;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,v_interview.hiring_need_id) then
    raise exception 'Employer hire permission required';
  end if;
  if v_interview.status<>'completed' then
    raise exception 'Complete the interview before recording a hire';
  end if;
  if p_hire_date is null then raise exception 'Hire/start date is required'; end if;
  if nullif(btrim(coalesce(p_role_title,'')),'') is null then
    raise exception 'Role title is required';
  end if;

  select * into v_placement
  from public.wf_placements
  where employer_id=p_employer_id
    and student_id=v_interview.student_id
    and status in ('pending_start','active')
  order by created_at desc
  limit 1;

  if found then
    for v_day in select unnest(array[30,60,90]) loop
      insert into public.wf_retention_milestones(
        placement_id,day_number,scheduled_for,status
      ) values(
        v_placement.placement_id,
        v_day,
        (v_placement.hire_date::timestamptz + make_interval(days=>v_day)),
        'pending'
      )
      on conflict (placement_id,day_number) do nothing;
    end loop;
    return jsonb_build_object(
      'placementId',v_placement.placement_id,
      'status',v_placement.status,
      'created',false
    );
  end if;

  v_status:=case when p_hire_date>current_date then 'pending_start' else 'active' end;

  insert into public.wf_placements(
    student_id,employer_id,referral_id,interview_request_id,hiring_need_id,created_by_user_id,
    role_title,trade_id,hire_date,employment_type,status,started_at
  ) values(
    v_interview.student_id,p_employer_id,v_interview.referral_id,v_interview.interview_request_id,
    v_interview.hiring_need_id,security.current_legacy_user_id(),
    left(btrim(p_role_title),200),left(nullif(btrim(coalesce(p_trade_id,'')),''),120),
    p_hire_date,left(nullif(btrim(coalesce(p_employment_type,'')),''),120),v_status,
    case when v_status='active' then now() else null end
  )
  returning * into v_placement;

  for v_day in select unnest(array[30,60,90]) loop
    insert into public.wf_retention_milestones(
      placement_id,day_number,scheduled_for,status
    ) values(
      v_placement.placement_id,
      v_day,
      (p_hire_date::timestamptz + make_interval(days=>v_day)),
      'pending'
    );
  end loop;

  if v_interview.referral_id is not null then
    update public.wf_referrals
    set status='hired',updated_at=now()
    where referral_id=v_interview.referral_id
      and status not in ('closed','expired');
    select institution_id into v_institution_id
    from public.wf_referrals
    where referral_id=v_interview.referral_id;
  else
    select school_id into v_institution_id
    from public.wf_student_profiles
    where student_id=v_interview.student_id;
  end if;

  select user_id into v_student_user_id
  from public.wf_student_profiles
  where student_id=v_interview.student_id;

  if v_student_user_id is not null then
    insert into public.wf_notifications(
      recipient_user_id,event_type,target_type,target_id,channel,status,payload
    ) values(
      v_student_user_id,'PLACEMENT_CREATED','placement',v_placement.placement_id,'in_app','queued',
      jsonb_build_object('employerId',p_employer_id,'roleTitle',v_placement.role_title,'hireDate',v_placement.hire_date)
    );
  end if;

  perform security.emit_workforce_event(
    'PLACEMENT_CREATED','placement',v_placement.placement_id,p_employer_id,v_institution_id,v_interview.student_id,
    null,
    jsonb_build_object(
      'status',v_placement.status,'hireDate',v_placement.hire_date,
      'interviewRequestId',v_interview.interview_request_id,'referralId',v_interview.referral_id
    ),
    jsonb_build_object('source','employer_record_hire','milestones',jsonb_build_array(30,60,90)),
    'success',
    'placement_created:'||v_placement.placement_id,
    null
  );

  return jsonb_build_object(
    'placementId',v_placement.placement_id,
    'status',v_placement.status,
    'created',true
  );
end;
$$;

create or replace function public.employer_update_placement_status(
  p_employer_id text,
  p_placement_id text,
  p_status text,
  p_end_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_placement public.wf_placements%rowtype;
  v_new text:=lower(btrim(coalesce(p_status,'')));
begin
  if v_new not in ('active','ended') then
    raise exception 'Placement status may only be changed to active or ended';
  end if;

  select * into v_placement
  from public.wf_placements
  where placement_id=p_placement_id and employer_id=p_employer_id
  for update;

  if not found then raise exception 'Placement not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.can_manage_interview(p_employer_id,v_placement.hiring_need_id) then
    raise exception 'Employer placement permission required';
  end if;
  if v_new='active' and v_placement.status<>'pending_start' then
    raise exception 'Only pending-start placements can be activated';
  end if;
  if v_new='ended' and v_placement.status not in ('pending_start','active') then
    raise exception 'Placement is not active';
  end if;

  update public.wf_placements
  set status=v_new,
      started_at=case when v_new='active' then coalesce(started_at,now()) else started_at end,
      ended_at=case when v_new='ended' then now() else ended_at end,
      end_reason=case when v_new='ended' then left(nullif(btrim(coalesce(p_end_reason,'')),''),500) else end_reason end,
      updated_at=now()
  where placement_id=p_placement_id
  returning * into v_placement;

  if v_new='ended' then
    update public.wf_retention_milestones
    set status='cancelled',updated_at=now()
    where placement_id=p_placement_id
      and status in ('pending','due','sending');
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,employer_id,student_id,
    result,after_json,source
  ) values(
    (select auth.uid()),security.current_legacy_user_id(),'PLACEMENT_STATUS_CHANGED','placement',
    v_placement.placement_id,p_employer_id,v_placement.student_id,'success',
    jsonb_build_object('status',v_placement.status),
    'workforce-placement'
  );

  return jsonb_build_object(
    'placementId',v_placement.placement_id,
    'status',v_placement.status,
    'startedAt',v_placement.started_at,
    'endedAt',v_placement.ended_at
  );
end;
$$;

create or replace function public.employer_interviews_list(
  p_employer_id text,
  p_queue text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_hm_only boolean:=security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']);
begin
  if not security.employer_is_approved(p_employer_id)
     or not security.member_of_employer(p_employer_id) then
    raise exception 'Approved Employer interview access required';
  end if;

  select coalesce(jsonb_agg(x order by x->>'updatedAt' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'interviewRequestId',i.interview_request_id,
      'studentId',i.student_id,
      'studentName',concat_ws(' ',
        coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
        nullif(s.last_initial_public,'')
      ),
      'institutionName',ins.name,
      'program',coalesce(c.program_name,s.program_type),
      'hiringNeedId',i.hiring_need_id,
      'hiringNeedTitle',h.title,
      'referralId',i.referral_id,
      'roleTitle',i.role_title,
      'tradeId',i.trade_id,
      'message',i.message,
      'schedulingUrl',i.scheduling_url,
      'status',i.status,
      'sentAt',i.sent_at,
      'respondedAt',i.responded_at,
      'scheduledFor',i.scheduled_for,
      'interviewFormat',i.interview_format,
      'locationDetail',i.location_detail,
      'completedAt',i.completed_at,
      'evaluationNextStep',e.next_step,
      'placementId',p.placement_id,
      'placementStatus',p.status,
      'updatedAt',i.updated_at
    ) x
    from public.wf_interview_requests i
    join public.wf_student_profiles s on s.student_id=i.student_id
    left join public.wf_institutions ins on ins.institution_id=s.school_id
    left join public.wf_cohorts c on c.cohort_id=s.cohort_id
    left join public.wf_hiring_needs h on h.hiring_need_id=i.hiring_need_id
    left join public.wf_interview_evaluations e on e.interview_request_id=i.interview_request_id
    left join public.wf_placements p on p.interview_request_id=i.interview_request_id
    where i.employer_id=p_employer_id
      and (
        not v_hm_only
        or (i.hiring_need_id is not null and security.hiring_manager_can_use_need(p_employer_id,i.hiring_need_id))
      )
      and (
        p_queue is null or p_queue='' or p_queue='all'
        or (p_queue='needs_response' and i.status in ('sent','no_response'))
        or (p_queue='scheduling' and i.status in ('accepted','scheduling'))
        or (p_queue='scheduled' and i.status='scheduled')
        or (p_queue='decision' and i.status='completed' and p.placement_id is null)
        or (p_queue='closed' and i.status in ('declined','cancelled','expired'))
      )
  ) q;

  return v_result;
end;
$$;

create or replace function public.employer_interview_detail(
  p_employer_id text,
  p_interview_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_need_id text;
begin
  select hiring_need_id into v_need_id
  from public.wf_interview_requests
  where interview_request_id=p_interview_request_id and employer_id=p_employer_id;

  if not found then raise exception 'Interview request not found'; end if;
  if not security.employer_is_approved(p_employer_id)
     or not security.member_of_employer(p_employer_id)
     or (
       security.has_employer_role(p_employer_id,array['hiring_manager'])
       and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
       and (v_need_id is null or not security.hiring_manager_can_use_need(p_employer_id,v_need_id))
     ) then
    raise exception 'Employer interview access required';
  end if;

  select jsonb_build_object(
    'interviewRequestId',i.interview_request_id,
    'studentId',i.student_id,
    'studentName',concat_ws(' ',
      coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
      nullif(s.last_initial_public,'')
    ),
    'institutionName',ins.name,
    'program',coalesce(c.program_name,s.program_type),
    'hiringNeedId',i.hiring_need_id,
    'hiringNeedTitle',h.title,
    'referralId',i.referral_id,
    'referralStatus',r.status,
    'roleTitle',i.role_title,
    'tradeId',i.trade_id,
    'message',i.message,
    'schedulingUrl',i.scheduling_url,
    'status',i.status,
    'responseNote',i.response_note,
    'sentAt',i.sent_at,
    'respondedAt',i.responded_at,
    'scheduledFor',i.scheduled_for,
    'interviewFormat',i.interview_format,
    'locationDetail',i.location_detail,
    'completedAt',i.completed_at,
    'evaluation',case when e.evaluation_id is null then null else jsonb_build_object(
      'evaluationId',e.evaluation_id,
      'interviewerUserId',e.interviewer_user_id,
      'nextStep',e.next_step,
      'summary',e.summary,
      'updatedAt',e.updated_at
    ) end,
    'placement',case when p.placement_id is null then null else jsonb_build_object(
      'placementId',p.placement_id,
      'status',p.status,
      'roleTitle',p.role_title,
      'tradeId',p.trade_id,
      'hireDate',p.hire_date,
      'employmentType',p.employment_type
    ) end,
    'updatedAt',i.updated_at
  )
  into v_result
  from public.wf_interview_requests i
  join public.wf_student_profiles s on s.student_id=i.student_id
  left join public.wf_institutions ins on ins.institution_id=s.school_id
  left join public.wf_cohorts c on c.cohort_id=s.cohort_id
  left join public.wf_hiring_needs h on h.hiring_need_id=i.hiring_need_id
  left join public.wf_referrals r on r.referral_id=i.referral_id
  left join public.wf_interview_evaluations e on e.interview_request_id=i.interview_request_id
  left join public.wf_placements p on p.interview_request_id=i.interview_request_id
  where i.interview_request_id=p_interview_request_id and i.employer_id=p_employer_id;

  return v_result;
end;
$$;

create or replace function public.student_interviews_list()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student_id text:=security.current_student_id();
  v_result jsonb;
begin
  if v_student_id is null then raise exception 'Student membership required'; end if;

  select coalesce(jsonb_agg(x order by x->>'updatedAt' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'interviewRequestId',i.interview_request_id,
      'employerId',i.employer_id,
      'employerName',co.business_name,
      'roleTitle',i.role_title,
      'tradeId',i.trade_id,
      'message',i.message,
      'schedulingUrl',i.scheduling_url,
      'status',i.status,
      'sentAt',i.sent_at,
      'respondedAt',i.responded_at,
      'scheduledFor',i.scheduled_for,
      'interviewFormat',i.interview_format,
      'locationDetail',i.location_detail,
      'placementId',p.placement_id,
      'placementStatus',p.status,
      'hireDate',p.hire_date,
      'updatedAt',i.updated_at
    ) x
    from public.wf_interview_requests i
    join public.contractors co on co.contractor_id=i.employer_id
    left join public.wf_placements p on p.interview_request_id=i.interview_request_id
    where i.student_id=v_student_id
  ) q;

  return v_result;
end;
$$;

create or replace function public.employer_placements_list(
  p_employer_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_hm_only boolean:=security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']);
begin
  if not security.employer_is_approved(p_employer_id)
     or not security.member_of_employer(p_employer_id) then
    raise exception 'Approved Employer placement access required';
  end if;

  select coalesce(jsonb_agg(x order by x->>'hireDate' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'placementId',p.placement_id,
      'studentId',p.student_id,
      'studentName',concat_ws(' ',
        coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
        nullif(s.last_initial_public,'')
      ),
      'interviewRequestId',p.interview_request_id,
      'referralId',p.referral_id,
      'hiringNeedId',p.hiring_need_id,
      'hiringNeedTitle',h.title,
      'roleTitle',p.role_title,
      'tradeId',p.trade_id,
      'hireDate',p.hire_date,
      'employmentType',p.employment_type,
      'status',p.status,
      'startedAt',p.started_at,
      'endedAt',p.ended_at,
      'milestoneCount',(select count(*) from public.wf_retention_milestones m where m.placement_id=p.placement_id)
    ) x
    from public.wf_placements p
    join public.wf_student_profiles s on s.student_id=p.student_id
    left join public.wf_hiring_needs h on h.hiring_need_id=p.hiring_need_id
    where p.employer_id=p_employer_id
      and (
        not v_hm_only
        or (p.hiring_need_id is not null and security.hiring_manager_can_use_need(p_employer_id,p.hiring_need_id))
      )
  ) q;

  return v_result;
end;
$$;

create or replace function public.employer_placement_detail(
  p_employer_id text,
  p_placement_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_need_id text;
begin
  select hiring_need_id into v_need_id
  from public.wf_placements
  where placement_id=p_placement_id and employer_id=p_employer_id;
  if not found then raise exception 'Placement not found'; end if;

  if not security.employer_is_approved(p_employer_id)
     or not security.member_of_employer(p_employer_id)
     or (
       security.has_employer_role(p_employer_id,array['hiring_manager'])
       and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
       and (v_need_id is null or not security.hiring_manager_can_use_need(p_employer_id,v_need_id))
     ) then
    raise exception 'Employer placement access required';
  end if;

  select jsonb_build_object(
    'placementId',p.placement_id,
    'studentId',p.student_id,
    'studentName',concat_ws(' ',
      coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
      nullif(s.last_initial_public,'')
    ),
    'interviewRequestId',p.interview_request_id,
    'referralId',p.referral_id,
    'hiringNeedId',p.hiring_need_id,
    'hiringNeedTitle',h.title,
    'roleTitle',p.role_title,
    'tradeId',p.trade_id,
    'hireDate',p.hire_date,
    'employmentType',p.employment_type,
    'status',p.status,
    'startedAt',p.started_at,
    'endedAt',p.ended_at,
    'endReason',p.end_reason,
    'milestones',coalesce((
      select jsonb_agg(jsonb_build_object(
        'milestoneId',m.milestone_id,
        'dayNumber',m.day_number,
        'scheduledFor',m.scheduled_for,
        'status',m.status,
        'sentAt',m.sent_at,
        'responseReceivedAt',m.response_received_at
      ) order by m.day_number)
      from public.wf_retention_milestones m
      where m.placement_id=p.placement_id
    ),'[]'::jsonb)
  )
  into v_result
  from public.wf_placements p
  join public.wf_student_profiles s on s.student_id=p.student_id
  left join public.wf_hiring_needs h on h.hiring_need_id=p.hiring_need_id
  where p.placement_id=p_placement_id and p.employer_id=p_employer_id;

  return v_result;
end;
$$;

create or replace function public.student_placements_list()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student_id text:=security.current_student_id();
  v_result jsonb;
begin
  if v_student_id is null then raise exception 'Student membership required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placementId',p.placement_id,
    'employerName',c.business_name,
    'roleTitle',p.role_title,
    'tradeId',p.trade_id,
    'hireDate',p.hire_date,
    'employmentType',p.employment_type,
    'status',p.status
  ) order by p.hire_date desc),'[]'::jsonb)
  into v_result
  from public.wf_placements p
  join public.contractors c on c.contractor_id=p.employer_id
  where p.student_id=v_student_id;

  return v_result;
end;
$$;

alter table public.wf_interview_requests enable row level security;
alter table public.wf_interview_evaluations enable row level security;
alter table public.wf_placements enable row level security;
alter table public.wf_retention_milestones enable row level security;
alter table public.wf_notifications enable row level security;

drop policy if exists wave9_student_profile_self_read on public.wf_student_profiles;
create policy wave9_student_profile_self_read on public.wf_student_profiles
for select to authenticated
using (
  user_id=security.current_legacy_user_id()
  or security.is_admin()
);

drop policy if exists wave9_notifications_self_read on public.wf_notifications;
create policy wave9_notifications_self_read on public.wf_notifications
for select to authenticated
using (
  recipient_user_id=security.current_legacy_user_id()
  or security.is_admin()
);

revoke all on function security.current_student_id() from public,anon;
revoke all on function security.student_owns(text) from public,anon;
revoke all on function security.can_manage_interview(text,text) from public,anon;
grant execute on function security.current_student_id() to authenticated,service_role;
grant execute on function security.student_owns(text) to authenticated,service_role;
grant execute on function security.can_manage_interview(text,text) to authenticated,service_role;

revoke all on function public.employer_request_interview(text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.student_respond_interview(text,text,text) from public,anon;
revoke all on function public.employer_schedule_interview(text,text,timestamptz,text,text) from public,anon;
revoke all on function public.employer_complete_interview(text,text) from public,anon;
revoke all on function public.employer_save_interview_evaluation(text,text,text,text) from public,anon;
revoke all on function public.employer_record_hire(text,text,text,text,date,text) from public,anon;
revoke all on function public.employer_update_placement_status(text,text,text,text) from public,anon;
revoke all on function public.employer_interviews_list(text,text) from public,anon;
revoke all on function public.employer_interview_detail(text,text) from public,anon;
revoke all on function public.student_interviews_list() from public,anon;
revoke all on function public.employer_placements_list(text) from public,anon;
revoke all on function public.employer_placement_detail(text,text) from public,anon;
revoke all on function public.student_placements_list() from public,anon;

grant execute on function public.employer_request_interview(text,text,text,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.student_respond_interview(text,text,text) to authenticated,service_role;
grant execute on function public.employer_schedule_interview(text,text,timestamptz,text,text) to authenticated,service_role;
grant execute on function public.employer_complete_interview(text,text) to authenticated,service_role;
grant execute on function public.employer_save_interview_evaluation(text,text,text,text) to authenticated,service_role;
grant execute on function public.employer_record_hire(text,text,text,text,date,text) to authenticated,service_role;
grant execute on function public.employer_update_placement_status(text,text,text,text) to authenticated,service_role;
grant execute on function public.employer_interviews_list(text,text) to authenticated,service_role;
grant execute on function public.employer_interview_detail(text,text) to authenticated,service_role;
grant execute on function public.student_interviews_list() to authenticated,service_role;
grant execute on function public.employer_placements_list(text) to authenticated,service_role;
grant execute on function public.employer_placement_detail(text,text) to authenticated,service_role;
grant execute on function public.student_placements_list() to authenticated,service_role;
