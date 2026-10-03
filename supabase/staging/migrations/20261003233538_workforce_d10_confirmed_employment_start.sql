-- D-10 approved 2026-10-03. Existing rows are not retrospectively confirmed.
alter table public.wf_placements
  add column employment_start_date date,
  add column start_confirmed_at timestamptz,
  add column start_confirmed_by_auth_user_id uuid,
  add constraint wf_placements_start_confirmation_check check (
    (employment_start_date is null and start_confirmed_at is null and start_confirmed_by_auth_user_id is null)
    or (employment_start_date is not null and start_confirmed_at is not null
      and start_confirmed_by_auth_user_id is not null and status in ('active','ended')
      and employment_start_date <= (start_confirmed_at at time zone 'UTC')::date)
  );
comment on column public.wf_placements.hire_date is 'Scheduled start date; never proves employment started.';
comment on column public.wf_placements.start_confirmed_at is 'Explicit authorized employment-start confirmation. Required for official placement metrics, including ended employment.';

create function security.placement_can_confirm_start(p_actor uuid,p_placement_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor=auth.uid() and exists(select 1 from public.users u where u.auth_user_id=p_actor and lower(u.status)='active')
 and (security.retention_platform_admin(p_actor) or exists(
   select 1 from public.wf_placements p
   where p.placement_id=p_placement_id and p_actor=auth.uid()
     and security.employer_is_approved(p.employer_id)
     and security.can_manage_interview(p.employer_id,p.hiring_need_id)
 ) or exists(
   select 1 from public.wf_placements p
   join public.wf_student_profiles s on s.student_id=p.student_id
   join public.app_role_memberships r on r.auth_user_id=p_actor
   where p.placement_id=p_placement_id and lower(r.status)='active'
     and security.canonical_institution_role(r.role) in
       ('institution_super_admin','institution_admin','career_services','program_coordinator')
     and security.institution_role_scope_valid(r.role,r.scope_type)
     and case when lower(r.scope_type)='institution'
       then security.retention_membership_matches(r.id,s.school_id,null)
       else s.cohort_id is not null and security.retention_membership_matches(r.id,s.school_id,s.cohort_id) end
 ));
$$;
revoke all on function security.placement_can_confirm_start(uuid,text) from public,anon;
grant execute on function security.placement_can_confirm_start(uuid,text) to authenticated;

create function public.placement_confirm_start(p_placement_id text,p_start_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.wf_placements%rowtype; v_actor uuid:=auth.uid();
begin
 if v_actor is null or not security.placement_can_confirm_start(v_actor,p_placement_id) then
   raise exception 'Placement unavailable in your authorized scope.' using errcode='42501'; end if;
 select * into v from public.wf_placements where placement_id=p_placement_id for update;
 if not found then raise exception 'Placement unavailable in your authorized scope.' using errcode='42501'; end if;
 if p_start_date is null or p_start_date > (now() at time zone 'UTC')::date then
   raise exception 'Confirm an actual employment start date on or before today.' using errcode='22023'; end if;
 if v.start_confirmed_at is not null then
   if v.employment_start_date<>p_start_date then
     raise exception 'Employment start is already confirmed with a different date.' using errcode='22023'; end if;
   return jsonb_build_object('placementId',v.placement_id,'status',v.status,'idempotent',true,
     'employmentStartDate',v.employment_start_date,'startConfirmedAt',v.start_confirmed_at);
 end if;
 if v.status not in ('pending_start','active','ended') or
   (v.status='ended' and (v.ended_at is null or p_start_date>(v.ended_at at time zone 'UTC')::date)) then
   raise exception 'This placement cannot be confirmed as started.' using errcode='22023'; end if;
 update public.wf_placements set
   status=case when v.status='ended' then 'ended' else 'active' end,
   employment_start_date=p_start_date,start_confirmed_at=now(),start_confirmed_by_auth_user_id=v_actor,
   started_at=coalesce(started_at,now()),updated_at=now()
 where placement_id=p_placement_id;
 -- Reanchor only unsent templates. Delivered/responded history is never rewritten.
 update public.wf_retention_milestones m set
   scheduled_for=(p_start_date::timestamp at time zone 'UTC')+make_interval(days=>m.day_number),updated_at=now()
 where m.placement_id=p_placement_id and m.status in ('pending','due')
   and not exists(select 1 from public.wf_retention_messages msg where msg.milestone_id=m.milestone_id);
 insert into public.platform_audit_events(action,actor_auth_user_id,actor_user_id,entity_type,entity_id,
   employer_id,student_id,before_json,after_json,metadata,result,source)
 values('PLACEMENT_STATUS_CHANGED',v_actor,security.current_legacy_user_id(),'placement',p_placement_id,
   v.employer_id,v.student_id,jsonb_build_object('status',v.status),
   jsonb_build_object('status',case when v.status='ended' then 'ended' else 'active' end,
     'employmentStartDate',p_start_date,'startConfirmedAt',now(),'startConfirmedByAuthUserId',v_actor),
   jsonb_build_object('decision','D-10'),'success','placement_confirm_start');
 return jsonb_build_object('placementId',p_placement_id,'status',case when v.status='ended' then 'ended' else 'active' end,
   'employmentStartDate',p_start_date,'startConfirmedAt',now(),'idempotent',false);
end; $$;
revoke all on function public.placement_confirm_start(text,date) from public,anon;
grant execute on function public.placement_confirm_start(text,date) to authenticated;

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

  v_status:='pending_start';

  insert into public.wf_placements(
    student_id,employer_id,referral_id,interview_request_id,hiring_need_id,created_by_user_id,
    role_title,trade_id,hire_date,employment_type,status,started_at
  ) values(
    v_interview.student_id,p_employer_id,v_interview.referral_id,v_interview.interview_request_id,
    v_interview.hiring_need_id,security.current_legacy_user_id(),
    left(btrim(p_role_title),200),left(nullif(btrim(coalesce(p_trade_id,'')),''),120),
    p_hire_date,left(nullif(btrim(coalesce(p_employment_type,'')),''),120),v_status,
    null
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
  if v_new='active' then
    return public.placement_confirm_start(p_placement_id,v_placement.hire_date);
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
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
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
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
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
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
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

create or replace function public.institution_student_directory(
  p_institution_id text,
  p_query text default null,
  p_program_name text default null,
  p_cohort_id text default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text:=lower(nullif(btrim(coalesce(p_query,'')),''));
  v_status text:=lower(nullif(btrim(coalesce(p_status,'')),''));
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution membership required';
  end if;

  return coalesce((
    with roster as (
      select
        'student'::text as record_type,
        s.student_id,
        null::text as membership_key,
        s.user_id,
        arm.auth_user_id,
        coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          nullif(btrim(concat_ws(' ',
            nullif(coalesce(s.first_name_public,''),''),
            nullif(coalesce(s.last_initial_public,''),'')
          )),''),
          s.student_id
        ) as display_name,
        u.email,
        u.phone,
        coalesce(arm.status,'accepted') as invitation_status,
        arm.source as invitation_source,
        arm.created_at as invited_at,
        case when lower(coalesce(arm.status,''))='active' then arm.updated_at end as accepted_at,
        s.profile_status,
        s.availability_status,
        coalesce(c.program_name,s.program_type) as program_name,
        s.cohort_id,
        coalesce(c.name,c.term,s.cohort_id) as cohort_name,
        coalesce(c.trade_id,s.primary_trade_id) as trade_id,
        coalesce(s.graduation_date,c.graduation_date) as graduation_date,
        s.created_at,
        s.updated_at
      from public.wf_student_profiles s
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      left join public.users u on u.user_id=s.user_id
      left join lateral (
        select r.*
        from public.app_role_memberships r
        where lower(r.role)='student'
          and r.user_id=s.user_id
          and lower(r.status)='active'
          and security.institution_can_view_student_invitation(
            p_institution_id,
            lower(r.scope_type),
            r.scope_id
          )
        order by r.updated_at desc nulls last,r.created_at desc nulls last
        limit 1
      ) arm on true
      where security.institution_student_accessible(p_institution_id,s.student_id)
    ),
    invitations as (
      select
        'invitation'::text as record_type,
        s.student_id,
        r.membership_key,
        r.user_id,
        r.auth_user_id,
        coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          u.email,
          r.user_id,
          r.membership_key
        ) as display_name,
        u.email,
        u.phone,
        r.status as invitation_status,
        r.source as invitation_source,
        r.created_at as invited_at,
        null::timestamptz as accepted_at,
        s.profile_status,
        s.availability_status,
        coalesce(c.program_name,s.program_type) as program_name,
        coalesce(s.cohort_id,case when lower(r.scope_type)='cohort' then r.scope_id end) as cohort_id,
        coalesce(c.name,c.term,s.cohort_id,case when lower(r.scope_type)='cohort' then r.scope_id end) as cohort_name,
        coalesce(c.trade_id,s.primary_trade_id) as trade_id,
        coalesce(s.graduation_date,c.graduation_date) as graduation_date,
        r.created_at,
        r.updated_at
      from public.app_role_memberships r
      left join public.users u on u.user_id=r.user_id
      left join public.wf_student_profiles s
        on s.user_id=r.user_id
       and security.institution_student_accessible(
         p_institution_id,
         s.student_id
       )
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where lower(r.role)='student'
        and lower(r.status) in ('pending','invited')
        and security.institution_can_view_student_invitation(
          p_institution_id,
          lower(r.scope_type),
          r.scope_id
        )
    ),
    scoped as (
      select * from roster
      union all
      select * from invitations
    ),
    filtered as (
      select *
      from scoped d
      where (p_program_name is null or d.program_name=p_program_name)
        and (p_cohort_id is null or d.cohort_id=p_cohort_id)
        and (
          v_status is null
          or lower(coalesce(d.invitation_status,''))=v_status
          or lower(coalesce(d.profile_status,''))=v_status
          or d.record_type=v_status
        )
        and (
          v_query is null
          or lower(coalesce(d.display_name,'')) like '%' || v_query || '%'
          or lower(coalesce(d.email,'')) like '%' || v_query || '%'
          or lower(coalesce(d.program_name,'')) like '%' || v_query || '%'
          or lower(coalesce(d.cohort_name,'')) like '%' || v_query || '%'
        )
    )
    select jsonb_agg(jsonb_build_object(
      'recordType',d.record_type,
      'studentId',d.student_id,
      'membershipKey',d.membership_key,
      'userId',d.user_id,
      'authUserId',d.auth_user_id,
      'displayName',d.display_name,
      'email',d.email,
      'phone',d.phone,
      'invitationStatus',d.invitation_status,
      'invitationSource',d.invitation_source,
      'invitedAt',d.invited_at,
      'acceptedAt',d.accepted_at,
      'profileStatus',d.profile_status,
      'availabilityStatus',d.availability_status,
      'programName',d.program_name,
      'cohortId',d.cohort_id,
      'cohortName',d.cohort_name,
      'tradeId',d.trade_id,
      'graduationDate',d.graduation_date,
      'verifiedSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id and ss.status='verified'
      ) end,
      'selfAttestedSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id
          and ss.status='self_attested'
          and ss.provenance='self_attested'
      ) end,
      'inProgressSkillCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=d.student_id
          and ss.status in ('in_progress','ready_for_review','needs_practice')
      ) end,
      'employerTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id
      ) end,
      'completedTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id and a.status='completed'
      ) end,
      'activeTrainingCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_micro_cert_assignments a
        where a.student_id=d.student_id and a.status in ('assigned','in_progress')
      ) end,
      'companyBadgeCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_company_badge_awards a
        where a.student_id=d.student_id
          and a.revoked_at is null
          and (a.expires_at is null or a.expires_at>now())
      ) end,
      'referralCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_referrals r
        where r.institution_id=p_institution_id and r.student_id=d.student_id
      ) end,
      'activeInterviewCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_interview_requests i
        where i.student_id=d.student_id
          and i.status in ('sent','accepted','scheduling','scheduled')
      ) end,
      'placementCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_placements p
        where p.student_id=d.student_id and p.start_confirmed_at is not null
      ) end,
      'activePlacementCount',case when d.student_id is null then 0 else (
        select count(*) from public.wf_placements p
        where p.student_id=d.student_id and p.status='active' and p.start_confirmed_at is not null
      ) end,
      'retentionMilestoneDueCount',case when d.student_id is null then 0 else (
        select count(*)
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        where p.student_id=d.student_id
          and m.status in ('pending','due','failed')
      ) end,
      'openRetentionCaseCount',case when d.student_id is null then 0 else (
        select count(*)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        where p.student_id=d.student_id
          and rc.status in ('open','assigned','contacted','monitoring')
      ) end,
      'lastActivityAt',greatest(
        d.updated_at,
        coalesce((select max(a.updated_at) from public.wf_micro_cert_assignments a where a.student_id=d.student_id),d.updated_at),
        coalesce((select max(r.updated_at) from public.wf_referrals r where r.student_id=d.student_id and r.institution_id=p_institution_id),d.updated_at),
        coalesce((select max(i.updated_at) from public.wf_interview_requests i where i.student_id=d.student_id),d.updated_at),
        coalesce((select max(p.updated_at) from public.wf_placements p where p.student_id=d.student_id),d.updated_at)
      )
    ) order by d.record_type,d.display_name)
    from filtered d
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_student_profile(
  p_institution_id text,
  p_student_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_student public.wf_student_profiles%rowtype;
  v_cohort public.wf_cohorts%rowtype;
  v_user public.users%rowtype;
  v_membership public.app_role_memberships%rowtype;
begin
  if not security.institution_student_accessible(p_institution_id,p_student_id) then
    raise exception 'Student outside authorized Institution scope';
  end if;

  select * into v_student
  from public.wf_student_profiles
  where student_id=p_student_id;

  if not found then
    raise exception 'Student not found';
  end if;

  select * into v_cohort
  from public.wf_cohorts
  where cohort_id=v_student.cohort_id;

  if v_student.user_id is not null then
    select * into v_user
    from public.users
    where user_id=v_student.user_id;

    select * into v_membership
    from public.app_role_memberships r
    where lower(r.role)='student'
      and r.user_id=v_student.user_id
      and lower(r.status)='active'
      and security.institution_can_view_student_invitation(
        p_institution_id,
        lower(r.scope_type),
        r.scope_id
      )
    order by r.updated_at desc nulls last,r.created_at desc nulls last
    limit 1;
  end if;

  return jsonb_build_object(
    'student',jsonb_build_object(
      'studentId',v_student.student_id,
      'userId',v_student.user_id,
      'authUserId',v_membership.auth_user_id,
      'displayName',coalesce(
        nullif(btrim(concat_ws(' ',v_user.first_name,v_user.last_name)),''),
        nullif(btrim(coalesce(v_student.preferred_name,'')),''),
        nullif(btrim(concat_ws(' ',
          nullif(coalesce(v_student.first_name_public,''),''),
          nullif(coalesce(v_student.last_initial_public,''),'')
        )),''),
        v_student.student_id
      ),
      'email',v_user.email,
      'phone',v_user.phone,
      'membershipKey',v_membership.membership_key,
      'invitationStatus',coalesce(v_membership.status,'accepted'),
      'invitationSource',v_membership.source,
      'acceptedAt',case when lower(coalesce(v_membership.status,''))='active' then v_membership.updated_at end,
      'programName',coalesce(v_cohort.program_name,v_student.program_type),
      'cohortId',v_student.cohort_id,
      'cohortName',coalesce(v_cohort.name,v_cohort.term,v_student.cohort_id),
      'tradeId',coalesce(v_cohort.trade_id,v_student.primary_trade_id),
      'graduationDate',coalesce(v_student.graduation_date,v_cohort.graduation_date),
      'profileStatus',v_student.profile_status,
      'availabilityStatus',v_student.availability_status,
      'discoverabilityStatus',v_student.discoverability_status,
      'institutionValidationStatus',v_student.institution_validation_status
    ),
    'technicalSkills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentSkillId',ss.student_skill_id,
        'skillId',ss.skill_id,
        'name',sc.name,
        'category',sc.category,
        'tradeId',sc.trade_id,
        'status',ss.status,
        'provenance',ss.provenance,
        'evidenceClass',case
          when ss.status='verified' then 'verified'
          when ss.provenance='self_attested' then 'self_attested'
          else 'in_progress'
        end,
        'selfAttestedAt',ss.self_attested_at,
        'verifiedAt',ss.verified_at,
        'verifiedByName',coalesce(
          nullif(btrim(concat_ws(' ',vu.first_name,vu.last_name)),''),
          vu.email,
          ss.verified_by_user_id
        )
      ) order by
        case when ss.status='verified' then 0 when ss.provenance='self_attested' then 1 else 2 end,
        sc.category,
        sc.name)
      from public.wf_student_skills ss
      join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
      left join public.users vu on vu.user_id=ss.verified_by_user_id
      where ss.student_id=p_student_id
        and ss.status<>'revoked'
    ),'[]'::jsonb),
    'readinessEvidence',public.student_profile_readiness_evidence(
      p_student_id,p_institution_id
    ),
    'employerTraining',public.institution_micro_cert_assignment_search(
      p_institution_id,null,p_student_id,null,null,null,null,null,null
    ),
    'referrals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'referralId',r.referral_id,
        'employerId',r.employer_id,
        'employerName',ctr.business_name,
        'hiringNeedId',r.hiring_need_id,
        'status',r.status,
        'referredAt',r.referred_at,
        'deliveredAt',r.delivered_at,
        'viewedAt',r.viewed_at,
        'closedAt',r.closed_at
      ) order by coalesce(r.referred_at,r.created_at) desc)
      from public.wf_referrals r
      join public.contractors ctr on ctr.contractor_id=r.employer_id
      where r.institution_id=p_institution_id
        and r.student_id=p_student_id
    ),'[]'::jsonb),
    'interviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'interviewRequestId',ir.interview_request_id,
        'referralId',ir.referral_id,
        'hiringNeedId',ir.hiring_need_id,
        'employerId',ir.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',ir.role_title,
        'tradeId',ir.trade_id,
        'status',ir.status,
        'sentAt',ir.sent_at,
        'respondedAt',ir.responded_at,
        'scheduledFor',ir.scheduled_for,
        'completedAt',ir.completed_at,
        'interviewFormat',ir.interview_format
      ) order by coalesce(ir.scheduled_for,ir.sent_at,ir.created_at) desc)
      from public.wf_interview_requests ir
      join public.contractors ctr on ctr.contractor_id=ir.employer_id
      where ir.student_id=p_student_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
        'referralId',p.referral_id,
        'interviewRequestId',p.interview_request_id,
        'hiringNeedId',p.hiring_need_id,
        'employerId',p.employer_id,
        'employerName',ctr.business_name,
        'roleTitle',p.role_title,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at,
        'endedAt',p.ended_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.contractors ctr on ctr.contractor_id=p.employer_id
      where p.student_id=p_student_id
    ),'[]'::jsonb),
    'retention',jsonb_build_object(
      'milestones',coalesce((
        select jsonb_agg(jsonb_build_object(
          'milestoneId',m.milestone_id,
          'placementId',p.placement_id,
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
          'employerName',ctr.business_name,
          'roleTitle',p.role_title,
          'dayNumber',m.day_number,
          'scheduledFor',m.scheduled_for,
          'status',m.status,
          'sentAt',m.sent_at,
          'responseReceivedAt',m.response_received_at
        ) order by m.scheduled_for desc)
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
      ),'[]'::jsonb),
      'cases',coalesce((
        select jsonb_agg(jsonb_build_object(
          'caseId',rc.case_id,
          'placementId',p.placement_id,
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
          'milestoneId',rc.milestone_id,
          'employerName',ctr.business_name,
          'roleTitle',p.role_title,
          'severity',rc.severity,
          'status',rc.status,
          'openedAt',rc.opened_at,
          'resolvedAt',rc.resolved_at,
          'resolutionCode',rc.resolution_code
        ) order by rc.opened_at desc)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
      ),'[]'::jsonb)
    ),
    'activity',coalesce((
      select jsonb_agg(jsonb_build_object(
        'activityType',activity_type,
        'title',title,
        'status',status,
        'occurredAt',occurred_at,
        'sourceId',source_id
      ) order by occurred_at desc)
      from (
        select
          'employer_training'::text as activity_type,
          concat('Employer Training: ',mc.title) as title,
          a.status,
          coalesce(a.completed_at,a.started_at,a.assigned_at,a.created_at) as occurred_at,
          a.assignment_id as source_id
        from public.wf_micro_cert_assignments a
        join public.wf_employer_micro_certs mc on mc.micro_cert_id=a.micro_cert_id
        where a.student_id=p_student_id
        union all
        select
          'referral',
          concat('Referral: ',ctr.business_name),
          r.status,
          coalesce(r.referred_at,r.created_at),
          r.referral_id
        from public.wf_referrals r
        join public.contractors ctr on ctr.contractor_id=r.employer_id
        where r.student_id=p_student_id
          and r.institution_id=p_institution_id
        union all
        select
          'interview',
          concat('Interview: ',ctr.business_name),
          ir.status,
          coalesce(ir.scheduled_for,ir.sent_at,ir.created_at),
          ir.interview_request_id
        from public.wf_interview_requests ir
        join public.contractors ctr on ctr.contractor_id=ir.employer_id
        where ir.student_id=p_student_id
        union all
        select
          'placement',
          concat('Placement: ',ctr.business_name),
          p.status,
          coalesce(p.started_at,p.created_at),
          p.placement_id
        from public.wf_placements p
        join public.contractors ctr on ctr.contractor_id=p.employer_id
        where p.student_id=p_student_id
        union all
        select
          'retention',
          concat('Retention day ',m.day_number::text),
          m.status,
          coalesce(m.response_received_at,m.sent_at,m.scheduled_for),
          m.milestone_id
        from public.wf_retention_milestones m
        join public.wf_placements p on p.placement_id=m.placement_id
        where p.student_id=p_student_id
      ) activity
      limit 25
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_workforce_summary(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_assignments jsonb;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution workspace access denied';
  end if;

  v_assignments:=public.institution_micro_cert_assignment_search(
    p_institution_id,null,null,null,null,null,null,null,null
  );

  return (
    with scoped_students as materialized (
      select s.*
      from public.wf_student_profiles s
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and coalesce(s.profile_status,'active')<>'inactive'
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),
    profile_metrics as (
      select
        count(*) as active_students,
        count(*) filter (where
          nullif(btrim(coalesce(first_name_public,'')),'') is not null
          and nullif(btrim(coalesce(last_initial_public,'')),'') is not null
          and nullif(btrim(coalesce(school_id,'')),'') is not null
          and nullif(btrim(coalesce(cohort_id,'')),'') is not null
          and nullif(btrim(coalesce(primary_trade_id,'')),'') is not null
          and (
            nullif(btrim(coalesce(graduation_date,'')),'') is not null
            or nullif(btrim(coalesce(graduation_year,'')),'') is not null
          )
          and nullif(btrim(coalesce(city,'')),'') is not null
          and nullif(btrim(coalesce(state,'')),'') is not null
          and nullif(btrim(coalesce(availability_status,'')),'') is not null
        ) as complete_students
      from scoped_students
    ),
    skill_metrics as (
      select
        count(*) filter (where ss.status='verified') as verified_skills,
        count(*) filter (
          where ss.status='verified'
            and ss.verified_at>=now()-interval '30 days'
        ) as verified_skills_last_30_days
      from public.wf_student_skills ss
      join scoped_students s on s.student_id=ss.student_id
    ),
    referral_metrics as (
      select
        count(*) filter (where r.status<>'draft') as total_referrals,
        count(*) filter (where r.status in (
          'referred','delivered','viewed','interview_requested',
          'interview_accepted','interview_declined'
        )) as open_referrals,
        count(*) filter (
          where r.status<>'draft'
            and coalesce(r.referred_at,r.created_at)>=now()-interval '30 days'
        ) as referrals_last_30_days
      from public.wf_referrals r
      join scoped_students s on s.student_id=r.student_id
      where r.institution_id=p_institution_id
    ),
    interview_metrics as (
      select
        count(*) filter (where ir.status<>'draft') as total_interviews,
        count(*) filter (where ir.status in (
          'sent','accepted','scheduling','scheduled'
        )) as active_interviews,
        count(*) filter (where ir.status='completed') as completed_interviews
      from public.wf_interview_requests ir
      join scoped_students s on s.student_id=ir.student_id
    ),
    placement_metrics as (
      select
        count(*) filter (where p.start_confirmed_at is not null) as total_hires,
        count(*) filter (where p.status='pending_start') as pending_starts,
        count(*) filter (where p.status='active' and p.start_confirmed_at is not null) as active_placements
      from public.wf_placements p
      join scoped_students s on s.student_id=p.student_id
    ),
    retention_metrics as (
      select
        count(*) filter (
          where rm.scheduled_for<=now()
            and rm.status not in ('skipped','cancelled')
        ) as eligible_milestones,
        count(*) filter (
          where rm.scheduled_for<=now() and rm.status='responded'
        ) as completed_milestones,
        count(*) filter (
          where rm.scheduled_for<=now()
            and rm.status in ('pending','due','sending','sent','failed')
        ) as due_milestones
      from public.wf_retention_milestones rm
      join public.wf_placements p on p.placement_id=rm.placement_id
      join scoped_students s on s.student_id=p.student_id
    ),
    case_metrics as (
      select
        count(*) filter (where rc.status in (
          'open','assigned','contacted','monitoring'
        )) as open_cases,
        count(*) filter (
          where rc.status in ('open','assigned','contacted','monitoring')
            and rc.severity in ('high','urgent')
        ) as urgent_cases
      from public.wf_retention_cases rc
      join public.wf_placements p on p.placement_id=rc.placement_id
      join scoped_students s on s.student_id=p.student_id
    )
    select jsonb_build_object(
      'activeStudents',pm.active_students,
      'profileCompleteStudents',pm.complete_students,
      'profileCompletionPercent',coalesce(round(
        100.0*pm.complete_students/nullif(pm.active_students,0)
      ),0)::integer,
      'verifiedSkills',sm.verified_skills,
      'verifiedSkillsLast30Days',sm.verified_skills_last_30_days,
      'totalReferrals',rf.total_referrals,
      'openReferrals',rf.open_referrals,
      'referralsLast30Days',rf.referrals_last_30_days,
      'totalInterviews',im.total_interviews,
      'activeInterviews',im.active_interviews,
      'completedInterviews',im.completed_interviews,
      'totalHires',pl.total_hires,
      'activePlacements',pl.active_placements,
      'pendingStarts',pl.pending_starts,
      'retentionMilestonesDue',rt.due_milestones,
      'retentionMilestonesCompleted',rt.completed_milestones,
      'retentionMilestoneCompletionPercent',coalesce(round(
        100.0*rt.completed_milestones/nullif(rt.eligible_milestones,0)
      ),0)::integer,
      'openRetentionCases',cm.open_cases,
      'urgentRetentionCases',cm.urgent_cases,
      'availableCourses',jsonb_array_length(
        public.institution_employer_learning_context(p_institution_id)->'courses'
      ),
      'totalAssignments',jsonb_array_length(v_assignments),
      'notStartedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='assigned'
      ),
      'inProgressAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='in_progress'
      ),
      'completedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='completed'
      ),
      'cancelledAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where x->>'status'='cancelled'
      ),
      'companyBadgesEarned',(
        select count(*)
        from public.wf_company_badge_awards a
        join scoped_students s on s.student_id=a.student_id
        where a.revoked_at is null
          and (a.expires_at is null or a.expires_at>now())
      ),
      'assessmentExhaustedAssignments',(
        select count(*) from jsonb_array_elements(v_assignments) x
        where (x->'progress'->'blockedReasons')
          ? 'required_assessment_attempts_exhausted'
      )
    )
    from profile_metrics pm
    cross join skill_metrics sm
    cross join referral_metrics rf
    cross join interview_metrics im
    cross join placement_metrics pl
    cross join retention_metrics rt
    cross join case_metrics cm
  );
end;
$$;

create or replace function public.institution_employers_directory(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer directory access denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employerId',e.employer_id,
      'employerName',e.employer_name,
      'approvalStatus',e.approval_status,
      'accountStatus',e.account_status,
      'city',e.city,
      'state',e.state,
      'website',e.website,
      'foundingPartnerStatus',e.founding_partner_status,
      'tradeIds',e.trade_ids,
      'hiringNeedCount',e.hiring_need_count,
      'microCertCount',e.micro_cert_count,
      'referralCount',e.referral_count,
      'activeReferralCount',e.active_referral_count,
      'placementCount',e.placement_count,
      'activePlacementCount',e.active_placement_count,
      'retentionCaseCount',e.retention_case_count,
      'openRetentionCaseCount',e.open_retention_case_count,
      'exposureEventCount',e.exposure_event_count,
      'lastActivityAt',e.last_activity_at
    ) order by e.employer_name)
    from (
      select
        ctr.contractor_id as employer_id,
        ctr.business_name as employer_name,
        ctr.approval_status,
        ctr.account_status,
        coalesce(wp.city,'') as city,
        coalesce(wp.state,'') as state,
        ctr.website,
        wp.founding_partner_status,
        coalesce(wp.trade_ids_json,'[]'::jsonb) as trade_ids,
        (
          select count(*)
          from public.wf_hiring_needs h
          where h.employer_id=ctr.contractor_id
            and h.status='active'
            and h.visibility='institution_shared'
        ) as hiring_need_count,
        (
          select count(distinct mc.micro_cert_id)
          from public.wf_employer_micro_certs mc
          join public.wf_employer_micro_cert_versions v
            on v.micro_cert_version_id=mc.current_version_id
          where mc.employer_id=ctr.contractor_id
            and mc.active=true
            and v.status in ('ready','live')
            and exists(
              select 1
              from public.wf_student_profiles s
              join public.wf_cohorts c on c.cohort_id=s.cohort_id
              where s.school_id=p_institution_id
                and c.institution_id=p_institution_id
                and security.can_view_institution_employer_learning(
                  p_institution_id,c.cohort_id
                )
                and security.student_is_eligible_for_employer_micro_cert(
                  mc.micro_cert_id,p_institution_id,s.student_id
                )
            )
        ) as micro_cert_count,
        (
          select count(*)
          from public.wf_referrals r
          where r.institution_id=p_institution_id
            and r.employer_id=ctr.contractor_id
            and security.institution_student_accessible(
              p_institution_id,r.student_id
            )
        ) as referral_count,
        (
          select count(*)
          from public.wf_referrals r
          where r.institution_id=p_institution_id
            and r.employer_id=ctr.contractor_id
            and r.status in (
              'delivered','viewed','interview_requested','interview_accepted'
            )
            and security.institution_student_accessible(
              p_institution_id,r.student_id
            )
        ) as active_referral_count,
        (
          select count(*)
          from public.wf_placements p
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id and p.start_confirmed_at is not null
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as placement_count,
        (
          select count(*)
          from public.wf_placements p
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id and p.start_confirmed_at is not null
            and p.status='active' and p.start_confirmed_at is not null
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as active_placement_count,
        (
          select count(*)
          from public.wf_retention_cases rc
          join public.wf_placements p on p.placement_id=rc.placement_id
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as retention_case_count,
        (
          select count(*)
          from public.wf_retention_cases rc
          join public.wf_placements p on p.placement_id=rc.placement_id
          join public.wf_student_profiles s on s.student_id=p.student_id
          where p.employer_id=ctr.contractor_id
            and rc.status in ('open','assigned','contacted','monitoring')
            and s.school_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,p.student_id
            )
        ) as open_retention_case_count,
        (
          select count(*)
          from public.wf_employer_exposure_events x
          where x.employer_id=ctr.contractor_id
            and x.institution_id=p_institution_id
            and security.institution_student_accessible(
              p_institution_id,x.student_id
            )
        ) as exposure_event_count,
        greatest(
          coalesce((
            select max(r.updated_at)
            from public.wf_referrals r
            where r.institution_id=p_institution_id
              and r.employer_id=ctr.contractor_id
              and security.institution_student_accessible(
                p_institution_id,r.student_id
              )
          ),'epoch'::timestamptz),
          coalesce((
            select max(p.updated_at)
            from public.wf_placements p
            join public.wf_student_profiles s on s.student_id=p.student_id
            where p.employer_id=ctr.contractor_id
              and s.school_id=p_institution_id
              and security.institution_student_accessible(
                p_institution_id,p.student_id
              )
          ),'epoch'::timestamptz),
          coalesce((
            select max(a.updated_at)
            from public.wf_micro_cert_assignments a
            join public.wf_employer_micro_certs mc
              on mc.micro_cert_id=a.micro_cert_id
            where mc.employer_id=ctr.contractor_id
              and a.institution_id=p_institution_id
              and a.cohort_id is not null
              and security.can_view_institution_employer_learning(
                p_institution_id,a.cohort_id
              )
          ),'epoch'::timestamptz)
        ) as last_activity_at
      from public.contractors ctr
      left join public.wf_contractor_profiles wp
        on wp.contractor_id=ctr.contractor_id
      where security.institution_employer_accessible(
        p_institution_id,ctr.contractor_id
      )
        and ctr.account_status not in ('suspended','closed')
    ) e
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_employer_detail(
  p_institution_id text,
  p_employer_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not security.institution_employer_accessible(
    p_institution_id,p_employer_id
  ) then
    raise exception 'Employer not found in Institution scope';
  end if;

  select jsonb_build_object(
    'employerId',ctr.contractor_id,
    'employerName',ctr.business_name,
    'approvalStatus',ctr.approval_status,
    'accountStatus',ctr.account_status,
    'website',ctr.website,
    'description',ctr.description,
    'businessEmail',ctr.business_email,
    'businessPhone',ctr.business_phone,
    'city',wp.city,
    'state',wp.state,
    'county',wp.county,
    'dispatchRadiusMiles',wp.dispatch_radius_miles,
    'serviceArea',coalesce(wp.service_area_json,'{}'::jsonb),
    'tradeIds',coalesce(wp.trade_ids_json,'[]'::jsonb),
    'hiringRoles',coalesce(wp.hiring_roles_json,'[]'::jsonb),
    'annualHiringVolume',wp.annual_hiring_volume,
    'hiringHorizon',wp.hiring_horizon,
    'workforceDescription',wp.workforce_description,
    'foundingPartnerStatus',wp.founding_partner_status,
    'talentScopes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'talentScopeId',ts.talent_scope_id,
        'institutionId',ts.institution_id,
        'cohortId',ts.cohort_id,
        'cohortName',coalesce(c.name,c.term,c.cohort_id),
        'tradeId',ts.trade_id,
        'programName',ts.program_name,
        'startsAt',ts.starts_at,
        'endsAt',ts.ends_at
      ) order by coalesce(c.program_name,ts.program_name,''),coalesce(c.name,c.term,ts.cohort_id,''))
      from public.wf_employer_talent_scopes ts
      left join public.wf_cohorts c on c.cohort_id=ts.cohort_id
      where ts.employer_id=ctr.contractor_id
        and ts.active=true
        and (
          ts.institution_id=p_institution_id
          or exists(
            select 1
            from public.wf_cohorts ac
            where ac.institution_id=p_institution_id
              and security.can_view_institution_employer_learning(
                p_institution_id,ac.cohort_id
              )
              and (
                ts.cohort_id=ac.cohort_id
                or lower(nullif(btrim(coalesce(ts.trade_id,'')),''))=
                  lower(nullif(btrim(coalesce(ac.trade_id,'')),''))
                or lower(nullif(btrim(coalesce(ts.program_name,'')),''))=
                  lower(nullif(btrim(coalesce(ac.program_name,'')),''))
              )
          )
        )
    ),'[]'::jsonb),
    'hiringNeeds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'hiringNeedId',h.hiring_need_id,
        'title',h.title,
        'tradeId',h.trade_id,
        'roleType',h.role_type,
        'targetHires',h.target_hires,
        'targetHireDate',h.target_hire_date,
        'workTypes',coalesce(h.work_types_json,'[]'::jsonb),
        'shifts',coalesce(h.shifts_json,'[]'::jsonb),
        'requiredVerifiedSkills',coalesce(h.required_verified_skills_json,'[]'::jsonb),
        'optionalVerifiedSkills',coalesce(h.optional_verified_skills_json,'[]'::jsonb),
        'minimumVerifiedSkillCount',h.minimum_verified_skill_count,
        'requiresDriversLicense',h.requires_drivers_license,
        'requiresDrivingRecordAttestation',h.requires_driving_record_attestation,
        'requiresBackgroundWillingness',h.requires_background_willingness,
        'requiresDrugScreenWillingness',h.requires_drug_screen_willingness,
        'sharedNotes',h.shared_notes,
        'status',h.status,
        'updatedAt',h.updated_at
      ) order by h.updated_at desc,h.title)
      from public.wf_hiring_needs h
      where h.employer_id=ctr.contractor_id
        and h.status='active'
        and h.visibility='institution_shared'
    ),'[]'::jsonb),
    'microCerts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'title',mc.title,
        'description',mc.description,
        'microCertVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'contentType',v.content_type,
        'durationMinutes',v.duration_minutes,
        'companyBadge',case when cb.company_badge_id is null then null else
          jsonb_build_object(
            'companyBadgeId',cb.company_badge_id,
            'title',cb.title,
            'version',cb.version,
            'active',cb.active
          )
        end,
        'eligibleStudentCount',(
          select count(*)
          from public.wf_student_profiles s
          join public.wf_cohorts c on c.cohort_id=s.cohort_id
          where s.school_id=p_institution_id
            and c.institution_id=p_institution_id
            and security.can_view_institution_employer_learning(
              p_institution_id,c.cohort_id
            )
            and security.student_is_eligible_for_employer_micro_cert(
              mc.micro_cert_id,p_institution_id,s.student_id
            )
        ),
        'assignmentCount',(
          select count(*)
          from public.wf_micro_cert_assignments a
          where a.institution_id=p_institution_id
            and a.micro_cert_id=mc.micro_cert_id
            and a.status<>'cancelled'
            and a.cohort_id is not null
            and security.can_view_institution_employer_learning(
              p_institution_id,a.cohort_id
            )
        ),
        'completedCount',(
          select count(*)
          from public.wf_micro_cert_assignments a
          where a.institution_id=p_institution_id
            and a.micro_cert_id=mc.micro_cert_id
            and a.status='completed'
            and a.cohort_id is not null
            and security.can_view_institution_employer_learning(
              p_institution_id,a.cohort_id
            )
        )
      ) order by mc.title)
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=mc.current_version_id
      left join public.wf_company_badges cb
        on cb.company_badge_id=v.company_badge_id
      where mc.employer_id=ctr.contractor_id
        and mc.active=true
        and v.status in ('ready','live')
        and exists(
          select 1
          from public.wf_student_profiles s
          join public.wf_cohorts c on c.cohort_id=s.cohort_id
          where s.school_id=p_institution_id
            and c.institution_id=p_institution_id
            and security.can_view_institution_employer_learning(
              p_institution_id,c.cohort_id
            )
            and security.student_is_eligible_for_employer_micro_cert(
              mc.micro_cert_id,p_institution_id,s.student_id
            )
        )
    ),'[]'::jsonb),
    'referrals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'referralId',r.referral_id,
        'studentId',r.student_id,
        'studentName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          r.student_id
        ),
        'program',coalesce(c.program_name,s.program_type),
        'cohortName',coalesce(c.name,c.term,s.cohort_id),
        'hiringNeedId',r.hiring_need_id,
        'hiringNeedTitle',h.title,
        'status',r.status,
        'referralConsentStatus',r.referral_consent_status,
        'referredAt',r.referred_at,
        'updatedAt',r.updated_at
      ) order by r.updated_at desc)
      from public.wf_referrals r
      join public.wf_student_profiles s on s.student_id=r.student_id
      left join public.users u on u.user_id=s.user_id
      left join public.wf_cohorts c on c.cohort_id=s.cohort_id
      left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
      where r.institution_id=p_institution_id
        and r.employer_id=ctr.contractor_id
        and security.institution_student_accessible(
          p_institution_id,r.student_id
        )
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
        'studentId',p.student_id,
        'studentName',coalesce(
          nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          p.student_id
        ),
        'roleTitle',p.role_title,
        'tradeId',p.trade_id,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.wf_student_profiles s on s.student_id=p.student_id
      left join public.users u on u.user_id=s.user_id
      where p.employer_id=ctr.contractor_id
        and s.school_id=p_institution_id
        and security.institution_student_accessible(
          p_institution_id,p.student_id
        )
    ),'[]'::jsonb),
    'retention',jsonb_build_object(
      'milestones',coalesce((
        select jsonb_agg(jsonb_build_object(
          'milestoneId',rm.milestone_id,
          'placementId',rm.placement_id,
          'dayNumber',rm.day_number,
          'status',rm.status,
          'scheduledFor',rm.scheduled_for,
          'sentAt',rm.sent_at,
          'responseReceivedAt',rm.response_received_at
        ) order by rm.scheduled_for desc)
        from public.wf_retention_milestones rm
        join public.wf_placements p on p.placement_id=rm.placement_id
        join public.wf_student_profiles s on s.student_id=p.student_id
        where p.employer_id=ctr.contractor_id
          and s.school_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,p.student_id
          )
      ),'[]'::jsonb),
      'cases',coalesce((
        select jsonb_agg(jsonb_build_object(
          'caseId',rc.case_id,
          'placementId',rc.placement_id,
          'milestoneId',rc.milestone_id,
          'severity',rc.severity,
          'status',rc.status,
          'summary',rc.summary,
          'openedAt',rc.opened_at,
          'resolvedAt',rc.resolved_at,
          'resolutionCode',rc.resolution_code
        ) order by rc.opened_at desc)
        from public.wf_retention_cases rc
        join public.wf_placements p on p.placement_id=rc.placement_id
        join public.wf_student_profiles s on s.student_id=p.student_id
        where p.employer_id=ctr.contractor_id
          and s.school_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,p.student_id
          )
      ),'[]'::jsonb)
    ),
    'exposure',coalesce((
      select jsonb_agg(jsonb_build_object(
        'exposureEventId',event.exposure_event_id,
        'studentId',event.student_id,
        'eventType',event.event_type,
        'sourceType',event.source_type,
        'sourceId',event.source_id,
        'microCertId',event.micro_cert_id,
        'assignmentId',event.assignment_id,
        'occurredAt',event.occurred_at
      ) order by event.occurred_at desc)
      from (
        select x.*
        from public.wf_employer_exposure_events x
        where x.employer_id=ctr.contractor_id
          and x.institution_id=p_institution_id
          and security.institution_student_accessible(
            p_institution_id,x.student_id
          )
        order by x.occurred_at desc
        limit 50
      ) event
    ),'[]'::jsonb)
  )
  into v_result
  from public.contractors ctr
  left join public.wf_contractor_profiles wp
    on wp.contractor_id=ctr.contractor_id
  where ctr.contractor_id=p_employer_id;

  if v_result is null then
    raise exception 'Employer not found in Institution scope';
  end if;

  return v_result;
end;
$$;

create or replace function public.institution_program_cohort_management(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Program/Cohort access denied';
  end if;

  return jsonb_build_object(
    'programs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'programKey',program.program_key,
        'programName',program.program_name,
        'tradeId',program.trade_id,
        'cohortCount',program.cohort_count,
        'activeCohortCount',program.active_cohort_count,
        'studentCount',program.student_count,
        'profileCompleteCount',program.profile_complete_count,
        'verifiedSkillCount',program.verified_skill_count,
        'assignmentCount',program.assignment_count,
        'completedAssignmentCount',program.completed_assignment_count,
        'inProgressAssignmentCount',program.in_progress_assignment_count,
        'referralCount',program.referral_count,
        'openReferralCount',program.open_referral_count,
        'placementCount',program.placement_count,
        'activePlacementCount',program.active_placement_count,
        'retentionMilestoneCount',program.retention_milestone_count,
        'openRetentionCaseCount',program.open_retention_case_count,
        'lastActivityAt',program.last_activity_at,
        'canManage',security.can_manage_institution_program_cohort(
          p_institution_id,'program',program.program_key
        )
      ) order by program.program_name,program.program_key)
      from (
        select
          coalesce(nullif(btrim(c.trade_id),''),nullif(btrim(c.program_name),'')) as program_key,
          coalesce(nullif(btrim(c.program_name),''),nullif(btrim(c.trade_id),''),'Unspecified Program') as program_name,
          max(nullif(btrim(c.trade_id),'')) as trade_id,
          count(distinct c.cohort_id) as cohort_count,
          count(distinct c.cohort_id) filter (
            where coalesce(nullif(lower(c.status),''),'active') in ('active','enrolling','in_progress','current')
          ) as active_cohort_count,
          count(distinct s.student_id) as student_count,
          count(distinct s.student_id) filter (
            where lower(coalesce(s.profile_status,'')) in ('complete','completed','profile_complete')
          ) as profile_complete_count,
          count(distinct ss.student_skill_id) filter (
            where lower(coalesce(ss.status,''))='verified'
          ) as verified_skill_count,
          count(distinct a.assignment_id) filter (
            where a.status<>'cancelled'
          ) as assignment_count,
          count(distinct a.assignment_id) filter (
            where a.status='completed'
          ) as completed_assignment_count,
          count(distinct a.assignment_id) filter (
            where a.status='in_progress'
          ) as in_progress_assignment_count,
          count(distinct r.referral_id) as referral_count,
          count(distinct r.referral_id) filter (
            where r.status in (
              'draft','referred','delivered','viewed',
              'interview_requested','interview_accepted'
            )
          ) as open_referral_count,
          count(distinct p.placement_id) filter (where p.start_confirmed_at is not null) as placement_count,
          count(distinct p.placement_id) filter (
            where p.status='active' and p.start_confirmed_at is not null
          ) as active_placement_count,
          count(distinct rm.milestone_id) as retention_milestone_count,
          count(distinct rc.case_id) filter (
            where rc.status in ('open','assigned','contacted','monitoring')
          ) as open_retention_case_count,
          greatest(
            coalesce(max(a.updated_at),'epoch'::timestamptz),
            coalesce(max(r.updated_at),'epoch'::timestamptz),
            coalesce(max(p.updated_at),'epoch'::timestamptz),
            coalesce(max(rc.updated_at),'epoch'::timestamptz)
          ) as last_activity_at
        from public.wf_cohorts c
        left join public.wf_student_profiles s
          on s.cohort_id=c.cohort_id
         and s.school_id=p_institution_id
        left join public.wf_student_skills ss
          on ss.student_id=s.student_id
        left join public.wf_micro_cert_assignments a
          on a.student_id=s.student_id
         and a.institution_id=p_institution_id
        left join public.wf_referrals r
          on r.student_id=s.student_id
         and r.institution_id=p_institution_id
        left join public.wf_placements p
          on p.student_id=s.student_id
        left join public.wf_retention_milestones rm
          on rm.placement_id=p.placement_id
        left join public.wf_retention_cases rc
          on rc.placement_id=p.placement_id
        where c.institution_id=p_institution_id
          and security.can_view_institution_employer_learning(
            p_institution_id,c.cohort_id
          )
          and coalesce(nullif(btrim(c.trade_id),''),nullif(btrim(c.program_name),'')) is not null
        group by
          coalesce(nullif(btrim(c.trade_id),''),nullif(btrim(c.program_name),'')),
          coalesce(nullif(btrim(c.program_name),''),nullif(btrim(c.trade_id),''),'Unspecified Program')
      ) program
    ),'[]'::jsonb),
    'cohorts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cohortId',cohort.cohort_id,
        'name',cohort.name,
        'programKey',cohort.program_key,
        'programName',cohort.program_name,
        'tradeId',cohort.trade_id,
        'term',cohort.term,
        'graduationDate',cohort.graduation_date,
        'status',cohort.status,
        'studentCount',cohort.student_count,
        'profileCompleteCount',cohort.profile_complete_count,
        'verifiedSkillCount',cohort.verified_skill_count,
        'assignmentCount',cohort.assignment_count,
        'completedAssignmentCount',cohort.completed_assignment_count,
        'inProgressAssignmentCount',cohort.in_progress_assignment_count,
        'referralCount',cohort.referral_count,
        'openReferralCount',cohort.open_referral_count,
        'placementCount',cohort.placement_count,
        'activePlacementCount',cohort.active_placement_count,
        'retentionMilestoneCount',cohort.retention_milestone_count,
        'openRetentionCaseCount',cohort.open_retention_case_count,
        'students',cohort.students,
        'canManage',security.can_manage_institution_program_cohort(
          p_institution_id,'cohort',cohort.cohort_id
        )
      ) order by cohort.program_name,cohort.term,cohort.name)
      from (
        select
          c.cohort_id,
          coalesce(nullif(btrim(c.name),''),nullif(btrim(c.term),''),c.cohort_id) as name,
          coalesce(nullif(btrim(c.trade_id),''),nullif(btrim(c.program_name),'')) as program_key,
          c.program_name,
          c.trade_id,
          c.term,
          c.graduation_date,
          coalesce(nullif(btrim(c.status),''),'active') as status,
          count(distinct s.student_id) as student_count,
          count(distinct s.student_id) filter (
            where lower(coalesce(s.profile_status,'')) in ('complete','completed','profile_complete')
          ) as profile_complete_count,
          count(distinct ss.student_skill_id) filter (
            where lower(coalesce(ss.status,''))='verified'
          ) as verified_skill_count,
          count(distinct a.assignment_id) filter (
            where a.status<>'cancelled'
          ) as assignment_count,
          count(distinct a.assignment_id) filter (
            where a.status='completed'
          ) as completed_assignment_count,
          count(distinct a.assignment_id) filter (
            where a.status='in_progress'
          ) as in_progress_assignment_count,
          count(distinct r.referral_id) as referral_count,
          count(distinct r.referral_id) filter (
            where r.status in (
              'draft','referred','delivered','viewed',
              'interview_requested','interview_accepted'
            )
          ) as open_referral_count,
          count(distinct p.placement_id) filter (where p.start_confirmed_at is not null) as placement_count,
          count(distinct p.placement_id) filter (
            where p.status='active' and p.start_confirmed_at is not null
          ) as active_placement_count,
          count(distinct rm.milestone_id) as retention_milestone_count,
          count(distinct rc.case_id) filter (
            where rc.status in ('open','assigned','contacted','monitoring')
          ) as open_retention_case_count,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'studentId',student.student_id,
              'displayName',student.display_name,
              'profileStatus',student.profile_status,
              'verifiedSkillCount',student.verified_skill_count,
              'assignmentCount',student.assignment_count,
              'referralCount',student.referral_count,
              'placementCount',student.placement_count
            ) order by student.display_name)
            from (
              select
                sp.student_id,
                coalesce(
                  nullif(btrim(coalesce(sp.preferred_name,'')),''),
                  concat_ws(' ',
                    nullif(btrim(coalesce(sp.first_name_public,'')),''),
                    nullif(btrim(coalesce(sp.last_initial_public,'')),'')
                  ),
                  sp.student_id
                ) as display_name,
                sp.profile_status,
                (
                  select count(*)
                  from public.wf_student_skills skill
                  where skill.student_id=sp.student_id
                    and lower(coalesce(skill.status,''))='verified'
                ) as verified_skill_count,
                (
                  select count(*)
                  from public.wf_micro_cert_assignments assignment
                  where assignment.student_id=sp.student_id
                    and assignment.institution_id=p_institution_id
                    and assignment.status<>'cancelled'
                ) as assignment_count,
                (
                  select count(*)
                  from public.wf_referrals referral
                  where referral.student_id=sp.student_id
                    and referral.institution_id=p_institution_id
                ) as referral_count,
                (
                  select count(*)
                  from public.wf_placements placement
                  where placement.student_id=sp.student_id and placement.start_confirmed_at is not null
                ) as placement_count
              from public.wf_student_profiles sp
              where sp.school_id=p_institution_id
                and sp.cohort_id=c.cohort_id
                and security.institution_student_accessible(
                  p_institution_id,sp.student_id
                )
              order by display_name
              limit 25
            ) student
          ),'[]'::jsonb) as students
        from public.wf_cohorts c
        left join public.wf_student_profiles s
          on s.cohort_id=c.cohort_id
         and s.school_id=p_institution_id
        left join public.wf_student_skills ss
          on ss.student_id=s.student_id
        left join public.wf_micro_cert_assignments a
          on a.student_id=s.student_id
         and a.institution_id=p_institution_id
        left join public.wf_referrals r
          on r.student_id=s.student_id
         and r.institution_id=p_institution_id
        left join public.wf_placements p
          on p.student_id=s.student_id
        left join public.wf_retention_milestones rm
          on rm.placement_id=p.placement_id
        left join public.wf_retention_cases rc
          on rc.placement_id=p.placement_id
        where c.institution_id=p_institution_id
          and security.can_view_institution_employer_learning(
            p_institution_id,c.cohort_id
          )
        group by c.cohort_id,c.name,c.program_name,c.trade_id,c.term,c.graduation_date,c.status
      ) cohort
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_referral_detail(
  p_institution_id text,
  p_referral_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution referral access denied';
  end if;

  select jsonb_build_object(
    'referralId',r.referral_id,
    'studentId',r.student_id,
    'studentName',coalesce(
      nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
      nullif(btrim(coalesce(s.preferred_name,'')),''),
      concat_ws(' ',
        nullif(btrim(coalesce(s.first_name_public,'')),''),
        nullif(btrim(coalesce(s.last_initial_public,'')),'')
      ),
      r.student_id
    ),
    'employerId',r.employer_id,
    'employerName',ctr.business_name,
    'institutionId',r.institution_id,
    'institutionName',ins.name,
    'program',coalesce(c.program_name,s.program_type),
    'cohortId',s.cohort_id,
    'cohortName',coalesce(c.name,c.term,s.cohort_id),
    'primaryTradeId',s.primary_trade_id,
    'hiringNeedId',r.hiring_need_id,
    'hiringNeedTitle',h.title,
    'status',r.status,
    'institutionSharedNote',r.institution_shared_note,
    'technicalSnapshot',r.technical_snapshot,
    'professionalSnapshot',r.professional_snapshot,
    'operationalSnapshot',r.operational_snapshot,
    'companyTrainingSnapshot',r.company_training_snapshot,
    'referralConsentStatus',r.referral_consent_status,
    'referralConsentSource',r.referral_consent_source,
    'referralConsentCheckedAt',r.referral_consent_checked_at,
    'referralNotePolicy',r.referral_note_policy,
    'referralNoteVisibility',r.referral_note_visibility,
    'referredAt',r.referred_at,
    'deliveredAt',r.delivered_at,
    'viewedAt',r.viewed_at,
    'closedAt',r.closed_at,
    'updatedAt',r.updated_at,
    'interviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'interviewRequestId',i.interview_request_id,
        'employerId',i.employer_id,
        'employerName',ictr.business_name,
        'roleTitle',i.role_title,
        'status',i.status,
        'scheduledFor',i.scheduled_for,
        'interviewFormat',i.interview_format,
        'sentAt',i.sent_at,
        'respondedAt',i.responded_at,
        'completedAt',i.completed_at
      ) order by coalesce(i.scheduled_for,i.sent_at,i.created_at) desc)
      from public.wf_interview_requests i
      join public.contractors ictr on ictr.contractor_id=i.employer_id
      where i.referral_id=r.referral_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId',p.placement_id,
      'employmentStartDate',p.employment_start_date,
      'startConfirmedAt',p.start_confirmed_at,
      'officialPlacement',p.start_confirmed_at is not null,
      'canConfirmStart',security.placement_can_confirm_start(auth.uid(),p.placement_id),
        'employerId',p.employer_id,
        'employerName',pctr.business_name,
        'roleTitle',p.role_title,
        'tradeId',p.trade_id,
        'employmentType',p.employment_type,
        'status',p.status,
        'hireDate',p.hire_date,
        'startedAt',p.started_at
      ) order by coalesce(p.started_at,p.created_at) desc)
      from public.wf_placements p
      join public.contractors pctr on pctr.contractor_id=p.employer_id
      where p.referral_id=r.referral_id
    ),'[]'::jsonb)
  )
  into v_result
  from public.wf_referrals r
  join public.wf_student_profiles s on s.student_id=r.student_id
  left join public.users u on u.user_id=s.user_id
  left join public.wf_institutions ins on ins.institution_id=r.institution_id
  left join public.wf_cohorts c on c.cohort_id=s.cohort_id
  left join public.contractors ctr on ctr.contractor_id=r.employer_id
  left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
  where r.referral_id=p_referral_id
    and r.institution_id=p_institution_id
    and security.institution_student_accessible(p_institution_id,r.student_id)
  limit 1;

  if v_result is null then
    raise exception 'Referral not found in Institution scope';
  end if;

  return v_result;
end;
$$;

create or replace function public.retention_claim_due_milestones(p_limit integer default 50)
returns table(message_id text,milestone_id text,placement_id text,day_number integer,student_id text,recipient_user_id text,recipient_phone text,consent_status text,employer_id text,institution_id text,role_title text)
language plpgsql security invoker set search_path=''
as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,50),200)); v_row record; v_message_id text;
begin
 for v_row in
  select rm.milestone_id,rm.placement_id,rm.day_number,p.student_id,p.employer_id,p.role_title,
         sp.user_id recipient_user_id,sp.school_id institution_id,u.phone recipient_phone,coalesce(sc.status,'unknown') consent_status
  from public.wf_retention_milestones rm
  join public.wf_placements p on p.placement_id=rm.placement_id
  join public.wf_student_profiles sp on sp.student_id=p.student_id
  join public.users u on u.user_id=sp.user_id
  left join public.wf_sms_consents sc on sc.user_id=sp.user_id and sc.category='retention'
  where rm.status in ('pending','due') and rm.scheduled_for<=now() and p.status='active' and p.start_confirmed_at is not null
    and not exists(select 1 from public.wf_retention_messages msg where msg.milestone_id=rm.milestone_id and msg.channel='sms')
  order by rm.scheduled_for,rm.milestone_id for update of rm skip locked limit v_limit
 loop
  update public.wf_retention_milestones set status='sending',updated_at=now()
   where public.wf_retention_milestones.milestone_id=v_row.milestone_id and status in ('pending','due');
  insert into public.wf_retention_messages(milestone_id,recipient_user_id,recipient_phone,channel,template_version,delivery_status)
   values(v_row.milestone_id,v_row.recipient_user_id,v_row.recipient_phone,'sms','retention_v1','sending')
   returning public.wf_retention_messages.message_id into v_message_id;
  perform security.emit_workforce_event('RETENTION_MILESTONE_DUE','retention_milestone',v_row.milestone_id,v_row.employer_id,v_row.institution_id,v_row.student_id,
   jsonb_build_object('status','pending'),jsonb_build_object('status','sending','dayNumber',v_row.day_number),
   jsonb_build_object('channel','sms','source','retention_scheduler'),'success','retention_milestone_due:'||v_row.milestone_id,null);
  return query select v_message_id,v_row.milestone_id::text,v_row.placement_id::text,v_row.day_number::integer,v_row.student_id::text,
   v_row.recipient_user_id::text,v_row.recipient_phone::text,v_row.consent_status::text,v_row.employer_id::text,v_row.institution_id::text,v_row.role_title::text;
 end loop;
end $$;

