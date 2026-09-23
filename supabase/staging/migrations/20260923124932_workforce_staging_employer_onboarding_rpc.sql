create or replace function public.save_employer_onboarding_step(
  p_current_step integer,
  p_profile_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_user_id text;
  v_existing jsonb;
  v_merged jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.user_id
  into v_user_id
  from public.users u
  where u.auth_user_id = v_auth_user_id
  limit 1;

  if v_user_id is null then
    raise exception 'Workforce account is not linked';
  end if;

  select o.profile_data
  into v_existing
  from public.wf_onboarding_accounts o
  where o.auth_user_id = v_auth_user_id
  limit 1;

  v_merged := coalesce(v_existing, '{}'::jsonb) || coalesce(p_profile_data, '{}'::jsonb);

  insert into public.wf_onboarding_accounts(
    auth_user_id,
    user_id,
    selected_role,
    status,
    current_step,
    profile_data,
    updated_at
  )
  values(
    v_auth_user_id,
    v_user_id,
    'employer',
    'in_progress',
    greatest(1, least(6, coalesce(p_current_step,1))),
    v_merged,
    now()
  )
  on conflict (auth_user_id) do update
  set selected_role = 'employer',
      status = case
        when public.wf_onboarding_accounts.status in ('pending_review','complete')
          then public.wf_onboarding_accounts.status
        else 'in_progress'
      end,
      current_step = excluded.current_step,
      profile_data = excluded.profile_data,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'role', 'employer',
    'currentStep', greatest(1, least(6, coalesce(p_current_step,1))),
    'profileData', v_merged
  );
end;
$$;

revoke all on function public.save_employer_onboarding_step(integer,jsonb)
from public, anon;
grant execute on function public.save_employer_onboarding_step(integer,jsonb)
to authenticated, service_role;

create or replace function public.complete_employer_onboarding(
  p_profile_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_user_id text;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_business_name text;
  v_contractor_id text;
  v_workforce_contractor_id text;
  v_approval_status text;
  v_status text;
  v_existing_profile jsonb;
  v_profile jsonb;
  v_now timestamptz := now();
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.user_id, u.email, u.first_name, u.last_name, u.phone
  into v_user_id, v_email, v_first_name, v_last_name, v_phone
  from public.users u
  where u.auth_user_id = v_auth_user_id
  limit 1;

  if v_user_id is null then
    raise exception 'Workforce account is not linked';
  end if;

  select o.profile_data
  into v_existing_profile
  from public.wf_onboarding_accounts o
  where o.auth_user_id = v_auth_user_id
  limit 1;

  v_profile := coalesce(v_existing_profile, '{}'::jsonb) || coalesce(p_profile_data, '{}'::jsonb);

  v_first_name := coalesce(nullif(btrim(v_profile->>'firstName'),''), v_first_name);
  v_last_name := coalesce(nullif(btrim(v_profile->>'lastName'),''), v_last_name);
  v_phone := nullif(btrim(coalesce(v_profile->>'phone', v_phone, '')),'');
  v_business_name := nullif(btrim(v_profile->>'businessName'),'');

  if v_first_name is null or btrim(v_first_name) = ''
     or v_last_name is null or btrim(v_last_name) = '' then
    raise exception 'First and last name are required';
  end if;

  if v_business_name is null then
    raise exception 'Business name is required';
  end if;

  update public.users
  set first_name = v_first_name,
      last_name = v_last_name,
      phone = v_phone,
      updated_at = v_now
  where user_id = v_user_id;

  select c.contractor_id, lower(coalesce(c.approval_status,'pending'))
  into v_contractor_id, v_approval_status
  from public.contractors c
  where c.owner_user_id = v_user_id
  order by c.created_at desc nulls last
  limit 1;

  if v_contractor_id is null then
    v_contractor_id := security.new_legacy_id('CON');

    insert into public.contractors(
      contractor_id,
      owner_user_id,
      business_name,
      business_phone,
      business_email,
      website,
      description,
      years_in_business,
      approval_status,
      account_status,
      created_at,
      updated_at,
      bridge_source_key,
      bridge_source_sheet
    )
    values(
      v_contractor_id,
      v_user_id,
      v_business_name,
      nullif(btrim(v_profile->>'businessPhone'),''),
      v_email,
      nullif(btrim(v_profile->>'website'),''),
      nullif(btrim(v_profile->>'businessDescription'),''),
      nullif(btrim(v_profile->>'yearsInBusiness'),''),
      'pending',
      'active',
      v_now,
      v_now,
      'txkpro_workforce_native:employer:' || v_contractor_id,
      'txkpro_workforce_native'
    );
    v_approval_status := 'pending';
  else
    update public.contractors
    set business_name = v_business_name,
        business_phone = nullif(btrim(v_profile->>'businessPhone'),''),
        business_email = v_email,
        website = nullif(btrim(v_profile->>'website'),''),
        description = nullif(btrim(v_profile->>'businessDescription'),''),
        years_in_business = nullif(btrim(v_profile->>'yearsInBusiness'),''),
        updated_at = v_now
    where contractor_id = v_contractor_id;
  end if;

  select p.workforce_contractor_id
  into v_workforce_contractor_id
  from public.wf_contractor_profiles p
  where p.contractor_id = v_contractor_id
  limit 1;

  if v_workforce_contractor_id is null then
    v_workforce_contractor_id := security.new_legacy_id('WFC');
    insert into public.wf_contractor_profiles(
      workforce_contractor_id,
      contractor_id,
      primary_recruiter_user_id,
      workforce_status,
      operating_base_zip,
      city,
      state,
      trade_ids_json,
      created_at,
      updated_at,
      bridge_source_key,
      bridge_source_sheet
    )
    values(
      v_workforce_contractor_id,
      v_contractor_id,
      v_user_id,
      'pending',
      nullif(btrim(v_profile->>'zipCode'),''),
      nullif(btrim(v_profile->>'city'),''),
      nullif(btrim(v_profile->>'state'),''),
      case
        when jsonb_typeof(v_profile->'tradesHiring')='array'
          then v_profile->'tradesHiring'
        else '[]'::jsonb
      end,
      v_now,
      v_now,
      'txkpro_workforce_native:workforce_contractor:' || v_workforce_contractor_id,
      'txkpro_workforce_native'
    );
  else
    update public.wf_contractor_profiles
    set operating_base_zip = nullif(btrim(v_profile->>'zipCode'),''),
        city = nullif(btrim(v_profile->>'city'),''),
        state = nullif(btrim(v_profile->>'state'),''),
        trade_ids_json = case
          when jsonb_typeof(v_profile->'tradesHiring')='array'
            then v_profile->'tradesHiring'
          else trade_ids_json
        end,
        updated_at = v_now,
        updated_by_user_id = v_user_id
    where contractor_id = v_contractor_id;
  end if;

  perform security.ensure_app_role_semantic(
    'native:' || v_user_id || ':employer_owner:employer:' || v_contractor_id,
    v_auth_user_id,
    v_user_id,
    'employer_owner',
    'employer',
    v_contractor_id,
    'active',
    'workforce_onboarding'
  );

  if not exists(
    select 1
    from public.wf_role_memberships m
    where m.user_id = v_user_id
      and lower(m.role)='employer_owner'
      and m.contractor_id = v_contractor_id
  ) then
    insert into public.wf_role_memberships(
      membership_id,
      user_id,
      role,
      contractor_id,
      status,
      created_at,
      updated_at,
      bridge_source_key,
      bridge_source_sheet
    )
    values(
      security.new_legacy_id('WRM'),
      v_user_id,
      'employer_owner',
      v_contractor_id,
      'active',
      v_now,
      v_now,
      'txkpro_workforce_native:role:' || v_user_id || ':' || v_contractor_id,
      'txkpro_workforce_native'
    );
  end if;

  select lower(coalesce(c.approval_status,'pending'))
  into v_approval_status
  from public.contractors c
  where c.contractor_id=v_contractor_id;

  v_status := case when v_approval_status='approved' then 'complete' else 'pending_review' end;

  insert into public.wf_onboarding_accounts(
    auth_user_id,
    user_id,
    selected_role,
    status,
    current_step,
    profile_data,
    employer_id,
    submitted_at,
    completed_at,
    updated_at
  )
  values(
    v_auth_user_id,
    v_user_id,
    'employer',
    v_status,
    6,
    v_profile,
    v_contractor_id,
    v_now,
    case when v_status='complete' then v_now else null end,
    v_now
  )
  on conflict (auth_user_id) do update
  set selected_role='employer',
      status=excluded.status,
      current_step=6,
      profile_data=excluded.profile_data,
      employer_id=v_contractor_id,
      submitted_at=coalesce(public.wf_onboarding_accounts.submitted_at,v_now),
      completed_at=excluded.completed_at,
      updated_at=v_now;

  insert into public.platform_audit_events(
    actor_auth_user_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    employer_id,
    result,
    source,
    metadata
  )
  values(
    v_auth_user_id,
    v_user_id,
    'workforce.onboarding.completed',
    'wf_onboarding',
    v_contractor_id,
    v_contractor_id,
    'success',
    'workforce-web',
    jsonb_build_object('selectedRole','employer','status',v_status)
  );

  return jsonb_build_object(
    'ok', true,
    'role', 'employer',
    'status', v_status,
    'entityId', v_contractor_id,
    'redirectTo', case when v_status='complete' then '/dashboard' else '/onboarding?pending=1' end
  );
end;
$$;

revoke all on function public.complete_employer_onboarding(jsonb)
from public, anon;
grant execute on function public.complete_employer_onboarding(jsonb)
to authenticated, service_role;
