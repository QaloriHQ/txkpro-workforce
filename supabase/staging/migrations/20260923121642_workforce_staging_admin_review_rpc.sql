create or replace function public.admin_review_employer(
  p_employer_id text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_business_name text;
  v_actor_user_id text;
begin
  if not security.is_admin() then
    raise exception 'Platform Admin access required';
  end if;

  if lower(coalesce(p_decision,'')) not in ('approved','rejected','suspended') then
    raise exception 'Invalid Employer approval decision';
  end if;

  select c.approval_status, c.business_name
  into v_previous_status, v_business_name
  from public.contractors c
  where c.contractor_id = p_employer_id
  for update;

  if not found then
    raise exception 'Employer not found';
  end if;

  v_actor_user_id := security.current_legacy_user_id();

  update public.contractors
  set approval_status = lower(p_decision),
      account_status = case
        when lower(p_decision) = 'suspended' then 'suspended'
        else account_status
      end,
      updated_at = now()
  where contractor_id = p_employer_id;

  update public.wf_contractor_profiles
  set workforce_status = case lower(p_decision)
        when 'approved' then 'approved'
        when 'rejected' then 'rejected'
        else 'suspended'
      end,
      updated_by_user_id = v_actor_user_id,
      updated_at = now()
  where contractor_id = p_employer_id;

  if lower(p_decision) in ('rejected','suspended') then
    update public.wf_onboarding_accounts
    set status = 'blocked',
        completed_at = null,
        updated_at = now()
    where employer_id = p_employer_id
      and selected_role = 'employer';
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    employer_id,
    result,
    before_json,
    after_json,
    source,
    metadata
  )
  values(
    (select auth.uid()),
    v_actor_user_id,
    'EMPLOYER_APPROVAL_REVIEWED',
    'employer',
    p_employer_id,
    p_employer_id,
    'success',
    jsonb_build_object('approvalStatus', v_previous_status),
    jsonb_build_object('approvalStatus', lower(p_decision)),
    'platform_admin_ui',
    jsonb_build_object('decision', lower(p_decision))
  );

  return jsonb_build_object(
    'employerId', p_employer_id,
    'businessName', coalesce(v_business_name,'Employer'),
    'previousStatus', v_previous_status,
    'decision', lower(p_decision)
  );
end;
$$;

revoke all on function public.admin_review_employer(text,text)
from public, anon;
grant execute on function public.admin_review_employer(text,text)
to authenticated, service_role;
