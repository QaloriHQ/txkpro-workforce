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
        and lower(r.scope_type)='institution'
        and r.scope_id=p_institution_id
    ), false
  );
$$;
