-- Forward correction: legacy has_employer_role/is_admin is not a scoped
-- placement authorization boundary. Keep every trusted role with its scope.
create function security.placement_employer_can_manage(p_actor uuid,p_employer_id text,p_hiring_need_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor=auth.uid()
 and exists(select 1 from public.users u where u.auth_user_id=p_actor and lower(u.status)='active')
 and security.employer_is_approved(p_employer_id)
 and (security.retention_platform_admin(p_actor)
   or exists(select 1 from public.app_role_memberships r
     where r.auth_user_id=p_actor and lower(r.status)='active'
       and lower(r.scope_type) in ('employer','contractor') and r.scope_id=p_employer_id
       and (lower(r.role) in ('employer_owner','employer_admin','recruiter','contractor_owner','contractor_recruiter')
         or (lower(r.role)='hiring_manager' and exists(
           select 1 from public.wf_hiring_needs h where h.employer_id=p_employer_id
             and h.hiring_need_id=p_hiring_need_id and h.assigned_hiring_manager_user_id=security.current_legacy_user_id()))))
   or exists(select 1 from public.contractors c where c.contractor_id=p_employer_id
     and c.owner_user_id=security.current_legacy_user_id()));
$$;
revoke all on function security.placement_employer_can_manage(uuid,text,text) from public,anon;
grant execute on function security.placement_employer_can_manage(uuid,text,text) to authenticated;

create or replace function security.placement_can_confirm_start(p_actor uuid,p_placement_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor=auth.uid() and exists(select 1 from public.users u where u.auth_user_id=p_actor and lower(u.status)='active')
 and (security.retention_platform_admin(p_actor) or exists(
   select 1 from public.wf_placements p
   where p.placement_id=p_placement_id and p.status in ('pending_start','active','ended')
     and security.placement_employer_can_manage(p_actor,p.employer_id,p.hiring_need_id)
 ) or exists(
   select 1 from public.wf_placements p
   join public.wf_student_profiles s on s.student_id=p.student_id
   join public.app_role_memberships r on r.auth_user_id=p_actor
   where p.placement_id=p_placement_id and p.status in ('pending_start','active','ended') and lower(r.status)='active'
     and security.canonical_institution_role(r.role) in
       ('institution_super_admin','institution_admin','career_services','program_coordinator')
     and security.institution_role_scope_valid(r.role,r.scope_type)
     and case when lower(r.scope_type)='institution'
       then security.retention_membership_matches(r.id,s.school_id,null)
       else s.cohort_id is not null and security.retention_membership_matches(r.id,s.school_id,s.cohort_id) end
  ));
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
     or not security.placement_employer_can_manage(auth.uid(),p_employer_id,v_interview.hiring_need_id) then
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
     or not security.placement_employer_can_manage(auth.uid(),p_employer_id,v_placement.hiring_need_id) then
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
