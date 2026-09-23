create or replace function security.current_student_id()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select s.student_id
  from public.wf_student_profiles s
  join public.app_role_memberships r
    on r.user_id=s.user_id
   and r.auth_user_id=(select auth.uid())
   and lower(r.role)='student'
   and lower(r.status)='active'
  where s.user_id=security.current_legacy_user_id()
  order by s.created_at nulls last,s.student_id
  limit 1;
$$;

create or replace function security.guard_student_self_provision()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if lower(new.role)='student'
     and new.auth_user_id=(select auth.uid())
     and lower(coalesce(new.source,''))='workforce_onboarding'
     and exists(
       select 1 from public.app_role_memberships r
       where r.auth_user_id=(select auth.uid())
         and lower(r.status)='active'
         and lower(r.role)<>'student'
     )
     and not security.is_admin() then
    raise exception 'Additional Student membership requires authorized provisioning';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_student_self_provision on public.app_role_memberships;
create trigger trg_guard_student_self_provision
before insert or update of role,auth_user_id,status,source
on public.app_role_memberships
for each row execute function security.guard_student_self_provision();

revoke all on function security.guard_student_self_provision() from public,anon,authenticated;
grant execute on function security.guard_student_self_provision() to service_role;
