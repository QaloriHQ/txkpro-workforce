-- Staging retains the applied two-argument D-01 policy. Add the scoped overload
-- required by invitations while preserving that policy's role boundaries.
create or replace function security.can_approve_institution_member(
  p_institution_id text,p_target_role text,p_target_scope_type text,p_target_scope_id text
) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    security.can_approve_institution_member(p_institution_id,p_target_role)
    and security.institution_role_scope_valid(p_target_role,p_target_scope_type)
    and security.institution_scope_matches(p_institution_id,p_target_scope_type,p_target_scope_id,null)
    and (security.is_admin() or exists(
      select 1 from public.app_role_memberships r
      where r.auth_user_id=(select auth.uid()) and lower(r.status)='active'
        and security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin')
        and security.institution_role_scope_valid(r.role,r.scope_type)
        and security.institution_scope_contains(p_institution_id,r.scope_type,r.scope_id,p_target_scope_type,p_target_scope_id)
    )),false
  );
$$;
revoke all on function security.can_approve_institution_member(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function security.can_approve_institution_member(text,text,text,text) to service_role;
