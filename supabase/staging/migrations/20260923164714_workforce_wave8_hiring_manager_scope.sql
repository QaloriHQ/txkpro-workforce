drop policy if exists wave8_saved_candidates_employer_select on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_select on public.wf_saved_candidates
for select to authenticated
using (
  security.member_of_employer(employer_id)
  and (
    security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only'])
    or (
      hiring_need_id is not null
      and security.hiring_manager_can_use_need(employer_id,hiring_need_id)
    )
  )
);

drop policy if exists wave8_saved_candidates_employer_insert on public.wf_saved_candidates;
create policy wave8_saved_candidates_employer_insert on public.wf_saved_candidates
for insert to authenticated
with check (
  security.can_browse_employer_talent(employer_id)
  and (
    security.has_employer_role(employer_id,array['employer_owner','employer_admin','recruiter'])
    or (
      hiring_need_id is not null
      and security.hiring_manager_can_use_need(employer_id,hiring_need_id)
      and security.has_employer_role(employer_id,array['hiring_manager'])
    )
  )
  and (saved_by_user_id is null or saved_by_user_id=security.current_legacy_user_id())
);

create or replace function public.employer_referrals_list(
  p_employer_id text,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_hm_only boolean := security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']);
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
      and (
        not v_hm_only
        or (
          r.hiring_need_id is not null
          and security.hiring_manager_can_use_need(p_employer_id,r.hiring_need_id)
        )
      )
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
declare
  v_result jsonb;
  v_hm_only boolean := security.has_employer_role(p_employer_id,array['hiring_manager'])
    and not security.has_employer_role(p_employer_id,array['employer_owner','employer_admin','recruiter','employer_read_only']);
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
  where r.employer_id=p_employer_id
    and r.referral_id=p_referral_id
    and (
      not v_hm_only
      or (
        r.hiring_need_id is not null
        and security.hiring_manager_can_use_need(p_employer_id,r.hiring_need_id)
      )
    );

  if v_result is null then raise exception 'Referral not found'; end if;
  return v_result;
end;
$$;
