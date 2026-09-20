-- Bridge legacy pre-Wave-7 Employer onboarding writes into the canonical Employer model.
-- Safe to run repeatedly.

create or replace function security.sync_wf_role_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid;
  v_scope_type text;
  v_scope_id text;
  v_canonical_role text;
begin
  select u.auth_user_id
  into v_auth
  from public.users u
  where u.user_id::text = new.user_id::text
  limit 1;

  v_scope_type :=
    case
      when nullif(trim(new.institution_id::text),'') is not null then 'institution'
      when nullif(trim(new.contractor_id::text),'') is not null
        and lower(coalesce(new.role,'')) in (
          'employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only'
        ) then 'employer'
      when nullif(trim(new.contractor_id::text),'') is not null then 'contractor'
      else 'workforce'
    end;

  v_scope_id := coalesce(
    nullif(trim(new.institution_id::text),''),
    nullif(trim(new.contractor_id::text),'')
  );

  perform security.ensure_app_role_semantic(
    'WFROLE:' || new.membership_id::text,
    v_auth,
    new.user_id::text,
    new.role::text,
    v_scope_type,
    v_scope_id,
    coalesce(nullif(trim(new.status::text),''),'active'),
    'wf_role_memberships'
  );

  v_canonical_role :=
    case lower(coalesce(new.role,''))
      when 'contractor_owner' then 'employer_owner'
      when 'contractor_recruiter' then 'recruiter'
      else null
    end;

  if v_canonical_role is not null
     and nullif(trim(new.contractor_id::text),'') is not null then
    perform security.ensure_app_role_semantic(
      'WFROLECANON:' || new.membership_id::text,
      v_auth,
      new.user_id::text,
      v_canonical_role,
      'employer',
      new.contractor_id::text,
      coalesce(nullif(trim(new.status::text),''),'active'),
      'wf_role_memberships_canonical_bridge'
    );
  end if;

  return new;
end;
$$;

create or replace function security.sync_employer_onboarding_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employer_id text;
  v_approval_status text;
begin
  if lower(coalesce(new.selected_role,'')) <> 'employer'
     or new.user_id is null then
    return new;
  end if;

  select c.contractor_id, lower(coalesce(c.approval_status,'pending'))
  into v_employer_id, v_approval_status
  from public.contractors c
  where c.owner_user_id = new.user_id
  order by c.created_at desc nulls last, c.contractor_id
  limit 1;

  if v_employer_id is not null then
    new.employer_id := coalesce(new.employer_id, v_employer_id);

    if new.status = 'complete' and v_approval_status <> 'approved' then
      new.status := 'pending_review';
      new.completed_at := null;
    elsif new.status = 'pending_review' and v_approval_status = 'approved' then
      new.status := 'complete';
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists wf_onboarding_accounts_sync_employer_link
  on public.wf_onboarding_accounts;

create trigger wf_onboarding_accounts_sync_employer_link
before insert or update of selected_role, user_id, status, employer_id
on public.wf_onboarding_accounts
for each row execute function security.sync_employer_onboarding_link();

-- Backfill Employer linkage/status for accounts created by the pre-Wave-7 app.
update public.wf_onboarding_accounts wa
set employer_id = c.contractor_id,
    status = case
      when wa.status = 'complete'
       and lower(coalesce(c.approval_status,'pending')) <> 'approved'
        then 'pending_review'
      when wa.status = 'pending_review'
       and lower(coalesce(c.approval_status,'pending')) = 'approved'
        then 'complete'
      else wa.status
    end,
    completed_at = case
      when wa.status = 'complete'
       and lower(coalesce(c.approval_status,'pending')) <> 'approved'
        then null
      when wa.status = 'pending_review'
       and lower(coalesce(c.approval_status,'pending')) = 'approved'
        then coalesce(wa.completed_at, now())
      else wa.completed_at
    end,
    updated_at = now()
from public.contractors c
where lower(coalesce(wa.selected_role,'')) = 'employer'
  and wa.user_id = c.owner_user_id
  and (
    wa.employer_id is distinct from c.contractor_id
    or (
      wa.status = 'complete'
      and lower(coalesce(c.approval_status,'pending')) <> 'approved'
    )
    or (
      wa.status = 'pending_review'
      and lower(coalesce(c.approval_status,'pending')) = 'approved'
    )
  );

-- Backfill canonical Employer aliases for active legacy Contractor memberships.
insert into public.app_role_memberships(
  membership_key, auth_user_id, user_id, role, scope_type, scope_id, status, source
)
select
  'wave7:legacy_bridge:' || r.id::text,
  r.auth_user_id,
  r.user_id,
  case lower(r.role)
    when 'contractor_owner' then 'employer_owner'
    when 'contractor_recruiter' then 'recruiter'
  end,
  'employer',
  r.scope_id,
  r.status,
  'wave7_legacy_employer_bridge'
from public.app_role_memberships r
where lower(r.role) in ('contractor_owner','contractor_recruiter')
  and lower(r.status) = 'active'
  and nullif(btrim(coalesce(r.scope_id,'')),'') is not null
  and not exists (
    select 1
    from public.app_role_memberships x
    where x.auth_user_id = r.auth_user_id
      and x.user_id = r.user_id
      and lower(x.status) = 'active'
      and lower(x.role) = case lower(r.role)
        when 'contractor_owner' then 'employer_owner'
        when 'contractor_recruiter' then 'recruiter'
      end
      and lower(x.scope_type) = 'employer'
      and x.scope_id = r.scope_id
  )
on conflict do nothing;
