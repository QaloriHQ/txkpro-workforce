create table if not exists public.wf_institutions (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null unique default security.new_legacy_id('INS'),
  name text,
  short_name text,
  institution_type text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

create table if not exists public.wf_cohorts (
  id uuid primary key default gen_random_uuid(),
  cohort_id text not null unique default security.new_legacy_id('COH'),
  institution_id text,
  name text,
  trade_id text,
  program_name text,
  term text,
  graduation_date text,
  status text,
  created_at text,
  updated_at text,
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

create table if not exists public.wf_student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique default security.new_legacy_id('STU'),
  user_id text,
  profile_status text,
  profile_visibility text,
  first_name_public text,
  last_initial_public text,
  preferred_name text,
  program_type text,
  school_id text,
  cohort_id text,
  graduation_year text,
  graduation_date text,
  education_level text,
  zip_code text,
  city text,
  state text,
  county text,
  primary_trade_id text,
  secondary_trade_ids_json jsonb,
  availability_status text,
  available_start_date text,
  employment_preferences_json jsonb,
  about text,
  institution_validation_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

alter table public.wf_student_profiles
  add column if not exists discoverability_status text;

create table if not exists public.wf_student_logistics (
  id uuid primary key default gen_random_uuid(),
  logistics_id text not null unique default security.new_legacy_id('LOG'),
  student_id text,
  driver_license_status text,
  reliable_transit text,
  own_vehicle text,
  basic_hand_tools text,
  trade_specific_tools text,
  ppe_ready text,
  work_boots text,
  smartphone_access text,
  night_shift_available text,
  weekend_available text,
  notes_private text,
  updated_at text,
  bridge_source_key text not null default ('txkpro_native:' || gen_random_uuid()::text),
  bridge_source_sheet text not null default 'txkpro_native',
  bridge_source_row integer,
  bridge_row_checksum text,
  bridge_migrated_at timestamptz not null default now()
);

alter table public.wf_student_logistics
  add column if not exists driving_record_attestation boolean,
  add column if not exists background_screen_willingness boolean,
  add column if not exists drug_screen_willingness boolean,
  add column if not exists work_types_json jsonb not null default '[]'::jsonb,
  add column if not exists shifts_json jsonb not null default '[]'::jsonb,
  add column if not exists provenance_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_by_user_id text;

create table if not exists public.wf_skill_catalog (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null unique default security.new_legacy_id('SKL'),
  institution_id text,
  trade_id text,
  category text,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_student_skills (
  id uuid primary key default gen_random_uuid(),
  student_skill_id text not null unique default security.new_legacy_id('SSK'),
  student_id text not null,
  skill_id text not null,
  status text not null default 'not_started'
    check (status in ('not_started','self_attested','in_progress','ready_for_review','verified','needs_practice','revoked')),
  provenance text not null default 'not_verified'
    check (provenance in ('self_attested','institution_verified','third_party_verified','not_verified')),
  self_attested_at timestamptz,
  verified_by_user_id text,
  verified_at timestamptz,
  revoked_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, skill_id)
);

create table if not exists public.wf_employer_talent_scopes (
  id uuid primary key default gen_random_uuid(),
  talent_scope_id text not null unique default security.new_legacy_id('ETS'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  institution_id text,
  cohort_id text,
  trade_id text,
  program_name text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_saved_candidates (
  id uuid primary key default gen_random_uuid(),
  saved_candidate_id text not null unique default security.new_legacy_id('SAV'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  student_id text not null,
  hiring_need_id text,
  saved_by_user_id text,
  owner_user_id text,
  internal_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employer_id, student_id, hiring_need_id)
);

create table if not exists public.wf_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_id text not null unique default security.new_legacy_id('REF'),
  institution_id text not null,
  student_id text not null,
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  hiring_need_id text,
  created_by_user_id text,
  institution_shared_note text,
  technical_snapshot jsonb not null default '{}'::jsonb,
  professional_snapshot jsonb not null default '{}'::jsonb,
  operational_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'referred'
    check (status in ('draft','referred','delivered','viewed','interview_requested','interview_accepted','interview_declined','hired','closed','expired')),
  referred_at timestamptz,
  delivered_at timestamptz,
  viewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_employer_candidate_notes (
  id uuid primary key default gen_random_uuid(),
  note_id text not null unique default security.new_legacy_id('ECN'),
  employer_id text not null references public.contractors(contractor_id) on delete cascade,
  student_id text not null,
  referral_id text,
  created_by_user_id text,
  note text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_student_profiles_discoverability_idx
  on public.wf_student_profiles(discoverability_status, school_id, cohort_id, primary_trade_id);
create index if not exists wf_student_logistics_student_idx
  on public.wf_student_logistics(student_id);
create index if not exists wf_student_skills_student_status_idx
  on public.wf_student_skills(student_id, status, skill_id);
create index if not exists wf_skill_catalog_trade_idx
  on public.wf_skill_catalog(trade_id, active);
create index if not exists wf_employer_talent_scopes_employer_idx
  on public.wf_employer_talent_scopes(employer_id, active, institution_id, cohort_id);
create index if not exists wf_saved_candidates_employer_idx
  on public.wf_saved_candidates(employer_id, updated_at desc);
create index if not exists wf_referrals_employer_status_idx
  on public.wf_referrals(employer_id, status, updated_at desc);
create index if not exists wf_referrals_student_idx
  on public.wf_referrals(student_id, updated_at desc);
create index if not exists wf_referrals_institution_idx
  on public.wf_referrals(institution_id, updated_at desc);
create index if not exists wf_employer_candidate_notes_employer_student_idx
  on public.wf_employer_candidate_notes(employer_id, student_id, created_at desc);

create or replace function security.has_institution_scope(p_institution_id text)
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
          'instructor','assistant_instructor','career_services','educator'
        )
        and lower(r.scope_type) in ('institution','department','program','cohort')
        and (
          r.scope_id=p_institution_id
          or lower(r.scope_type) in ('department','program','cohort')
        )
    ), false
  );
$$;

create or replace function security.can_browse_employer_talent(p_employer_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    security.employer_is_approved(p_employer_id)
    and security.has_employer_role(
      p_employer_id,
      array['employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only']
    ),
    false
  );
$$;

create or replace function security.hiring_manager_can_use_need(
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
      array['employer_owner','employer_admin','recruiter','employer_read_only']
    )
    or exists(
      select 1
      from public.wf_hiring_needs h
      where h.employer_id=p_employer_id
        and h.hiring_need_id=p_hiring_need_id
        and h.assigned_hiring_manager_user_id=security.current_legacy_user_id()
        and security.has_employer_role(p_employer_id,array['hiring_manager'])
    ),
    false
  );
$$;

create or replace function public.employer_talent_search(
  p_employer_id text,
  p_hiring_need_id text default null,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_user_id text := security.current_legacy_user_id();
  v_is_hiring_manager boolean := security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter']);
  v_need public.wf_hiring_needs%rowtype;
begin
  if not security.can_browse_employer_talent(p_employer_id) then
    raise exception 'Approved Employer talent access required';
  end if;

  if p_hiring_need_id is not null then
    select * into v_need
    from public.wf_hiring_needs h
    where h.employer_id=p_employer_id
      and h.hiring_need_id=p_hiring_need_id;
    if not found then raise exception 'Hiring Need not found'; end if;
  end if;

  if v_is_hiring_manager then
    if p_hiring_need_id is null
       or not security.hiring_manager_can_use_need(p_employer_id,p_hiring_need_id) then
      raise exception 'Hiring Manager talent access requires an assigned Hiring Need';
    end if;
  end if;

  select coalesce(jsonb_agg(candidate order by candidate->>'displayName'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'studentId', s.student_id,
      'displayName', concat_ws(' ',
        coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
        nullif(s.last_initial_public,'')
      ),
      'institutionId', s.school_id,
      'institutionName', i.name,
      'cohortId', s.cohort_id,
      'program', coalesce(c.program_name,s.program_type),
      'graduationDate', coalesce(s.graduation_date,c.graduation_date),
      'graduationYear', s.graduation_year,
      'city', s.city,
      'state', s.state,
      'primaryTradeId', s.primary_trade_id,
      'availabilityStatus', s.availability_status,
      'availableStartDate', s.available_start_date,
      'verifiedSkillCount', (
        select count(*) from public.wf_student_skills ss
        where ss.student_id=s.student_id and ss.status='verified'
      ),
      'verifiedSkills', coalesce((
        select jsonb_agg(jsonb_build_object(
          'skillId',sc.skill_id,
          'name',sc.name,
          'category',sc.category,
          'tradeId',sc.trade_id,
          'provenance',ss.provenance,
          'verifiedAt',ss.verified_at
        ) order by sc.name)
        from public.wf_student_skills ss
        join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
        where ss.student_id=s.student_id and ss.status='verified'
      ),'[]'::jsonb),
      'readiness', jsonb_build_object(
        'driversLicense', l.driver_license_status,
        'drivingRecordAttestation', l.driving_record_attestation,
        'backgroundScreenWillingness', l.background_screen_willingness,
        'drugScreenWillingness', l.drug_screen_willingness,
        'workTypes', coalesce(l.work_types_json,'[]'::jsonb),
        'shifts', coalesce(l.shifts_json,'[]'::jsonb),
        'provenance', coalesce(l.provenance_json,'{}'::jsonb)
      ),
      'savedCandidateId', (
        select sc.saved_candidate_id
        from public.wf_saved_candidates sc
        where sc.employer_id=p_employer_id and sc.student_id=s.student_id
          and (p_hiring_need_id is null or sc.hiring_need_id is null or sc.hiring_need_id=p_hiring_need_id)
        order by sc.updated_at desc limit 1
      ),
      'referralStatus', (
        select r.status
        from public.wf_referrals r
        where r.employer_id=p_employer_id and r.student_id=s.student_id
          and (p_hiring_need_id is null or r.hiring_need_id is null or r.hiring_need_id=p_hiring_need_id)
        order by r.updated_at desc limit 1
      ),
      'hiringNeedFit', case when p_hiring_need_id is null then null else jsonb_build_object(
        'hiringNeedId',v_need.hiring_need_id,
        'title',v_need.title,
        'trade', case when v_need.trade_id is null then true else s.primary_trade_id=v_need.trade_id end,
        'minimumVerifiedSkills', (
          select count(*) from public.wf_student_skills ss
          where ss.student_id=s.student_id and ss.status='verified'
        ) >= coalesce(v_need.minimum_verified_skill_count,0),
        'requiredSkills', not exists(
          select 1
          from jsonb_array_elements_text(coalesce(v_need.required_verified_skills_json,'[]'::jsonb)) req(skill_id)
          where not exists(
            select 1 from public.wf_student_skills ss
            where ss.student_id=s.student_id and ss.skill_id=req.skill_id and ss.status='verified'
          )
        ),
        'driversLicense', (not v_need.requires_drivers_license)
          or lower(coalesce(l.driver_license_status,'')) in ('valid','current','yes'),
        'drivingRecordAttestation', (not v_need.requires_driving_record_attestation)
          or l.driving_record_attestation is true,
        'backgroundWillingness', (not v_need.requires_background_willingness)
          or l.background_screen_willingness is true,
        'drugScreenWillingness', (not v_need.requires_drug_screen_willingness)
          or l.drug_screen_willingness is true
      ) end
    ) as candidate
    from public.wf_student_profiles s
    left join public.wf_institutions i on i.institution_id=s.school_id
    left join public.wf_cohorts c on c.cohort_id=s.cohort_id
    left join public.wf_student_logistics l on l.student_id=s.student_id
    where coalesce(
      nullif(lower(s.discoverability_status),''),
      case when lower(coalesce(s.profile_visibility,'')) in ('employer_discoverable','employer','public')
        then 'employer_discoverable' else lower(coalesce(s.profile_visibility,'private')) end
    )='employer_discoverable'
      and lower(coalesce(s.profile_status,'active')) in ('active','graduated')
      and exists(
        select 1 from public.wf_employer_talent_scopes ts
        where ts.employer_id=p_employer_id
          and ts.active=true
          and (ts.starts_at is null or ts.starts_at<=now())
          and (ts.ends_at is null or ts.ends_at>now())
          and (ts.institution_id is null or ts.institution_id=s.school_id)
          and (ts.cohort_id is null or ts.cohort_id=s.cohort_id)
          and (ts.trade_id is null or ts.trade_id=s.primary_trade_id)
          and (ts.program_name is null or lower(ts.program_name)=lower(coalesce(c.program_name,s.program_type,'')))
      )
      and (p_filters->>'studentId' is null or s.student_id=p_filters->>'studentId')
      and (p_filters->>'institutionId' is null or s.school_id=p_filters->>'institutionId')
      and (p_filters->>'program' is null or lower(coalesce(c.program_name,s.program_type,''))=lower(p_filters->>'program'))
      and (p_filters->>'graduation' is null or
        coalesce(s.graduation_date,s.graduation_year,c.graduation_date,'') ilike '%' || (p_filters->>'graduation') || '%')
      and (p_filters->>'location' is null or
        (coalesce(s.city,'') || ' ' || coalesce(s.state,'') || ' ' || coalesce(s.zip_code,'')) ilike '%' || (p_filters->>'location') || '%')
      and (
        coalesce((p_filters->>'minVerifiedSkillCount')::integer,0)=0
        or (
          select count(*) from public.wf_student_skills ss
          where ss.student_id=s.student_id and ss.status='verified'
        ) >= coalesce((p_filters->>'minVerifiedSkillCount')::integer,0)
      )
      and (
        p_filters->'skillIds' is null
        or not exists(
          select 1
          from jsonb_array_elements_text(p_filters->'skillIds') req(skill_id)
          where not exists(
            select 1 from public.wf_student_skills ss
            where ss.student_id=s.student_id and ss.skill_id=req.skill_id and ss.status='verified'
          )
        )
      )
      and (
        coalesce((p_filters->>'driversLicense')::boolean,false)=false
        or lower(coalesce(l.driver_license_status,'')) in ('valid','current','yes')
      )
      and (
        coalesce((p_filters->>'drivingRecordAttestation')::boolean,false)=false
        or l.driving_record_attestation is true
      )
      and (
        coalesce((p_filters->>'backgroundWillingness')::boolean,false)=false
        or l.background_screen_willingness is true
      )
      and (
        coalesce((p_filters->>'drugScreenWillingness')::boolean,false)=false
        or l.drug_screen_willingness is true
      )
      and (
        p_filters->>'workType' is null
        or coalesce(l.work_types_json,'[]'::jsonb) ? (p_filters->>'workType')
      )
      and (
        p_filters->>'shift' is null
        or coalesce(l.shifts_json,'[]'::jsonb) ? (p_filters->>'shift')
      )
      and (
        p_filters->>'referralState' is null
        or (
          p_filters->>'referralState'='none'
          and not exists(
            select 1 from public.wf_referrals rr
            where rr.employer_id=p_employer_id and rr.student_id=s.student_id
          )
        )
        or exists(
          select 1 from public.wf_referrals rr
          where rr.employer_id=p_employer_id
            and rr.student_id=s.student_id
            and rr.status=p_filters->>'referralState'
        )
      )
  ) q;

  return v_result;
end;
$$;

create or replace function public.employer_referrals_list(
  p_employer_id text,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not security.can_browse_employer_talent(p_employer_id) then
    raise exception 'Approved Employer referral access required';
  end if;

  select coalesce(jsonb_agg(x order by x->>'updatedAt' desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'referralId',r.referral_id,
      'studentId',r.student_id,
      'studentName',concat_ws(' ',
        coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
        nullif(s.last_initial_public,'')
      ),
      'institutionId',r.institution_id,
      'institutionName',i.name,
      'program',coalesce(c.program_name,s.program_type),
      'primaryTradeId',s.primary_trade_id,
      'hiringNeedId',r.hiring_need_id,
      'hiringNeedTitle',h.title,
      'status',r.status,
      'institutionSharedNote',r.institution_shared_note,
      'referredAt',r.referred_at,
      'viewedAt',r.viewed_at,
      'updatedAt',r.updated_at
    ) x
    from public.wf_referrals r
    join public.wf_student_profiles s on s.student_id=r.student_id
    left join public.wf_institutions i on i.institution_id=r.institution_id
    left join public.wf_cohorts c on c.cohort_id=s.cohort_id
    left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
    where r.employer_id=p_employer_id
      and (p_status is null or r.status=p_status)
  ) q;
  return v_result;
end;
$$;

create or replace function public.employer_referral_detail(
  p_employer_id text,
  p_referral_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not security.can_browse_employer_talent(p_employer_id) then
    raise exception 'Approved Employer referral access required';
  end if;

  select jsonb_build_object(
    'referralId',r.referral_id,
    'studentId',r.student_id,
    'studentName',concat_ws(' ',
      coalesce(nullif(s.preferred_name,''),nullif(s.first_name_public,''),'Student'),
      nullif(s.last_initial_public,'')
    ),
    'institutionId',r.institution_id,
    'institutionName',i.name,
    'program',coalesce(c.program_name,s.program_type),
    'primaryTradeId',s.primary_trade_id,
    'hiringNeedId',r.hiring_need_id,
    'hiringNeedTitle',h.title,
    'status',r.status,
    'institutionSharedNote',r.institution_shared_note,
    'technicalSnapshot',r.technical_snapshot,
    'professionalSnapshot',r.professional_snapshot,
    'operationalSnapshot',r.operational_snapshot,
    'referredAt',r.referred_at,
    'viewedAt',r.viewed_at,
    'updatedAt',r.updated_at,
    'privateNotes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'noteId',n.note_id,
        'note',n.note,
        'createdByUserId',n.created_by_user_id,
        'createdAt',n.created_at
      ) order by n.created_at desc)
      from public.wf_employer_candidate_notes n
      where n.employer_id=p_employer_id
        and n.student_id=r.student_id
        and (n.referral_id is null or n.referral_id=r.referral_id)
    ),'[]'::jsonb)
  )
  into v_result
  from public.wf_referrals r
  join public.wf_student_profiles s on s.student_id=r.student_id
  left join public.wf_institutions i on i.institution_id=r.institution_id
  left join public.wf_cohorts c on c.cohort_id=s.cohort_id
  left join public.wf_hiring_needs h on h.hiring_need_id=r.hiring_need_id
  where r.employer_id=p_employer_id and r.referral_id=p_referral_id;

  if v_result is null then raise exception 'Referral not found'; end if;
  return v_result;
end;
$$;

create or replace function public.employer_mark_referral_viewed(
  p_employer_id text,
  p_referral_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.wf_referrals%rowtype;
  v_before text;
begin
  if not security.can_browse_employer_talent(p_employer_id) then
    raise exception 'Approved Employer referral access required';
  end if;

  select * into v_row
  from public.wf_referrals
  where employer_id=p_employer_id and referral_id=p_referral_id
  for update;

  if not found then raise exception 'Referral not found'; end if;
  v_before:=v_row.status;

  if v_row.status in ('referred','delivered') then
    update public.wf_referrals
    set status='viewed',
        viewed_at=coalesce(viewed_at,now()),
        updated_at=now()
    where referral_id=p_referral_id
    returning * into v_row;

    perform security.emit_workforce_event(
      'REFERRAL_VIEWED','referral',v_row.referral_id,p_employer_id,v_row.institution_id,v_row.student_id,
      jsonb_build_object('status',v_before),
      jsonb_build_object('status',v_row.status,'viewedAt',v_row.viewed_at),
      jsonb_build_object('source','employer_referral_detail'),
      'success',
      'referral_viewed:'||v_row.referral_id,
      null
    );
  end if;

  return public.employer_referral_detail(p_employer_id,p_referral_id);
end;
$$;

create or replace function public.employer_close_referral(
  p_employer_id text,
  p_referral_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.wf_referrals%rowtype;
begin
  if not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager']) then
    raise exception 'Employer mutation access required';
  end if;

  update public.wf_referrals
  set status='closed',closed_at=now(),updated_at=now()
  where employer_id=p_employer_id
    and referral_id=p_referral_id
    and status not in ('hired','closed','expired')
  returning * into v_row;

  if not found then
    select * into v_row from public.wf_referrals
    where employer_id=p_employer_id and referral_id=p_referral_id;
    if not found then raise exception 'Referral not found'; end if;
  end if;

  return public.employer_referral_detail(p_employer_id,p_referral_id);
end;
$$;

create or replace function public.institution_create_referral(
  p_institution_id text,
  p_student_id text,
  p_employer_id text,
  p_hiring_need_id text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student public.wf_student_profiles%rowtype;
  v_referral_id text:=security.new_legacy_id('REF');
  v_technical jsonb;
  v_operational jsonb;
begin
  if not security.has_institution_scope(p_institution_id) then
    raise exception 'Institution referral permission required';
  end if;

  if not security.employer_is_approved(p_employer_id) then
    raise exception 'Employer is not approved';
  end if;

  select * into v_student from public.wf_student_profiles
  where student_id=p_student_id and school_id=p_institution_id;
  if not found then raise exception 'Student not found in Institution scope'; end if;

  if coalesce(
      nullif(lower(v_student.discoverability_status),''),
      lower(coalesce(v_student.profile_visibility,'private'))
    ) not in ('employer_discoverable','employer','public') then
    raise exception 'Student is not Employer-discoverable';
  end if;

  select jsonb_build_object(
    'verifiedSkillCount',count(*),
    'verifiedSkills',coalesce(jsonb_agg(jsonb_build_object(
      'skillId',sc.skill_id,'name',sc.name,'provenance',ss.provenance,'verifiedAt',ss.verified_at
    ) order by sc.name),'[]'::jsonb)
  )
  into v_technical
  from public.wf_student_skills ss
  join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id
  where ss.student_id=p_student_id and ss.status='verified';

  select jsonb_build_object(
    'driversLicense',l.driver_license_status,
    'drivingRecordAttestation',l.driving_record_attestation,
    'backgroundScreenWillingness',l.background_screen_willingness,
    'drugScreenWillingness',l.drug_screen_willingness,
    'workTypes',coalesce(l.work_types_json,'[]'::jsonb),
    'shifts',coalesce(l.shifts_json,'[]'::jsonb),
    'provenance',coalesce(l.provenance_json,'{}'::jsonb)
  )
  into v_operational
  from public.wf_student_logistics l
  where l.student_id=p_student_id
  limit 1;

  insert into public.wf_referrals(
    referral_id,institution_id,student_id,employer_id,hiring_need_id,created_by_user_id,
    institution_shared_note,technical_snapshot,professional_snapshot,operational_snapshot,
    status,referred_at,delivered_at
  ) values(
    v_referral_id,p_institution_id,p_student_id,p_employer_id,p_hiring_need_id,
    security.current_legacy_user_id(),nullif(btrim(coalesce(p_note,'')),''),
    coalesce(v_technical,'{}'::jsonb),'{}'::jsonb,coalesce(v_operational,'{}'::jsonb),
    'delivered',now(),now()
  );

  perform security.emit_workforce_event(
    'REFERRAL_CREATED','referral',v_referral_id,p_employer_id,p_institution_id,p_student_id,
    null,
    jsonb_build_object('status','delivered','hiringNeedId',p_hiring_need_id),
    jsonb_build_object('source','institution_create_referral'),
    'success',
    'referral_created:'||v_referral_id,
    null
  );

  return jsonb_build_object('referralId',v_referral_id,'status','delivered');
end;
$$;

alter table public.wf_institutions enable row level security;
alter table public.wf_cohorts enable row level security;
alter table public.wf_student_profiles enable row level security;
alter table public.wf_student_logistics enable row level security;
alter table public.wf_skill_catalog enable row level security;
alter table public.wf_student_skills enable row level security;
alter table public.wf_employer_talent_scopes enable row level security;
alter table public.wf_saved_candidates enable row level security;
alter table public.wf_referrals enable row level security;
alter table public.wf_employer_candidate_notes enable row level security;

drop policy if exists wave8_institutions_admin_read on public.wf_institutions;
create policy wave8_institutions_admin_read on public.wf_institutions
for select to authenticated
using (security.is_admin());

drop policy if exists wave8_cohorts_admin_read on public.wf_cohorts;
create policy wave8_cohorts_admin_read on public.wf_cohorts
for select to authenticated
using (security.is_admin());

drop policy if exists wave8_skill_catalog_admin_read on public.wf_skill_catalog;
create policy wave8_skill_catalog_admin_read on public.wf_skill_catalog
for select to authenticated
using (security.is_admin());

drop policy if exists wave8_saved_candidates_employer_select on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_select on public.wf_saved_candidates
for select to authenticated
using (security.member_of_employer(employer_id));

drop policy if exists wave8_saved_candidates_employer_insert on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_insert on public.wf_saved_candidates
for insert to authenticated
with check (
  security.can_browse_employer_talent(employer_id)
  and security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager'])
  and (saved_by_user_id is null or saved_by_user_id=security.current_legacy_user_id())
  and (
    hiring_need_id is null
    or security.hiring_manager_can_use_need(employer_id,hiring_need_id)
  )
);

drop policy if exists wave8_saved_candidates_employer_update on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_update on public.wf_saved_candidates
for update to authenticated
using (
  security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager'])
)
with check (
  security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager'])
);

drop policy if exists wave8_saved_candidates_employer_delete on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_delete on public.wf_saved_candidates
for delete to authenticated
using (
  security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager'])
);

drop policy if exists wave8_referrals_employer_read on public.wf_referrals;
create policy wave8_referrals_employer_read on public.wf_referrals
for select to authenticated
using (
  security.member_of_employer(employer_id)
  or security.has_institution_scope(institution_id)
);

drop policy if exists wave8_notes_employer_read on public.wf_employer_candidate_notes;
create policy wave8_notes_employer_read on public.wf_employer_candidate_notes
for select to authenticated
using (security.member_of_employer(employer_id));

drop policy if exists wave8_notes_employer_insert on public.wf_employer_candidate_notes;
create policy wave8_notes_employer_insert on public.wf_employer_candidate_notes
for insert to authenticated
with check (
  security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','hiring_manager'])
  and (created_by_user_id is null or created_by_user_id=security.current_legacy_user_id())
);

drop policy if exists wave8_notes_employer_update on public.wf_employer_candidate_notes;
create policy wave8_notes_employer_update on public.wf_employer_candidate_notes
for update to authenticated
using (created_by_user_id=security.current_legacy_user_id() or security.has_employer_role(employer_id,array['employer_owner','employer_admin']))
with check (security.member_of_employer(employer_id));

drop policy if exists wave8_notes_employer_delete on public.wf_employer_candidate_notes;
create policy wave8_notes_employer_delete on public.wf_employer_candidate_notes
for delete to authenticated
using (created_by_user_id=security.current_legacy_user_id() or security.has_employer_role(employer_id,array['employer_owner','employer_admin']));

grant select on public.wf_saved_candidates,public.wf_referrals,public.wf_employer_candidate_notes to authenticated;
grant insert,update,delete on public.wf_saved_candidates,public.wf_employer_candidate_notes to authenticated;

grant execute on function public.employer_talent_search(text,text,jsonb) to authenticated,service_role;
grant execute on function public.employer_referrals_list(text,text) to authenticated,service_role;
grant execute on function public.employer_referral_detail(text,text) to authenticated,service_role;
grant execute on function public.employer_mark_referral_viewed(text,text) to authenticated,service_role;
grant execute on function public.employer_close_referral(text,text) to authenticated,service_role;
grant execute on function public.institution_create_referral(text,text,text,text,text) to authenticated,service_role;
grant execute on function security.has_institution_scope(text) to authenticated,service_role;
grant execute on function security.can_browse_employer_talent(text) to authenticated,service_role;
grant execute on function security.hiring_manager_can_use_need(text,text) to authenticated,service_role;
