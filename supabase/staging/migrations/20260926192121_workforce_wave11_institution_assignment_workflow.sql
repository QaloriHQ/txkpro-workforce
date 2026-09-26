-- W11-06 — Institution Employer Learning assignment workflow.
-- Uses existing per-student canonical assignment rows. Program/Cohort actions
-- expand to scoped Student assignments at assignment time, with provenance in metadata.

alter table public.wf_micro_cert_assignments
  add constraint wf_micro_cert_assignments_metadata_object_check
  check (jsonb_typeof(metadata)='object') not valid;

create unique index if not exists ux_wf_micro_cert_assignments_active_version_student
  on public.wf_micro_cert_assignments(micro_cert_version_id,student_id)
  where status<>'cancelled';

create index if not exists idx_wf_micro_cert_assignments_institution_status
  on public.wf_micro_cert_assignments(institution_id,status,assigned_at desc);

create index if not exists idx_wf_micro_cert_assignments_cohort_status
  on public.wf_micro_cert_assignments(cohort_id,status,assigned_at desc);

create index if not exists idx_wf_micro_cert_assignments_student_status
  on public.wf_micro_cert_assignments(student_id,status,assigned_at desc);

create index if not exists idx_wf_micro_cert_assignments_micro_cert_status
  on public.wf_micro_cert_assignments(micro_cert_id,status,assigned_at desc);

create or replace function security.institution_learning_has_any_scope(
  p_institution_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.is_admin()
    or exists(
      select 1
      from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and lower(r.role) in (
          'institution_admin','department_head','program_coordinator',
          'instructor','assistant_instructor','career_services',
          'read_only_analyst','educator'
        )
        and (
          (lower(r.scope_type)='institution' and r.scope_id=p_institution_id)
          or (
            lower(r.scope_type)='cohort'
            and exists(
              select 1 from public.wf_cohorts c
              where c.cohort_id=r.scope_id
                and c.institution_id=p_institution_id
            )
          )
          or (
            lower(r.scope_type)='program'
            and exists(
              select 1 from public.wf_cohorts c
              where c.institution_id=p_institution_id
                and (
                  lower(coalesce(c.trade_id,''))=lower(r.scope_id)
                  or lower(coalesce(c.program_name,''))=lower(r.scope_id)
                )
            )
          )
        )
    ),
    false
  );
$$;

revoke all on function security.institution_learning_has_any_scope(text)
  from public,anon,authenticated;
grant execute on function security.institution_learning_has_any_scope(text)
  to service_role;

create or replace function security.student_is_eligible_for_employer_micro_cert(
  p_micro_cert_id text,
  p_institution_id text,
  p_student_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(exists(
    select 1
    from public.wf_student_profiles s
    join public.wf_cohorts c
      on c.cohort_id=s.cohort_id
     and c.institution_id=p_institution_id
    where s.student_id=p_student_id
      and s.school_id=p_institution_id
      and exists(
        select 1
        from public.wf_employer_micro_cert_eligibility e
        where e.micro_cert_id=p_micro_cert_id
          and e.active=true
          and (e.institution_id is null or e.institution_id=p_institution_id)
          and (e.cohort_id is null or e.cohort_id=s.cohort_id)
          and (
            e.trade_id is null
            or lower(e.trade_id)=lower(coalesce(c.trade_id,''))
          )
          and (
            e.program_name is null
            or lower(e.program_name)=lower(coalesce(c.program_name,''))
          )
      )
  ),false);
$$;

revoke all on function security.student_is_eligible_for_employer_micro_cert(
  text,text,text
) from public,anon,authenticated;
grant execute on function security.student_is_eligible_for_employer_micro_cert(
  text,text,text
) to service_role;

create or replace function public.institution_employer_learning_context(
  p_institution_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_institution public.wf_institutions%rowtype;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  select * into v_institution
  from public.wf_institutions i
  where i.institution_id=p_institution_id
    and i.active=true;
  if not found then raise exception 'Institution not found'; end if;

  return jsonb_build_object(
    'institution',jsonb_build_object(
      'institutionId',v_institution.institution_id,
      'name',v_institution.name,
      'shortName',v_institution.short_name,
      'city',v_institution.city,
      'state',v_institution.state
    ),
    'canAssign',exists(
      select 1
      from public.wf_cohorts c
      join public.wf_student_profiles s
        on s.cohort_id=c.cohort_id and s.school_id=p_institution_id
      where c.institution_id=p_institution_id
        and security.can_assign_employer_learning(
          p_institution_id,c.cohort_id,s.student_id
        )
    ),
    'programs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'programKey',x.program_key,
        'programName',x.program_name,
        'tradeId',x.trade_id,
        'cohortCount',x.cohort_count,
        'studentCount',x.student_count
      ) order by x.program_name,x.program_key)
      from (
        select
          coalesce(nullif(c.trade_id,''),nullif(c.program_name,'')) as program_key,
          coalesce(nullif(c.program_name,''),nullif(c.trade_id,''),'Unspecified Program') as program_name,
          max(c.trade_id) as trade_id,
          count(distinct c.cohort_id) as cohort_count,
          count(distinct s.student_id) as student_count
        from public.wf_cohorts c
        left join public.wf_student_profiles s
          on s.cohort_id=c.cohort_id and s.school_id=p_institution_id
        where c.institution_id=p_institution_id
          and security.can_view_institution_employer_learning(
            p_institution_id,c.cohort_id
          )
          and coalesce(nullif(c.trade_id,''),nullif(c.program_name,'')) is not null
        group by
          coalesce(nullif(c.trade_id,''),nullif(c.program_name,'')),
          coalesce(nullif(c.program_name,''),nullif(c.trade_id,''),'Unspecified Program')
      ) x
    ),'[]'::jsonb),
    'cohorts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cohortId',c.cohort_id,
        'name',coalesce(c.name,c.term,c.cohort_id),
        'programName',c.program_name,
        'tradeId',c.trade_id,
        'term',c.term,
        'graduationDate',c.graduation_date,
        'status',c.status,
        'studentCount',(
          select count(*)
          from public.wf_student_profiles s
          where s.school_id=p_institution_id
            and s.cohort_id=c.cohort_id
        ),
        'canAssign',exists(
          select 1
          from public.wf_student_profiles s
          where s.school_id=p_institution_id
            and s.cohort_id=c.cohort_id
            and security.can_assign_employer_learning(
              p_institution_id,c.cohort_id,s.student_id
            )
        )
      ) order by coalesce(c.program_name,''),coalesce(c.term,''),coalesce(c.name,''))
      from public.wf_cohorts c
      where c.institution_id=p_institution_id
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),'[]'::jsonb),
    'students',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId',s.student_id,
        'displayName',coalesce(
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          s.student_id
        ),
        'cohortId',s.cohort_id,
        'cohortName',coalesce(c.name,c.term,c.cohort_id),
        'programName',c.program_name,
        'tradeId',c.trade_id,
        'graduationDate',s.graduation_date,
        'profileStatus',s.profile_status,
        'canAssign',security.can_assign_employer_learning(
          p_institution_id,c.cohort_id,s.student_id
        )
      ) order by
        coalesce(c.program_name,''),
        coalesce(c.name,c.term,c.cohort_id),
        coalesce(s.preferred_name,s.first_name_public,s.student_id))
      from public.wf_student_profiles s
      join public.wf_cohorts c
        on c.cohort_id=s.cohort_id
       and c.institution_id=p_institution_id
      where s.school_id=p_institution_id
        and security.can_view_institution_employer_learning(
          p_institution_id,c.cohort_id
        )
    ),'[]'::jsonb),
    'courses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'microCertId',mc.micro_cert_id,
        'employerId',mc.employer_id,
        'employerName',ctr.business_name,
        'title',mc.title,
        'description',mc.description,
        'microCertVersionId',v.micro_cert_version_id,
        'versionNumber',v.version_number,
        'status',v.status,
        'learningObjective',v.learning_objective,
        'durationMinutes',v.duration_minutes,
        'contentType',v.content_type,
        'companyBadge',case when cb.company_badge_id is null then null else
          jsonb_build_object(
            'companyBadgeId',cb.company_badge_id,
            'title',cb.title,
            'version',cb.version
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
        'activeAssignmentCount',(
          select count(*)
          from public.wf_micro_cert_assignments a
          where a.institution_id=p_institution_id
            and a.micro_cert_version_id=v.micro_cert_version_id
            and a.status<>'cancelled'
            and (
              a.cohort_id is null
              or security.can_view_institution_employer_learning(
                p_institution_id,a.cohort_id
              )
            )
        )
      ) order by ctr.business_name,mc.title)
      from public.wf_employer_micro_certs mc
      join public.wf_employer_micro_cert_versions v
        on v.micro_cert_version_id=mc.current_version_id
      join public.contractors ctr
        on ctr.contractor_id=mc.employer_id
      left join public.wf_company_badges cb
        on cb.company_badge_id=v.company_badge_id
      where mc.active=true
        and v.status in ('ready','live')
        and ctr.approval_status='approved'
        and ctr.account_status not in ('suspended','closed')
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
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_micro_cert_assignment_preview(
  p_institution_id text,
  p_micro_cert_id text,
  p_target_type text,
  p_program_key text default null,
  p_cohort_id text default null,
  p_student_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_target_type text:=lower(btrim(coalesce(p_target_type,'')));
  v_version_id text;
  v_version_number integer;
  v_status text;
  v_employer_id text;
  v_title text;
  v_employer_name text;
  v_requested_ids text[];
  v_target_count integer;
  v_accessible_count integer;
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  if v_target_type not in ('program','cohort','students') then
    raise exception 'Assignment target type must be program, cohort, or students';
  end if;

  select mc.current_version_id,v.version_number,v.status,mc.employer_id,
         mc.title,ctr.business_name
  into v_version_id,v_version_number,v_status,v_employer_id,v_title,v_employer_name
  from public.wf_employer_micro_certs mc
  join public.wf_employer_micro_cert_versions v
    on v.micro_cert_version_id=mc.current_version_id
  join public.contractors ctr on ctr.contractor_id=mc.employer_id
  where mc.micro_cert_id=p_micro_cert_id
    and mc.active=true
    and v.status in ('ready','live')
    and ctr.approval_status='approved'
    and ctr.account_status not in ('suspended','closed');
  if not found then
    raise exception 'Assignable Employer Micro-Certification not found';
  end if;

  if v_target_type='program' then
    if nullif(btrim(coalesce(p_program_key,'')),'') is null then
      raise exception 'Program is required';
    end if;
    select count(*)
    into v_target_count
    from public.wf_student_profiles s
    join public.wf_cohorts c on c.cohort_id=s.cohort_id
    where s.school_id=p_institution_id
      and c.institution_id=p_institution_id
      and (
        lower(coalesce(c.trade_id,''))=lower(p_program_key)
        or lower(coalesce(c.program_name,''))=lower(p_program_key)
      );
    select count(*)
    into v_accessible_count
    from public.wf_student_profiles s
    join public.wf_cohorts c on c.cohort_id=s.cohort_id
    where s.school_id=p_institution_id
      and c.institution_id=p_institution_id
      and (
        lower(coalesce(c.trade_id,''))=lower(p_program_key)
        or lower(coalesce(c.program_name,''))=lower(p_program_key)
      )
      and security.can_assign_employer_learning(
        p_institution_id,c.cohort_id,s.student_id
      );
    if v_target_count=0 then raise exception 'Program has no assignable Students'; end if;
    if v_accessible_count<>v_target_count then
      raise exception 'Program assignment exceeds authorized Institution scope';
    end if;

  elsif v_target_type='cohort' then
    if nullif(btrim(coalesce(p_cohort_id,'')),'') is null then
      raise exception 'Cohort is required';
    end if;
    if not exists(
      select 1 from public.wf_cohorts c
      where c.cohort_id=p_cohort_id
        and c.institution_id=p_institution_id
    ) then raise exception 'Cohort is outside Institution scope'; end if;

    select count(*) into v_target_count
    from public.wf_student_profiles s
    where s.school_id=p_institution_id
      and s.cohort_id=p_cohort_id;

    select count(*) into v_accessible_count
    from public.wf_student_profiles s
    where s.school_id=p_institution_id
      and s.cohort_id=p_cohort_id
      and security.can_assign_employer_learning(
        p_institution_id,p_cohort_id,s.student_id
      );
    if v_target_count=0 then raise exception 'Cohort has no assignable Students'; end if;
    if v_accessible_count<>v_target_count then
      raise exception 'Cohort assignment exceeds authorized Institution scope';
    end if;

  else
    if p_student_ids is null or jsonb_typeof(p_student_ids)<>'array' then
      raise exception 'studentIds must be an array';
    end if;
    select coalesce(array_agg(distinct value),array[]::text[])
    into v_requested_ids
    from jsonb_array_elements_text(p_student_ids);
    v_target_count:=coalesce(array_length(v_requested_ids,1),0);
    if v_target_count<1 or v_target_count>500 then
      raise exception 'Select between 1 and 500 Students';
    end if;

    select count(*) into v_accessible_count
    from public.wf_student_profiles s
    join public.wf_cohorts c on c.cohort_id=s.cohort_id
    where s.student_id=any(v_requested_ids)
      and s.school_id=p_institution_id
      and c.institution_id=p_institution_id
      and security.can_assign_employer_learning(
        p_institution_id,c.cohort_id,s.student_id
      );
    if v_accessible_count<>v_target_count then
      raise exception 'Selected Students exceed authorized Institution scope';
    end if;
  end if;

  return jsonb_build_object(
    'course',jsonb_build_object(
      'microCertId',p_micro_cert_id,
      'microCertVersionId',v_version_id,
      'versionNumber',v_version_number,
      'status',v_status,
      'employerId',v_employer_id,
      'employerName',v_employer_name,
      'title',v_title
    ),
    'targetType',v_target_type,
    'programKey',nullif(btrim(coalesce(p_program_key,'')),''),
    'cohortId',nullif(btrim(coalesce(p_cohort_id,'')),''),
    'students',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId',s.student_id,
        'displayName',coalesce(
          nullif(btrim(coalesce(s.preferred_name,'')),''),
          concat_ws(' ',
            nullif(btrim(coalesce(s.first_name_public,'')),''),
            nullif(btrim(coalesce(s.last_initial_public,'')),'')
          ),
          s.student_id
        ),
        'cohortId',s.cohort_id,
        'cohortName',coalesce(c.name,c.term,c.cohort_id),
        'programName',c.program_name,
        'eligible',security.student_is_eligible_for_employer_micro_cert(
          p_micro_cert_id,p_institution_id,s.student_id
        ),
        'activeAssignmentId',(
          select a.assignment_id
          from public.wf_micro_cert_assignments a
          where a.micro_cert_version_id=v_version_id
            and a.student_id=s.student_id
            and a.status<>'cancelled'
          order by a.assigned_at desc
          limit 1
        )
      ) order by
        coalesce(c.program_name,''),
        coalesce(c.name,c.term,c.cohort_id),
        coalesce(s.preferred_name,s.first_name_public,s.student_id))
      from public.wf_student_profiles s
      join public.wf_cohorts c on c.cohort_id=s.cohort_id
      where s.school_id=p_institution_id
        and c.institution_id=p_institution_id
        and security.can_assign_employer_learning(
          p_institution_id,c.cohort_id,s.student_id
        )
        and (
          (v_target_type='program' and (
            lower(coalesce(c.trade_id,''))=lower(p_program_key)
            or lower(coalesce(c.program_name,''))=lower(p_program_key)
          ))
          or (v_target_type='cohort' and s.cohort_id=p_cohort_id)
          or (v_target_type='students' and s.student_id=any(v_requested_ids))
        )
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.institution_micro_cert_assign(
  p_institution_id text,
  p_micro_cert_id text,
  p_target_type text,
  p_program_key text default null,
  p_cohort_id text default null,
  p_student_ids jsonb default '[]'::jsonb,
  p_notify_students boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  v_preview jsonb;
  v_course jsonb;
  v_student jsonb;
  v_assignment_id text;
  v_request_id uuid:=gen_random_uuid();
  v_created jsonb:='[]'::jsonb;
  v_skipped jsonb:='[]'::jsonb;
  v_created_count integer:=0;
  v_skipped_count integer:=0;
  v_notified_count integer:=0;
  v_status text;
  v_student_user_id text;
  v_event_id uuid;
begin
  if v_user_id is null then raise exception 'Authenticated Institution user required'; end if;

  v_preview:=public.institution_micro_cert_assignment_preview(
    p_institution_id,p_micro_cert_id,p_target_type,p_program_key,p_cohort_id,p_student_ids
  );
  v_course:=v_preview->'course';
  v_status:=v_course->>'status';

  for v_student in
    select value from jsonb_array_elements(v_preview->'students')
  loop
    if coalesce((v_student->>'eligible')::boolean,false)=false then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
        'studentId',v_student->>'studentId',
        'reason','not_eligible'
      ));
      v_skipped_count:=v_skipped_count+1;
      continue;
    end if;

    if nullif(v_student->>'activeAssignmentId','') is not null then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
        'studentId',v_student->>'studentId',
        'assignmentId',v_student->>'activeAssignmentId',
        'reason','already_assigned'
      ));
      v_skipped_count:=v_skipped_count+1;
      continue;
    end if;

    v_assignment_id:=security.new_legacy_id('MCA');

    begin
      insert into public.wf_micro_cert_assignments(
        assignment_id,micro_cert_id,micro_cert_version_id,student_id,
        institution_id,cohort_id,assigned_by_user_id,status,assigned_at,
        metadata,created_at,updated_at
      ) values(
        v_assignment_id,p_micro_cert_id,v_course->>'microCertVersionId',
        v_student->>'studentId',p_institution_id,v_student->>'cohortId',
        v_user_id,'assigned',now(),
        jsonb_build_object(
          'source','institution',
          'assignmentRequestId',v_request_id,
          'targetType',lower(p_target_type),
          'programKey',nullif(btrim(coalesce(p_program_key,'')),''),
          'requestedCohortId',nullif(btrim(coalesce(p_cohort_id,'')),''),
          'courseStatusAtAssignment',v_status,
          'notificationRequested',p_notify_students
        ),
        now(),now()
      );
    exception when unique_violation then
      select a.assignment_id
      into v_assignment_id
      from public.wf_micro_cert_assignments a
      where a.micro_cert_version_id=v_course->>'microCertVersionId'
        and a.student_id=v_student->>'studentId'
        and a.status<>'cancelled'
      order by a.assigned_at desc
      limit 1;

      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
        'studentId',v_student->>'studentId',
        'assignmentId',v_assignment_id,
        'reason','already_assigned'
      ));
      v_skipped_count:=v_skipped_count+1;
      continue;
    end;

    v_event_id:=security.emit_employer_learning_event(
      p_event_type=>'MICRO_CERT_ASSIGNED',
      p_target_id=>v_assignment_id,
      p_event_key=>'micro-cert-assigned:'||v_assignment_id,
      p_source=>'institution',
      p_employer_id=>v_course->>'employerId',
      p_institution_id=>p_institution_id,
      p_student_id=>v_student->>'studentId',
      p_actor_type=>'user',
      p_before=>null,
      p_after=>jsonb_build_object(
        'status','assigned',
        'assignedAt',now()
      ),
      p_metadata=>jsonb_build_object(
        'assignment_id',v_assignment_id,
        'micro_cert_id',p_micro_cert_id,
        'micro_cert_version_id',v_course->>'microCertVersionId',
        'cohort_id',v_student->>'cohortId',
        'assignment_request_id',v_request_id,
        'assignment_target_type',lower(p_target_type)
      )
    );

    select s.user_id into v_student_user_id
    from public.wf_student_profiles s
    where s.student_id=v_student->>'studentId';

    if p_notify_students
       and v_status='live'
       and v_student_user_id is not null then
      insert into public.wf_notifications(
        recipient_user_id,event_type,target_type,target_id,channel,status,payload,
        created_at,updated_at
      ) values(
        v_student_user_id,'MICRO_CERT_ASSIGNED','micro_cert_assignment',
        v_assignment_id,'in_app','queued',
        jsonb_build_object(
          'assignmentId',v_assignment_id,
          'microCertId',p_micro_cert_id,
          'microCertVersionId',v_course->>'microCertVersionId',
          'courseTitle',v_course->>'title',
          'employerId',v_course->>'employerId',
          'employerName',v_course->>'employerName'
        ),
        now(),now()
      );
      v_notified_count:=v_notified_count+1;
    end if;

    insert into public.platform_audit_events(
      actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
      institution_id,student_id,employer_id,result,after_json,metadata
    ) values(
      (select auth.uid()),v_user_id,'MICRO_CERT_ASSIGNED',
      'micro_cert_assignment',v_assignment_id,'workforce-institution-learning',
      p_institution_id,v_student->>'studentId',v_course->>'employerId','success',
      jsonb_build_object(
        'status','assigned',
        'microCertId',p_micro_cert_id,
        'microCertVersionId',v_course->>'microCertVersionId',
        'cohortId',v_student->>'cohortId'
      ),
      jsonb_build_object(
        'source','W11-06',
        'assignmentRequestId',v_request_id,
        'domainEventId',v_event_id,
        'targetType',lower(p_target_type)
      )
    );

    v_created:=v_created||jsonb_build_array(jsonb_build_object(
      'assignmentId',v_assignment_id,
      'studentId',v_student->>'studentId',
      'studentName',v_student->>'displayName',
      'cohortId',v_student->>'cohortId',
      'eventId',v_event_id
    ));
    v_created_count:=v_created_count+1;
  end loop;

  return jsonb_build_object(
    'assignmentRequestId',v_request_id,
    'course',v_course,
    'targetType',lower(p_target_type),
    'createdCount',v_created_count,
    'skippedCount',v_skipped_count,
    'notificationCount',v_notified_count,
    'notificationsDeferred',p_notify_students and v_status<>'live',
    'created',v_created,
    'skipped',v_skipped
  );
end;
$$;

create or replace function public.institution_micro_cert_assignments(
  p_institution_id text,
  p_status text default null,
  p_micro_cert_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_status text:=nullif(lower(btrim(coalesce(p_status,''))),'');
begin
  if not security.institution_learning_has_any_scope(p_institution_id) then
    raise exception 'Institution Employer Learning access denied';
  end if;

  if v_status is not null
     and v_status not in ('assigned','in_progress','completed','cancelled') then
    raise exception 'Invalid assignment status';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignmentId',a.assignment_id,
      'microCertId',a.micro_cert_id,
      'microCertVersionId',a.micro_cert_version_id,
      'courseTitle',mc.title,
      'versionNumber',v.version_number,
      'courseStatus',v.status,
      'employerId',mc.employer_id,
      'employerName',ctr.business_name,
      'studentId',a.student_id,
      'studentName',coalesce(
        nullif(btrim(coalesce(s.preferred_name,'')),''),
        concat_ws(' ',
          nullif(btrim(coalesce(s.first_name_public,'')),''),
          nullif(btrim(coalesce(s.last_initial_public,'')),'')
        ),
        a.student_id
      ),
      'institutionId',a.institution_id,
      'cohortId',a.cohort_id,
      'cohortName',coalesce(c.name,c.term,c.cohort_id),
      'programName',c.program_name,
      'assignedByUserId',a.assigned_by_user_id,
      'assignedByName',coalesce(
        nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),
        a.assigned_by_user_id
      ),
      'status',a.status,
      'assignedAt',a.assigned_at,
      'startedAt',a.started_at,
      'completedAt',a.completed_at,
      'cancelledAt',a.cancelled_at,
      'metadata',a.metadata,
      'latestCompletion',case when lc.completion_id is null then null else
        jsonb_build_object(
          'completionId',lc.completion_id,
          'attemptNumber',lc.attempt_number,
          'outcome',lc.outcome,
          'score',lc.score,
          'completedAt',lc.completed_at
        )
      end
    ) order by a.assigned_at desc,a.assignment_id)
    from public.wf_micro_cert_assignments a
    join public.wf_employer_micro_certs mc
      on mc.micro_cert_id=a.micro_cert_id
    join public.wf_employer_micro_cert_versions v
      on v.micro_cert_version_id=a.micro_cert_version_id
    join public.contractors ctr
      on ctr.contractor_id=mc.employer_id
    join public.wf_student_profiles s
      on s.student_id=a.student_id
    left join public.wf_cohorts c
      on c.cohort_id=a.cohort_id
    left join public.users u
      on u.user_id=a.assigned_by_user_id
    left join lateral (
      select cc.*
      from public.wf_micro_cert_completions cc
      where cc.assignment_id=a.assignment_id
      order by cc.attempt_number desc,cc.completed_at desc
      limit 1
    ) lc on true
    where a.institution_id=p_institution_id
      and (v_status is null or a.status=v_status)
      and (p_micro_cert_id is null or a.micro_cert_id=p_micro_cert_id)
      and a.cohort_id is not null
      and security.can_view_institution_employer_learning(
        p_institution_id,a.cohort_id
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.institution_micro_cert_assignment_cancel(
  p_institution_id text,
  p_assignment_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id text:=security.current_legacy_user_id();
  a public.wf_micro_cert_assignments%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_employer_id text;
begin
  select * into a
  from public.wf_micro_cert_assignments
  where assignment_id=p_assignment_id
    and institution_id=p_institution_id
  for update;
  if not found then raise exception 'Assignment not found'; end if;

  if not security.can_assign_employer_learning(
    p_institution_id,a.cohort_id,a.student_id
  ) then
    raise exception 'Institution Employer Learning assignment management denied';
  end if;

  if a.status='completed' then
    raise exception 'Completed assignment cannot be cancelled';
  end if;
  if a.status='cancelled' then
    return (
      select x
      from jsonb_array_elements(
        public.institution_micro_cert_assignments(
          p_institution_id,'cancelled',a.micro_cert_id
        )
      ) x
      where x->>'assignmentId'=p_assignment_id
      limit 1
    );
  end if;

  select mc.employer_id into v_employer_id
  from public.wf_employer_micro_certs mc
  where mc.micro_cert_id=a.micro_cert_id;

  update public.wf_micro_cert_assignments
  set status='cancelled',
      cancelled_at=now(),
      updated_at=now(),
      metadata=metadata||jsonb_build_object(
        'cancelledByUserId',v_user_id,
        'cancellationReason',v_reason
      )
  where assignment_id=p_assignment_id;

  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
    institution_id,student_id,employer_id,result,before_json,after_json,metadata
  ) values(
    (select auth.uid()),v_user_id,'MICRO_CERT_ASSIGNMENT_CANCELLED',
    'micro_cert_assignment',p_assignment_id,'workforce-institution-learning',
    p_institution_id,a.student_id,v_employer_id,'success',
    jsonb_build_object('status',a.status),
    jsonb_build_object('status','cancelled','cancelledAt',now()),
    jsonb_build_object('source','W11-06','reason',v_reason)
  );

  return (
    select x
    from jsonb_array_elements(
      public.institution_micro_cert_assignments(
        p_institution_id,'cancelled',a.micro_cert_id
      )
    ) x
    where x->>'assignmentId'=p_assignment_id
    limit 1
  );
end;
$$;

revoke all on function public.institution_employer_learning_context(text)
  from public,anon;
revoke all on function public.institution_micro_cert_assignment_preview(
  text,text,text,text,text,jsonb
) from public,anon;
revoke all on function public.institution_micro_cert_assign(
  text,text,text,text,text,jsonb,boolean
) from public,anon;
revoke all on function public.institution_micro_cert_assignments(
  text,text,text
) from public,anon;
revoke all on function public.institution_micro_cert_assignment_cancel(
  text,text,text
) from public,anon;

grant execute on function public.institution_employer_learning_context(text)
  to authenticated,service_role;
grant execute on function public.institution_micro_cert_assignment_preview(
  text,text,text,text,text,jsonb
) to authenticated,service_role;
grant execute on function public.institution_micro_cert_assign(
  text,text,text,text,text,jsonb,boolean
) to authenticated,service_role;
grant execute on function public.institution_micro_cert_assignments(
  text,text,text
) to authenticated,service_role;
grant execute on function public.institution_micro_cert_assignment_cancel(
  text,text,text
) to authenticated,service_role;
