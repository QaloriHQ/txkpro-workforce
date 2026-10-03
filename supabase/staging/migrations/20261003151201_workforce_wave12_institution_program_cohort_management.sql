-- W12-05: Institution Program/Cohort management.
-- Programs are derived from canonical wf_cohorts rows. Metrics are read from
-- canonical Student, readiness, Employer Training, referral, placement, and
-- retention records.

create or replace function security.can_manage_institution_program_cohort(
  p_institution_id text,
  p_target_scope_type text,
  p_target_scope_id text
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
        and security.canonical_institution_role(r.role) in (
          'institution_super_admin','institution_admin',
          'department_head','program_coordinator'
        )
        and security.institution_role_scope_valid(r.role,r.scope_type)
        and (
          (
            security.institution_scope_matches(
              p_institution_id,p_target_scope_type,p_target_scope_id,null
            )
            and security.institution_scope_contains(
              p_institution_id,
              r.scope_type,
              r.scope_id,
              p_target_scope_type,
              p_target_scope_id
            )
          )
          or (
            lower(p_target_scope_type)='program'
            and nullif(btrim(coalesce(p_target_scope_id,'')),'') is not null
            and lower(r.scope_type)='institution'
            and r.scope_id=p_institution_id
            and exists(
              select 1
              from public.wf_institutions i
              where i.institution_id=p_institution_id
                and i.active=true
            )
          )
        )
    ),
    false
  );
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
          count(distinct p.placement_id) as placement_count,
          count(distinct p.placement_id) filter (
            where p.status='active'
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
          count(distinct p.placement_id) as placement_count,
          count(distinct p.placement_id) filter (
            where p.status='active'
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
                  where placement.student_id=sp.student_id
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

create or replace function public.institution_cohort_upsert(
  p_institution_id text,
  p_cohort_id text default null,
  p_name text default null,
  p_program_name text default null,
  p_trade_id text default null,
  p_term text default null,
  p_graduation_date text default null,
  p_status text default 'active'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_cohort public.wf_cohorts%rowtype;
  v_cohort_id text:=nullif(btrim(coalesce(p_cohort_id,'')),'');
  v_program_key text:=coalesce(
    nullif(btrim(coalesce(p_trade_id,'')),''),
    nullif(btrim(coalesce(p_program_name,'')),'')
  );
  v_status text:=coalesce(nullif(btrim(coalesce(p_status,'')),''),'active');
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated Institution user required';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'Cohort name is required';
  end if;
  if v_program_key is null then
    raise exception 'Program name or trade is required';
  end if;
  if v_status not in ('planning','active','enrolling','in_progress','completed','paused','archived') then
    raise exception 'Invalid Cohort status';
  end if;

  if v_cohort_id is null then
    if not security.can_manage_institution_program_cohort(
      p_institution_id,'program',v_program_key
    ) then
      raise exception 'Cohort create is outside authorized Institution scope';
    end if;

    insert into public.wf_cohorts(
      institution_id,name,trade_id,program_name,term,graduation_date,status,
      created_at,updated_at
    )
    values (
      p_institution_id,
      nullif(btrim(coalesce(p_name,'')),''),
      nullif(btrim(coalesce(p_trade_id,'')),''),
      nullif(btrim(coalesce(p_program_name,'')),''),
      nullif(btrim(coalesce(p_term,'')),''),
      nullif(btrim(coalesce(p_graduation_date,'')),''),
      v_status,
      now()::text,
      now()::text
    )
    returning * into v_cohort;
  else
    select * into v_cohort
    from public.wf_cohorts c
    where c.cohort_id=v_cohort_id
      and c.institution_id=p_institution_id
    for update;
    if not found then
      raise exception 'Cohort not found in Institution scope';
    end if;
    if not security.can_manage_institution_program_cohort(
      p_institution_id,'cohort',v_cohort_id
    ) then
      raise exception 'Cohort update is outside authorized Institution scope';
    end if;
    if not security.can_manage_institution_program_cohort(
      p_institution_id,'program',v_program_key
    ) then
      raise exception 'Target Program is outside authorized Institution scope';
    end if;

    update public.wf_cohorts
    set name=nullif(btrim(coalesce(p_name,'')),''),
        trade_id=nullif(btrim(coalesce(p_trade_id,'')),''),
        program_name=nullif(btrim(coalesce(p_program_name,'')),''),
        term=nullif(btrim(coalesce(p_term,'')),''),
        graduation_date=nullif(btrim(coalesce(p_graduation_date,'')),''),
        status=v_status,
        updated_at=now()::text
    where cohort_id=v_cohort_id
      and institution_id=p_institution_id
    returning * into v_cohort;
  end if;

  return jsonb_build_object(
    'cohortId',v_cohort.cohort_id,
    'name',v_cohort.name,
    'programKey',coalesce(nullif(btrim(v_cohort.trade_id),''),nullif(btrim(v_cohort.program_name),'')),
    'programName',v_cohort.program_name,
    'tradeId',v_cohort.trade_id,
    'term',v_cohort.term,
    'graduationDate',v_cohort.graduation_date,
    'status',v_cohort.status
  );
end;
$$;

revoke all on function security.can_manage_institution_program_cohort(text,text,text)
  from public,anon,authenticated;
revoke all on function public.institution_program_cohort_management(text)
  from public,anon;
revoke all on function public.institution_cohort_upsert(text,text,text,text,text,text,text,text)
  from public,anon;

grant execute on function security.can_manage_institution_program_cohort(text,text,text)
  to service_role;
grant execute on function public.institution_program_cohort_management(text)
  to authenticated,service_role;
grant execute on function public.institution_cohort_upsert(text,text,text,text,text,text,text,text)
  to authenticated,service_role;

comment on function security.can_manage_institution_program_cohort(text,text,text) is
  'W12-05 server-side mutation guard for Institution Program/Cohort lifecycle actions.';
comment on function public.institution_program_cohort_management(text) is
  'W12-05 Institution Programs/Cohorts read model. Metrics derive from canonical records in authorized scope.';
comment on function public.institution_cohort_upsert(text,text,text,text,text,text,text,text) is
  'W12-05 scoped Cohort lifecycle mutation. Create/update requires contained Institution Program/Cohort scope.';
