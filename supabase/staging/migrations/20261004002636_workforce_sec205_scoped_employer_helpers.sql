-- SEC-205: narrow shared authorization shortcuts, without rewriting memberships.
-- Private SECURITY DEFINER lookups avoid recursive membership-table RLS.
create or replace function security.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    join public.app_role_memberships r on r.auth_user_id=u.auth_user_id
    where u.auth_user_id=(select auth.uid())
      and lower(coalesce(u.status,''))='active'
      and lower(r.status)='active'
      and lower(r.scope_type)='platform'
      and lower(r.role) in ('super_admin','admin','platform_admin')
  );
$$;

create or replace function security.has_employer_role(p_employer_id text,p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    exists (select 1 from public.users u
      where u.auth_user_id=(select auth.uid()) and lower(coalesce(u.status,''))='active')
    and (
      security.is_admin()
      or exists (
        select 1 from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and lower(r.scope_type) in ('employer','contractor')
          and r.scope_id=p_employer_id
          and lower(r.role) in ('employer_owner','employer_admin','recruiter',
            'hiring_manager','employer_read_only','contractor_owner','contractor_recruiter')
          and (
            lower(r.role)=any(select lower(x) from unnest(p_roles) x)
            or (lower(r.role)='contractor_owner' and 'employer_owner'=any(select lower(x) from unnest(p_roles) x))
            or (lower(r.role)='contractor_recruiter' and 'recruiter'=any(select lower(x) from unnest(p_roles) x))
          )
      )
      or (
        'employer_owner'=any(select lower(x) from unnest(p_roles) x)
        and exists (select 1 from public.contractors c
          where c.contractor_id=p_employer_id and c.owner_user_id=security.current_legacy_user_id())
      )
    ),false
  );
$$;

create or replace function security.member_of_employer(p_employer_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    exists (select 1 from public.users u
      where u.auth_user_id=(select auth.uid()) and lower(coalesce(u.status,''))='active')
    and (
      security.is_admin()
      or exists (select 1 from public.contractors c
        where c.contractor_id=p_employer_id and c.owner_user_id=security.current_legacy_user_id())
      or exists (select 1 from public.contractor_team_members tm
        where tm.contractor_id=p_employer_id and tm.user_id=security.current_legacy_user_id()
          and lower(coalesce(tm.status,''))='active')
      or exists (
        select 1 from public.app_role_memberships r
        where r.auth_user_id=(select auth.uid())
          and lower(r.status)='active'
          and lower(r.role) in ('employer_owner','employer_admin','recruiter',
            'hiring_manager','employer_read_only','contractor_owner','contractor_recruiter')
          and lower(r.scope_type) in ('employer','contractor')
          and r.scope_id=p_employer_id
      )
    ),false
  );
$$;

revoke all on function security.is_admin() from public,anon;
revoke all on function security.has_employer_role(text,text[]) from public,anon;
revoke all on function security.member_of_employer(text) from public,anon;
grant execute on function security.is_admin() to authenticated,service_role;
grant execute on function security.has_employer_role(text,text[]) to authenticated,service_role;
grant execute on function security.member_of_employer(text) to authenticated,service_role;
