create or replace function security.employer_is_approved(p_employer_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists(
    select 1
    from public.contractors c
    where c.contractor_id = p_employer_id
      and lower(coalesce(c.approval_status,'')) = 'approved'
      and lower(coalesce(c.account_status,'active')) = 'active'
  ), false);
$$;

revoke all on function security.employer_is_approved(text) from public;
grant execute on function security.employer_is_approved(text) to authenticated, service_role;

drop policy if exists wf_hiring_needs_employer_insert on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_insert
on public.wf_hiring_needs
for insert
to authenticated
with check (
  security.employer_is_approved(employer_id)
  and security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
  and (
    created_by_user_id is null
    or created_by_user_id = security.current_legacy_user_id()
  )
);

drop policy if exists wf_hiring_needs_employer_update on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_update
on public.wf_hiring_needs
for update
to authenticated
using (
  security.employer_is_approved(employer_id)
  and (
    security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    or (
      security.has_employer_role(employer_id, array['hiring_manager'])
      and assigned_hiring_manager_user_id = security.current_legacy_user_id()
    )
  )
)
with check (
  security.employer_is_approved(employer_id)
  and (
    security.has_employer_role(employer_id, array['employer_owner','employer_admin','recruiter'])
    or (
      security.has_employer_role(employer_id, array['hiring_manager'])
      and assigned_hiring_manager_user_id = security.current_legacy_user_id()
    )
  )
);

drop policy if exists wf_hiring_needs_employer_delete on public.wf_hiring_needs;
create policy wf_hiring_needs_employer_delete
on public.wf_hiring_needs
for delete
to authenticated
using (
  security.employer_is_approved(employer_id)
  and security.has_employer_role(employer_id, array['employer_owner','employer_admin'])
);

revoke all on function security.emit_hiring_need_event() from public, anon, authenticated;
revoke all on function security.emit_employer_approval_event() from public, anon, authenticated;
