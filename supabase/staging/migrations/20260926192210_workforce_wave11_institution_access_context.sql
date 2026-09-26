-- W11-06 follow-up: resolve Institution workspace access from scoped memberships.

create or replace function public.institution_learning_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated Institution user required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'institutionId',x.institution_id,
      'institutionName',x.institution_name,
      'roles',x.roles,
      'scopes',x.scopes
    ) order by x.institution_name,x.institution_id)
    from (
      select
        i.institution_id,
        coalesce(i.name,i.short_name,i.institution_id) as institution_name,
        jsonb_agg(distinct lower(r.role)) as roles,
        jsonb_agg(distinct jsonb_build_object(
          'scopeType',lower(r.scope_type),
          'scopeId',r.scope_id,
          'role',lower(r.role)
        )) as scopes
      from public.app_role_memberships r
      join public.wf_institutions i
        on i.active=true
       and (
         (lower(r.scope_type)='institution' and i.institution_id=r.scope_id)
         or (
           lower(r.scope_type)='cohort'
           and exists(
             select 1 from public.wf_cohorts c
             where c.cohort_id=r.scope_id
               and c.institution_id=i.institution_id
           )
         )
         or (
           lower(r.scope_type)='program'
           and exists(
             select 1 from public.wf_cohorts c
             where c.institution_id=i.institution_id
               and (
                 lower(coalesce(c.trade_id,''))=lower(r.scope_id)
                 or lower(coalesce(c.program_name,''))=lower(r.scope_id)
               )
           )
         )
       )
      where r.auth_user_id=(select auth.uid())
        and lower(r.status)='active'
        and lower(r.role) in (
          'institution_admin','department_head','program_coordinator',
          'instructor','assistant_instructor','career_services',
          'read_only_analyst','educator'
        )
      group by i.institution_id,i.name,i.short_name
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.institution_learning_access_context()
from public,anon;
grant execute on function public.institution_learning_access_context()
to authenticated,service_role;
