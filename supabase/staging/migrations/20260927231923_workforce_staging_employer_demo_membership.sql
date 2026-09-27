-- Staging-only demo fixture. Do not apply to production.
do $$
declare
  v_auth_user_id uuid;
  v_user_id text;
begin
  select a.id,u.user_id
  into v_auth_user_id,v_user_id
  from auth.users a
  join public.users u on u.auth_user_id=a.id
  where lower(a.email)='employer.demo@txkpro.com'
    and lower(u.email)='employer.demo@txkpro.com'
    and u.status='active'
    and a.email_confirmed_at is not null;

  if v_auth_user_id is null or v_user_id is null then
    raise exception 'Staging employer demo Auth/public user linkage missing';
  end if;
  if not exists (
    select 1 from public.contractors c
    join public.wf_contractor_profiles p on p.contractor_id=c.contractor_id
    where c.contractor_id='CON-704D9BFCBC7A'
      and c.approval_status='approved'
      and c.account_status='active'
      and p.workforce_status='approved'
  ) then
    raise exception 'Staging Acme employer is not approved';
  end if;

  perform security.ensure_app_role_semantic(
    'MEM-STG-ACME-EMPLOYER-DEMO',
    v_auth_user_id,
    v_user_id,
    'employer_admin',
    'employer',
    'CON-704D9BFCBC7A',
    'active',
    'staging_demo_fixture'
  );
end;
$$;
