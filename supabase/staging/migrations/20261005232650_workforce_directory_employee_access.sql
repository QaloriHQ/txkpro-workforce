-- Owner-approved bounded #76 expansion. Employee membership never creates a legacy team grant.
create function security.employee_member(e text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.app_role_memberships m join public.users u on u.user_id=m.user_id
 join public.contractors c on c.contractor_id=m.scope_id where u.auth_user_id=auth.uid() and m.auth_user_id=auth.uid()
 and lower(u.status)='active' and lower(m.status)='active' and m.role='employer_employee' and m.scope_type='employer'
 and m.scope_id=e and lower(c.account_status)='active');
$$;
alter function security.user_invitation_actor_can_manage(text,text,text,text,text) rename to user_invitation_actor_can_manage_before_employees;
create function security.user_invitation_actor_can_manage(p_role text,p_scope_type text,p_scope_id text,p_institution_id text,p_employer_id text)
returns boolean language sql stable security definer set search_path='' as $$
select case when lower(p_role)='employer_employee' then p_institution_id is null and p_employer_id is not null
 and lower(p_scope_type)='employer' and p_scope_id=p_employer_id
 and exists(select 1 from public.contractors where contractor_id=p_employer_id and lower(account_status)='active')
 and security.has_employer_role(p_employer_id,array['employer_owner','employer_admin'])
else security.user_invitation_actor_can_manage_before_employees(p_role,p_scope_type,p_scope_id,p_institution_id,p_employer_id) end;
$$;
alter function security.user_invitation_accept(text) rename to user_invitation_accept_before_employees;
create function security.user_invitation_accept(p_invitation_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.wf_user_invitations%rowtype; u public.users%rowtype; result jsonb;
begin
 select * into i from public.wf_user_invitations where invitation_id=p_invitation_id for update;
 if i.role is distinct from 'employer_employee' then return security.user_invitation_accept_before_employees(p_invitation_id);end if;
 if auth.uid() is null or security.current_auth_email() is distinct from i.email_normalized then raise exception 'Invitation recipient mismatch';end if;
 if i.scope_type<>'employer' or i.institution_id is not null or i.scope_id is distinct from i.employer_id
 or not exists(select 1 from public.contractors where contractor_id=i.employer_id and lower(account_status)='active') then raise exception 'Invitation target is no longer valid';end if;
 select * into u from public.users where lower(btrim(email))=i.email_normalized for update;
 if u.user_id is null or lower(u.status)<>'active' or (u.auth_user_id is not null and u.auth_user_id<>auth.uid()) then raise exception 'Invitation recipient mismatch';end if;
 if i.status='accepted' and i.accepted_by_auth_user_id=auth.uid() then
 return jsonb_build_object('invitationId',i.invitation_id,'status','accepted','redirectTo','/employee','idempotent',true);end if;
 if i.status<>'pending' then raise exception 'Invitation is not active';end if;
 if i.expires_at<=now() then raise exception 'Invitation expired';end if;
 update public.users set auth_user_id=auth.uid(),updated_at=now() where user_id=u.user_id and auth_user_id is null;
 update public.app_role_memberships set auth_user_id=auth.uid(),user_id=u.user_id,status='active',updated_at=now()
 where membership_key=i.membership_key and role='employer_employee' and scope_type='employer' and scope_id=i.employer_id;
 if not found then raise exception 'Invitation membership missing';end if;
 -- Canonical role record; intentionally no contractor_team_members or operational onboarding grant.
 insert into public.wf_role_memberships(user_id,role,contractor_id,status,bridge_source_key,bridge_source_sheet)
 select u.user_id,'employer_employee',i.employer_id,'active','canonical_invitation:'||i.invitation_id,'workforce_invitation'
 where not exists(select 1 from public.wf_role_memberships where user_id=u.user_id and role='employer_employee' and contractor_id=i.employer_id and status='active');
 update public.wf_user_invitations set status='accepted',accepted_by_auth_user_id=auth.uid(),accepted_by_user_id=u.user_id,accepted_at=now(),updated_at=now() where invitation_id=i.invitation_id;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,employer_id,result,after_json,metadata)
 values(auth.uid(),u.user_id,'USER_INVITATION_ACCEPTED','user_invitation',i.invitation_id,'workforce_invitation_system',i.employer_id,'success',jsonb_build_object('status','accepted'),jsonb_build_object('role','employer_employee')),
 (auth.uid(),u.user_id,'ROLE_MEMBERSHIP_LINKED','role_membership',i.membership_key,'workforce_invitation_system',i.employer_id,'success',jsonb_build_object('role','employer_employee','status','active'),jsonb_build_object('invitationId',i.invitation_id));
 return jsonb_build_object('invitationId',i.invitation_id,'status','accepted','redirectTo','/employee','idempotent',false);
end $$;
create or replace function public.user_invitation_accept(p_invitation_id text) returns jsonb language sql security invoker set search_path='' as $$select security.user_invitation_accept(p_invitation_id)$$;

create function security.employer_connections(p_employer text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not security.has_employer_role(p_employer,array['employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only']) then raise exception 'Directory scope denied' using errcode='42501';end if;
 return jsonb_build_object('classes','[]'::jsonb,'assistance','[]'::jsonb,'people',coalesce((select jsonb_agg(v) from (
 select jsonb_build_object('userId',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'role',m.role,'scopeType','employer','scopeId',p_employer,
 'institutionId',p_employer,'institutionName',c.business_name,'cohortId',m.role,'cohortName',replace(m.role,'_',' '),'program',null) v
 from public.app_role_memberships m join public.users u using(user_id) join public.contractors c on c.contractor_id=m.scope_id
 where m.scope_id=p_employer and m.scope_type in ('employer','contractor') and lower(m.status)='active' and lower(u.status)='active'
 and m.role in ('employer_owner','employer_admin','recruiter','hiring_manager','employer_read_only','employer_employee','contractor_owner','contractor_recruiter')
 order by u.first_name,u.last_name limit 500) q),'[]'::jsonb));
end $$;
create function security.employee_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.app_role_memberships where auth_user_id=auth.uid() and security.employee_member(scope_id)) then raise exception 'Active employee membership required' using errcode='42501';end if;
 return jsonb_build_object('employers',coalesce((select jsonb_agg(jsonb_build_object('id',c.contractor_id,'name',c.business_name,'courses',
 coalesce((select jsonb_agg(jsonb_build_object('title',p.display_name,'path',p.canonical_path)) from public.wf_public_pages p
 join public.wf_employer_micro_certs course on course.micro_cert_id=p.entity_id where p.entity_type='course' and course.employer_id=c.contractor_id
 and security.learning_public_page_visible(p.public_page_id)),'[]'::jsonb))) from public.contractors c where security.employee_member(c.contractor_id)),'[]'::jsonb));
end $$;

-- Curated institution Students are visible only to authorized staff, never to peer Students.
alter function security.institution_connections() rename to institution_connections_before_directory;
create function security.institution_connections() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; students jsonb; unassigned jsonb;begin
 result:=security.institution_connections_before_directory();
 select coalesce(jsonb_agg(v),'[]'::jsonb) into students from (
 select jsonb_build_object('userId',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'role','student','scopeType','cohort','scopeId',s.cohort_id,
 'institutionId',s.school_id,'institutionName',i.name,'cohortId',s.cohort_id,'cohortName',c.name,'program',c.program_name) v
 from public.wf_student_profiles s join public.users u using(user_id) join public.wf_cohorts c on c.cohort_id=s.cohort_id and c.institution_id=s.school_id
 join public.wf_institutions i on i.institution_id=s.school_id where lower(u.status)='active' and security.class_cohort_access(s.school_id,s.cohort_id,false)
 and exists(select 1 from public.app_role_memberships m where m.user_id=u.user_id and m.role='student' and lower(m.status)='active')
 order by u.first_name,u.last_name limit 500) q;
 select coalesce(jsonb_agg(v),'[]'::jsonb) into unassigned from (
 select distinct jsonb_build_object('userId',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'role',m.role,'scopeType',m.scope_type,'scopeId',m.scope_id,
 'institutionId',i.institution_id,'institutionName',i.name,'cohortId','unassigned:'||i.institution_id,'cohortName','Institution team / awaiting cohort','program','Institution') v
 from public.app_role_memberships m join public.users u using(user_id) join public.wf_institutions i on i.institution_id=m.scope_id
 where m.scope_type='institution' and lower(m.status)='active' and lower(u.status)='active' and i.active
 and (m.role='student' or security.canonical_institution_role(m.role) is not null)
 and exists(select 1 from public.app_role_memberships viewer where viewer.auth_user_id=auth.uid() and viewer.status='active' and viewer.scope_type='institution' and viewer.scope_id=i.institution_id
 and security.canonical_institution_role(viewer.role) in ('institution_super_admin','institution_admin','career_services'))
 and not exists(select 1 from jsonb_array_elements((result->'people')||students) p where p->>'userId'=u.user_id and p->>'role'=m.role)
 limit 500) q;
 return jsonb_set(result,'{people}',(result->'people')||students||unassigned);
end $$;
create or replace function public.institution_connections() returns jsonb language sql security invoker set search_path='' as $$select security.institution_connections()$$;

create function security.directory_invitation_options(p_institution text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scopes jsonb; roles jsonb;begin
 if not exists(select 1 from public.users where auth_user_id=auth.uid() and lower(status)='active') then raise exception 'Active authentication required' using errcode='42501';end if;
 with targets as (
 select 'institution' type,i.institution_id id,i.name label from public.wf_institutions i where i.institution_id=p_institution and i.active
 union select 'cohort',c.cohort_id,c.name from public.wf_cohorts c where c.institution_id=p_institution and c.status='active'
 union select 'program',coalesce(nullif(c.trade_id,''),c.program_name),c.program_name from public.wf_cohorts c where c.institution_id=p_institution and coalesce(nullif(c.trade_id,''),nullif(c.program_name,'')) is not null
 union select 'department',b.scope_id,b.scope_id from public.wf_institution_scope_bindings b where b.institution_id=p_institution and b.scope_type='department' and b.active
 union select 'class',c.class_id,c.name from public.wf_classes c where c.institution_id=p_institution and c.status='open'
 ), permitted as (select t.*,array(select role from unnest(array['student','instructor','assistant_instructor','career_services','program_coordinator','department_head','institution_admin','institution_super_admin','read_only_analyst']) role
 where security.user_invitation_actor_can_manage(role,t.type,t.id,p_institution,null)) allowed from targets t)
 select coalesce(jsonb_agg(jsonb_build_object('scopeType',type,'scopeId',id,'institutionId',p_institution,'label',label||' · '||type,'allowedRoles',allowed)),'[]'::jsonb) into scopes from permitted where cardinality(allowed)>0;
 select coalesce(jsonb_agg(jsonb_build_object('value',role,'label',initcap(replace(role,'_',' ')),'description','Access is granted after canonical invitation acceptance and any required approval.')),'[]'::jsonb) into roles
 from (select distinct jsonb_array_elements_text(scope->'allowedRoles') role from jsonb_array_elements(scopes) scope) r;
 return jsonb_build_object('roles',roles,'scopes',scopes);
end $$;

revoke all on function security.user_invitation_actor_can_manage_before_employees(text,text,text,text,text),security.user_invitation_accept_before_employees(text),security.institution_connections_before_directory() from public,anon,authenticated,service_role;
revoke all on function security.employee_member(text),security.user_invitation_actor_can_manage(text,text,text,text,text),security.user_invitation_accept(text) from public,anon,authenticated,service_role;
grant execute on function security.user_invitation_accept(text) to authenticated,service_role;
grant execute on function security.user_invitation_actor_can_manage(text,text,text,text,text) to service_role;
create function public.employer_connections(p_employer text) returns jsonb language sql security invoker set search_path='' as $$select security.employer_connections(p_employer)$$;
create function public.employee_workspace() returns jsonb language sql security invoker set search_path='' as $$select security.employee_workspace()$$;
create function public.directory_invitation_options(p_institution text) returns jsonb language sql security invoker set search_path='' as $$select security.directory_invitation_options(p_institution)$$;
do $$declare s text;f text;begin foreach s in array array['security','public'] loop foreach f in array array['employer_connections(text)','employee_workspace()','directory_invitation_options(text)','institution_connections()'] loop
execute 'revoke all on function '||s||'.'||f||' from public,anon,authenticated,service_role';
execute 'grant execute on function '||s||'.'||f||' to authenticated';end loop;end loop;end $$;
