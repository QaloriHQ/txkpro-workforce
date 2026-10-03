create table if not exists public.wf_student_referral_consents (
  id uuid primary key default gen_random_uuid(),
  consent_id text not null unique default security.new_legacy_id('RFC'),
  student_id text not null,
  institution_id text not null,
  status text not null default 'unknown'
    check (status in ('unknown','consented','revoked','expired')),
  consented_at timestamptz,
  revoked_at timestamptz,
  consent_source text,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, institution_id)
);

alter table public.wf_referrals
  add column if not exists referral_consent_status text,
  add column if not exists referral_consent_source text,
  add column if not exists referral_consent_checked_at timestamptz,
  add column if not exists referral_note_policy text,
  add column if not exists referral_note_visibility text not null default 'employer_visible';

create index if not exists wf_student_referral_consents_student_idx
  on public.wf_student_referral_consents(student_id, institution_id, status);

alter table public.wf_student_referral_consents enable row level security;
revoke all on table public.wf_student_referral_consents from public, anon, authenticated;
grant select on table public.wf_student_referral_consents to authenticated;
grant all on table public.wf_student_referral_consents to service_role;

drop policy if exists d05_student_referral_consents_self_read on public.wf_student_referral_consents;
create policy d05_student_referral_consents_self_read
on public.wf_student_referral_consents
for select to authenticated
using (
  exists (
    select 1
    from public.users u
    join public.wf_student_profiles s on s.user_id=u.user_id
    where u.auth_user_id=(select auth.uid())
      and s.student_id=wf_student_referral_consents.student_id
  )
);

create or replace function security.referral_note_policy_violation(p_note text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_note text := btrim(coalesce(p_note,''));
begin
  if v_note='' then return null; end if;
  if char_length(v_note)>2000 then return 'length'; end if;
  if v_note ~* '\m(ssn|social security|date of birth|dob)\M' then return 'government_identifiers'; end if;
  if v_note ~* '\m(disability|disabled|medical|diagnosis|medication|therapy|accommodation)\M' then return 'medical_or_accommodation'; end if;
  if v_note ~* '\m(criminal|arrest|conviction|probation|parole|background check)\M' then return 'criminal_history'; end if;
  if v_note ~* '\m(drug test|drug screen|substance|addiction)\M' then return 'drug_screen_or_substance'; end if;
  if v_note ~* '\m(pregnant|pregnancy|childcare|marital|spouse|religion|race|ethnicity|citizenship|immigration)\M' then return 'protected_or_regulated_personal_information'; end if;
  if v_note ~* '\m(disciplinary|discipline|suspension|expelled|incident report|safety concern)\M' then return 'institution_private_conduct_or_safety'; end if;
  if v_note ~* '\m(retention case|case note|intervention note|counseling note)\M' then return 'private_case_notes'; end if;
  if v_note ~* '\m(answer key|assessment answer|password|credential)\M' then return 'private_assessment_or_credential_material'; end if;
  if v_note ~* '(^|[^0-9])(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}([^0-9]|$)' then return 'direct_contact_details'; end if;
  if v_note ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then return 'direct_contact_details'; end if;
  return null;
end;
$$;

create or replace function security.student_referral_consent_status(
  p_student_id text,
  p_institution_id text
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  with explicit_consent as (
    select c.status, c.consent_source, c.consented_at, c.revoked_at
    from public.wf_student_referral_consents c
    where c.student_id=p_student_id
      and c.institution_id=p_institution_id
    order by c.updated_at desc
    limit 1
  ),
  profile_visibility as (
    select
      coalesce(
        nullif(lower(s.discoverability_status),''),
        case
          when lower(coalesce(s.profile_visibility,'')) in ('employer_discoverable','employer','public')
            then 'employer_discoverable'
          else lower(coalesce(s.profile_visibility,'private'))
        end
      ) as visibility
    from public.wf_student_profiles s
    where s.student_id=p_student_id
      and s.school_id=p_institution_id
    limit 1
  )
  select case
    when exists(select 1 from explicit_consent where status='consented') then
      jsonb_build_object(
        'allowed',true,
        'status','consented',
        'source',coalesce((select consent_source from explicit_consent),'student_referral_consent'),
        'consentedAt',(select consented_at from explicit_consent)
      )
    when exists(select 1 from explicit_consent where status in ('revoked','expired')) then
      jsonb_build_object(
        'allowed',false,
        'status',(select status from explicit_consent),
        'source',coalesce((select consent_source from explicit_consent),'student_referral_consent'),
        'revokedAt',(select revoked_at from explicit_consent)
      )
    when exists(select 1 from profile_visibility where visibility in ('employer_discoverable','employer','public')) then
      jsonb_build_object(
        'allowed',true,
        'status','consented',
        'source','student_profile_visibility',
        'visibility',(select visibility from profile_visibility)
      )
    else
      jsonb_build_object(
        'allowed',false,
        'status',coalesce((select visibility from profile_visibility),'unknown'),
        'source','student_profile_visibility'
      )
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
  v_consent jsonb;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_note_violation text;
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

  v_consent := security.student_referral_consent_status(p_student_id,p_institution_id);
  if coalesce((v_consent->>'allowed')::boolean,false) is not true then
    raise exception 'Student referral consent required';
  end if;

  v_note_violation := security.referral_note_policy_violation(v_note);
  if v_note_violation is not null then
    raise exception 'Referral note violates D-09 policy: %', v_note_violation;
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
    referral_consent_status,referral_consent_source,referral_consent_checked_at,
    referral_note_policy,referral_note_visibility,
    status,referred_at,delivered_at
  ) values(
    v_referral_id,p_institution_id,p_student_id,p_employer_id,p_hiring_need_id,
    security.current_legacy_user_id(),v_note,
    coalesce(v_technical,'{}'::jsonb),'{}'::jsonb,coalesce(v_operational,'{}'::jsonb),
    v_consent->>'status',v_consent->>'source',now(),
    case when v_note is null then null else 'institution_shared_referral_note_v1' end,
    'employer_visible',
    'delivered',now(),now()
  );

  perform security.emit_workforce_event(
    'REFERRAL_CREATED','referral',v_referral_id,p_employer_id,p_institution_id,p_student_id,
    null,
    jsonb_build_object(
      'status','delivered',
      'hiringNeedId',p_hiring_need_id,
      'referralConsent',v_consent,
      'notePolicy',case when v_note is null then null else 'institution_shared_referral_note_v1' end
    ),
    jsonb_build_object('source','institution_create_referral'),
    'success',
    'referral_created:'||v_referral_id,
    null
  );

  return jsonb_build_object(
    'referralId',v_referral_id,
    'status','delivered',
    'referralConsent',v_consent,
    'notePolicy',case when v_note is null then null else 'institution_shared_referral_note_v1' end
  );
end;
$$;

revoke all on function security.referral_note_policy_violation(text)
  from public,anon,authenticated;
revoke all on function security.student_referral_consent_status(text,text)
  from public,anon,authenticated;

grant execute on function security.referral_note_policy_violation(text) to service_role;
grant execute on function security.student_referral_consent_status(text,text) to service_role;
grant execute on function public.institution_create_referral(text,text,text,text,text) to authenticated,service_role;

comment on table public.wf_student_referral_consents is
  'D-05 student-controlled referral consent grants. Institution referrals require active consent or the MVP1 profile-visibility compatibility grant.';
comment on column public.wf_referrals.referral_consent_source is
  'D-05 audit provenance for the student consent/visibility rule checked before referral creation.';
comment on column public.wf_referrals.referral_note_policy is
  'D-09 policy tag for employer-visible Institution referral notes.';
comment on function security.referral_note_policy_violation(text) is
  'D-09 guardrail: returns a policy reason when employer-visible referral notes contain prohibited private, regulated, contact, or assessment content.';
comment on function security.student_referral_consent_status(text,text) is
  'D-05 guardrail: returns whether a student has approved employer referral visibility for an Institution referral.';
comment on function public.institution_create_referral(text,text,text,text,text) is
  'Creates an Institution referral only after D-05 student referral consent and D-09 employer-visible note policy checks. Employer-private notes remain in wf_employer_candidate_notes.';
