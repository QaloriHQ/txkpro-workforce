-- #235 owner-approved class scope; additive, no historical cohort rewrite.
create table public.wf_classes(
 class_id text primary key default security.new_legacy_id('CLS'),
 institution_id text not null references public.wf_institutions(institution_id),
 name text not null check(length(btrim(name)) between 1 and 120),
 course_name text check(length(course_name)<=120),
 status text not null default 'draft' check(status in ('draft','open','closed','archived')),
 created_by text not null references public.users(user_id), created_at timestamptz not null default now(),
 request_key uuid not null default gen_random_uuid(),unique(created_by,request_key));
create index wf_classes_institution_idx on public.wf_classes(institution_id,class_id);
create index wf_classes_creator_idx on public.wf_classes(created_by);
create table public.wf_class_cohorts(
 class_id text not null references public.wf_classes(class_id),
 cohort_id text not null references public.wf_cohorts(cohort_id), primary key(class_id,cohort_id));
create index wf_class_cohorts_cohort_idx on public.wf_class_cohorts(cohort_id,class_id);
create table public.wf_class_instructors(
 class_id text not null references public.wf_classes(class_id),
 user_id text not null references public.users(user_id), primary key(class_id,user_id));
create index wf_class_instructors_user_idx on public.wf_class_instructors(user_id,class_id);
create table public.wf_class_enrollments(
 class_id text not null references public.wf_classes(class_id),
 user_id text not null references public.users(user_id),
 status text not null default 'active' check(status in ('active','withdrawn','completed')),
 invitation_id text not null references public.wf_user_invitations(invitation_id),
 accepted_at timestamptz not null default now(),primary key(class_id,user_id));
create index wf_class_enrollments_user_idx on public.wf_class_enrollments(user_id,class_id);
create index wf_class_enrollments_invitation_idx on public.wf_class_enrollments(invitation_id);
create table public.wf_class_join_links(
 link_id uuid primary key default gen_random_uuid(),class_id text not null references public.wf_classes(class_id),
 token_hash text not null unique,expires_at timestamptz not null,
 revoked_at timestamptz,created_by text not null references public.users(user_id),created_at timestamptz not null default now());
create index wf_class_links_class_idx on public.wf_class_join_links(class_id);
create index wf_class_links_creator_idx on public.wf_class_join_links(created_by);
alter table public.wf_cohorts add column start_date date;
alter table public.wf_user_invitations drop constraint wf_user_invitations_scope_owner;
alter table public.wf_user_invitations add constraint wf_user_invitations_scope_owner check(
 (scope_type='platform' and scope_id is null and institution_id is null and employer_id is null)
 or (scope_type in ('institution','department','program','cohort','class') and scope_id is not null and institution_id is not null and employer_id is null)
 or (scope_type='employer' and scope_id=employer_id and employer_id is not null and institution_id is null));
alter table public.wf_user_invitations drop constraint wf_user_invitations_status_check;
alter table public.wf_user_invitations add constraint wf_user_invitations_status_check check(status in ('pending','accepted','declined','expired','revoked','cancelled'));

-- Private relations, only curated authorization-checked RPCs. No direct client writes.
do $$ declare t text; begin foreach t in array array['wf_classes','wf_class_cohorts','wf_class_instructors','wf_class_enrollments','wf_class_join_links'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
end loop; end $$;

create function security.class_cohort_access(p_institution text,p_cohort text,p_manage boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.wf_cohorts c join public.wf_institutions i using(institution_id) where c.cohort_id=p_cohort and c.institution_id=p_institution and i.active=true)
and exists(select 1 from public.users u join public.app_role_memberships r on r.user_id=u.user_id
where u.auth_user_id=(select auth.uid()) and lower(u.status)='active' and lower(r.status)='active'
and security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin','department_head','program_coordinator','instructor','assistant_instructor','career_services','read_only_analyst')
and (not p_manage or security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin','department_head','program_coordinator','instructor'))
and security.institution_role_scope_valid(r.role,r.scope_type)
and security.institution_scope_matches(p_institution,r.scope_type,r.scope_id,p_cohort));
$$;
create function security.class_manage(p_class text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.wf_classes c where c.class_id=p_class
and exists(select 1 from public.wf_class_cohorts b where b.class_id=c.class_id)
and not exists(select 1 from public.wf_class_cohorts b where b.class_id=c.class_id and not security.class_cohort_access(c.institution_id,b.cohort_id,true))
and (exists(select 1 from public.wf_class_instructors i where i.class_id=c.class_id and i.user_id=security.current_legacy_user_id())
or exists(select 1 from public.app_role_memberships r where r.auth_user_id=(select auth.uid()) and lower(r.status)='active'
and security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin','department_head','program_coordinator')
and security.institution_role_scope_valid(r.role,r.scope_type)
and not exists(select 1 from public.wf_class_cohorts b where b.class_id=c.class_id and not security.institution_scope_matches(c.institution_id,r.scope_type,r.scope_id,b.cohort_id)))));
$$;
create function security.class_read(p_class text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and lower(u.status)='active')
and (security.class_manage(p_class)
or exists(select 1 from public.wf_class_enrollments e where e.class_id=p_class and e.user_id=security.current_legacy_user_id()
and exists(select 1 from public.app_role_memberships r where r.user_id=e.user_id and r.role='student' and lower(r.status)='active'))
or exists(select 1 from public.wf_classes c join public.wf_class_cohorts b on b.class_id=c.class_id
where c.class_id=p_class and security.class_cohort_access(c.institution_id,b.cohort_id,false)));
$$;
create function security.class_audit(p_class text,p_operation text,p_record text default null) returns void
language sql security definer set search_path='' as $$
insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,institution_id,result,metadata)
select (select auth.uid()),security.current_legacy_user_id(),'INSTITUTION_CLASS_CHANGED','institution_class',class_id,'class_workspace',institution_id,'success',jsonb_strip_nulls(jsonb_build_object('operation',p_operation,'recordId',p_record)) from public.wf_classes where class_id=p_class;
$$;

-- Extend canonical student invitation scope without altering staff role grants.
alter function security.institution_scope_matches(text,text,text,text) rename to institution_scope_matches_before_classes;
create function security.institution_scope_matches(p_institution_id text,p_scope_type text,p_scope_id text,p_cohort_id text default null)
returns boolean language sql stable security definer set search_path='' as $$
select case when lower(p_scope_type)='class' then exists(select 1 from public.wf_classes c where c.class_id=p_scope_id and c.institution_id=p_institution_id
and (p_cohort_id is null or exists(select 1 from public.wf_class_cohorts b where b.class_id=c.class_id and b.cohort_id=p_cohort_id)))
else security.institution_scope_matches_before_classes(p_institution_id,p_scope_type,p_scope_id,p_cohort_id) end;
$$;
alter function security.user_invitation_actor_can_manage(text,text,text,text,text) rename to user_invitation_actor_can_manage_before_classes;
create function security.user_invitation_actor_can_manage(p_role text,p_scope_type text,p_scope_id text,p_institution_id text,p_employer_id text)
returns boolean language sql stable security definer set search_path='' as $$
select case when lower(p_scope_type)='class' then lower(p_role)='student' and p_employer_id is null
and security.institution_scope_matches(p_institution_id,'class',p_scope_id,null) and security.class_manage(p_scope_id)
else security.user_invitation_actor_can_manage_before_classes(p_role,p_scope_type,p_scope_id,p_institution_id,p_employer_id) end;
$$;
alter function security.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb) rename to user_invitation_create_before_classes;
create function security.user_invitation_create(p_email text,p_role text,p_scope_type text,p_scope_id text,p_institution_id text default null,p_employer_id text default null,p_expires_at timestamptz default null,p_idempotency_key text default null,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
if lower(p_scope_type)='class' then
 perform 1 from public.wf_classes where class_id=p_scope_id and status='open' for update;
 if not found then raise exception 'Class must be open for invitations'; end if;
 if exists(select 1 from public.wf_class_enrollments e join public.users u using(user_id) where e.class_id=p_scope_id and lower(btrim(u.email))=lower(btrim(p_email))) then raise exception 'Class enrollment already exists'; end if;
end if;
v_result:=security.user_invitation_create_before_classes(p_email,p_role,p_scope_type,p_scope_id,p_institution_id,p_employer_id,p_expires_at,p_idempotency_key,p_metadata);
if lower(p_scope_type)='class' and (v_result->>'created')::boolean then
 if nullif(p_metadata->>'cohortHint','') is not null and not exists(select 1 from public.wf_class_cohorts b where b.class_id=p_scope_id and b.cohort_id=p_metadata->>'cohortHint') then raise exception 'Cohort hint does not match class'; end if;
 if nullif(p_metadata->>'programHint','') is not null and not exists(select 1 from public.wf_class_cohorts b join public.wf_cohorts c using(cohort_id) where b.class_id=p_scope_id and lower(c.program_name)=lower(p_metadata->>'programHint')) then raise exception 'Program hint does not match class'; end if;
 update public.wf_user_invitations set metadata=metadata||jsonb_strip_nulls(jsonb_build_object('cohortHint',nullif(p_metadata->>'cohortHint',''),'programHint',nullif(p_metadata->>'programHint',''))) where invitation_id=v_result->>'invitationId';
end if;
return v_result;
end $$;
alter function security.apply_student_invitation_affiliation() rename to apply_student_invitation_affiliation_before_classes;
create function security.apply_student_invitation_affiliation() returns void language plpgsql security definer set search_path='' as $$
begin
if (select scope_type from public.wf_user_invitations where accepted_by_auth_user_id=(select auth.uid()) and role='student' and status='accepted' order by accepted_at desc limit 1)='class' then return; end if;
perform security.apply_student_invitation_affiliation_before_classes();
end $$;
alter function security.user_invitation_accept(text) rename to user_invitation_accept_before_classes;
create function security.user_invitation_accept(p_invitation_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inv public.wf_user_invitations%rowtype; v_result jsonb; v_student public.wf_student_profiles%rowtype; v_class public.wf_classes%rowtype;
begin
select * into v_inv from public.wf_user_invitations where invitation_id=p_invitation_id for update;
if v_inv.scope_type='class' then
 select * into v_class from public.wf_classes where class_id=v_inv.scope_id for update;
 if not found or v_class.status<>'open' then raise exception 'Class is not open'; end if;
 if not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') then raise exception 'Active authenticated recipient required'; end if;
 if v_inv.status<>'accepted' and exists(select 1 from public.wf_class_enrollments where class_id=v_inv.scope_id and user_id=security.current_legacy_user_id() and status<>'active') then raise exception 'Historical enrollment cannot be reactivated by invitation'; end if;
 select * into v_student from public.wf_student_profiles where user_id=security.current_legacy_user_id();
 if found and (v_student.school_id is distinct from v_class.institution_id or not exists(select 1 from public.wf_class_cohorts b where b.class_id=v_class.class_id and b.cohort_id=v_student.cohort_id)) then raise exception 'Your institution or cohort does not match this class. Contact staff'; end if;
end if;
v_result:=security.user_invitation_accept_before_classes(p_invitation_id);
if v_inv.scope_type='class' then
 insert into public.wf_class_enrollments(class_id,user_id,invitation_id) values(v_inv.scope_id,security.current_legacy_user_id(),v_inv.invitation_id) on conflict do nothing;
 if found then perform security.class_audit(v_inv.scope_id,'enrolled',v_inv.invitation_id); end if;
 if v_student.student_id is not null then v_result:=v_result||jsonb_build_object('redirectTo','/student/classes'); end if;
 if v_student.student_id is null then update public.wf_onboarding_accounts set profile_data=profile_data||jsonb_strip_nulls(jsonb_build_object('schoolId',v_inv.institution_id,'cohortId',v_inv.metadata->>'cohortHint','programType',v_inv.metadata->>'programHint')) where auth_user_id=(select auth.uid()) and status<>'complete'; end if;
end if;
return v_result;
end $$;

create function security.class_workspace(p_offset integer default 0,p_class text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if security.current_legacy_user_id() is null or not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') then raise exception 'Active authentication required'; end if;
return jsonb_build_object('offset',greatest(0,least(coalesce(p_offset,0),100000)),'hasMore',exists(select 1 from public.wf_classes where security.class_read(class_id) and (p_class is null or class_id=p_class) order by name,class_id offset greatest(0,least(coalesce(p_offset,0),100000))+20 limit 1),'cohorts',coalesce((select jsonb_agg(jsonb_build_object('cohortId',c.cohort_id,'institutionId',c.institution_id,'name',c.name,'program',c.program_name,'startDate',c.start_date,'term',c.term,'canManage',security.class_cohort_access(c.institution_id,c.cohort_id,true)) order by c.name) from (select * from public.wf_cohorts where security.class_cohort_access(institution_id,cohort_id,false) order by name,cohort_id limit 1000) c where security.class_cohort_access(c.institution_id,c.cohort_id,false)),'[]'),
'classes',coalesce((select jsonb_agg(jsonb_build_object('classId',c.class_id,'institutionId',c.institution_id,'name',c.name,'courseName',c.course_name,'status',c.status,'canManage',security.class_manage(c.class_id),
'cohorts',(select jsonb_agg(jsonb_build_object('cohortId',b.cohort_id,'name',h.name,'program',h.program_name)) from public.wf_class_cohorts b join public.wf_cohorts h using(cohort_id) where b.class_id=c.class_id),
'instructors',(select jsonb_agg(jsonb_build_object('userId',i.user_id,'name',concat_ws(' ',u.first_name,u.last_name))) from public.wf_class_instructors i join public.users u using(user_id) where i.class_id=c.class_id),
'enrollments',(select coalesce(jsonb_agg(jsonb_build_object('userId',e.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'status',e.status,'studentId',s.student_id,'cohortId',s.cohort_id)),'[]') from (select * from public.wf_class_enrollments where class_id=c.class_id order by accepted_at desc,user_id limit 1000) e join public.users u using(user_id) left join public.wf_student_profiles s using(user_id) where e.class_id=c.class_id and (e.user_id=security.current_legacy_user_id() or security.class_manage(c.class_id) or (s.cohort_id is not null and security.class_cohort_access(c.institution_id,s.cohort_id,false)))),
'invitations',case when security.class_manage(c.class_id) then (select coalesce(jsonb_agg(jsonb_build_object('invitationId',v.invitation_id,'email',v.email,'status',case when v.status='pending' and v.expires_at<=now() then 'expired' else v.status end,'deliveryStatus',v.delivery_status)),'[]') from (select * from public.wf_user_invitations where scope_type='class' and scope_id=c.class_id order by created_at desc limit 1000) v) else '[]'::jsonb end,
'links',case when security.class_manage(c.class_id) then (select coalesce(jsonb_agg(jsonb_build_object('linkId',l.link_id,'expiresAt',l.expires_at,'status',case when l.revoked_at is not null then 'revoked' when l.expires_at<=now() then 'expired' else 'active' end)),'[]') from (select * from public.wf_class_join_links where class_id=c.class_id order by created_at desc limit 100) l) else '[]'::jsonb end) order by c.name)
from (select * from public.wf_classes where security.class_read(class_id) and (p_class is null or class_id=p_class) order by name,class_id limit 20 offset greatest(0,least(coalesce(p_offset,0),100000))) c),'[]'));
end $$;

create function security.class_save(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id text:=nullif(p_input->>'classId',''); v_inst text:=p_input->>'institutionId'; v_cohorts jsonb:=p_input->'cohortIds'; v_user text:=security.current_legacy_user_id(); v_status text:=p_input->>'status';
begin
if jsonb_typeof(p_input)<>'object' or length(coalesce(p_input->>'name','')) not between 1 and 120 or v_status not in ('draft','open','closed','archived') then raise exception 'Invalid class details'; end if;
if v_id is null then
 if nullif(p_input->>'requestKey','') is null then raise exception 'Class request key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('class:'||v_user||':'||(p_input->>'requestKey')::uuid::text,0));
 select class_id into v_id from public.wf_classes where created_by=v_user and request_key=(p_input->>'requestKey')::uuid;
 if found then return jsonb_build_object('classId',v_id,'idempotent',true); end if;
 if jsonb_typeof(v_cohorts)<>'array' or jsonb_array_length(v_cohorts) not between 1 and 50 then raise exception 'Choose 1 to 50 cohorts'; end if;
 if exists(select 1 from jsonb_array_elements_text(v_cohorts) x where not security.class_cohort_access(v_inst,x,true)) then raise exception 'Class cohort scope denied'; end if;
 insert into public.wf_classes(institution_id,name,course_name,status,created_by,request_key) values(v_inst,btrim(p_input->>'name'),nullif(btrim(p_input->>'courseName'),''),v_status,v_user,(p_input->>'requestKey')::uuid) returning class_id into v_id;
 insert into public.wf_class_cohorts select v_id,x from jsonb_array_elements_text(v_cohorts) x group by x;
 insert into public.wf_class_instructors values(v_id,v_user);
else
 if not security.class_manage(v_id) then raise exception 'Class scope denied'; end if;
 perform 1 from public.wf_classes where class_id=v_id and status<>'archived' for update;
 if not found then raise exception 'Archived classes cannot change'; end if;
 update public.wf_classes set name=btrim(p_input->>'name'),course_name=nullif(btrim(p_input->>'courseName'),''),status=v_status where class_id=v_id;
end if;
perform security.class_audit(v_id,'saved'); return jsonb_build_object('classId',v_id);
end $$;

create function security.class_link(p_class text,p_token_hash text default null,p_link uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
if not security.class_manage(p_class) then raise exception 'Class scope denied'; end if;
if p_link is not null then
 update public.wf_class_join_links set revoked_at=now() where class_id=p_class and link_id=p_link and revoked_at is null;
 if found then perform security.class_audit(p_class,'link_revoked',p_link::text); end if;
 return jsonb_build_object('revoked',true);
end if;
if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid join link'; end if;
perform 1 from public.wf_classes where class_id=p_class and status='open' for update;
if not found then raise exception 'Class must be open'; end if;
if (select count(*) from public.wf_class_join_links where class_id=p_class and revoked_at is null and expires_at>now())>=20 then raise exception 'Revoke unused links before creating more'; end if;
insert into public.wf_class_join_links(class_id,token_hash,expires_at,created_by) values(p_class,p_token_hash,now()+interval '7 days',security.current_legacy_user_id()) returning link_id into v_id;
perform security.class_audit(p_class,'link_created',v_id::text); return jsonb_build_object('linkId',v_id,'expiresAt',now()+interval '7 days');
end $$;

create function security.class_instructor_assign(p_class text,p_user text,p_remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inst text;
begin
 if not security.class_manage(p_class) then raise exception 'Class scope denied'; end if;
 select institution_id into v_inst from public.wf_classes where class_id=p_class and status<>'archived' for update;
 if not found then raise exception 'Archived classes cannot change'; end if;
 if p_remove then
  if p_user=security.current_legacy_user_id() then raise exception 'Contact a coordinator to remove your own assignment'; end if;
  delete from public.wf_class_instructors where class_id=p_class and user_id=p_user;
 else
  if not exists(select 1 from public.users u where u.user_id=p_user and lower(u.status)='active')
  or exists(select 1 from public.wf_class_cohorts b where b.class_id=p_class and not exists(select 1 from public.app_role_memberships r where r.user_id=p_user and lower(r.status)='active' and security.canonical_institution_role(r.role)='instructor' and security.institution_role_scope_valid(r.role,r.scope_type) and security.institution_scope_matches(v_inst,r.scope_type,r.scope_id,b.cohort_id))) then raise exception 'Instructor must have active scope across every class cohort'; end if;
  insert into public.wf_class_instructors values(p_class,p_user) on conflict do nothing;
 end if;
 perform security.class_audit(p_class,case when p_remove then 'instructor_removed' else 'instructor_assigned' end,p_user);
 return jsonb_build_object('updated',true);
end $$;
create function public.class_instructor_assign(p_class text,p_user text,p_remove boolean default false) returns jsonb language sql security invoker set search_path='' as $$select security.class_instructor_assign(p_class,p_user,p_remove);$$;
revoke all on function security.class_instructor_assign(text,text,boolean),public.class_instructor_assign(text,text,boolean) from public,anon;
grant execute on function security.class_instructor_assign(text,text,boolean),public.class_instructor_assign(text,text,boolean) to authenticated;

create function security.class_qr_claim(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.wf_class_join_links%rowtype; v_class public.wf_classes%rowtype; v_user public.users%rowtype; v_inv text; v_key text;
begin
perform security.expire_user_invitations();
select * into v_user from public.users where auth_user_id=(select auth.uid()) and lower(status)='active';
if not found or security.current_auth_email()='' then raise exception 'Active verified authentication required'; end if;
select * into v_link from public.wf_class_join_links where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
if not found then raise exception 'Join link unavailable'; end if;
select * into v_class from public.wf_classes where class_id=v_link.class_id and status='open' for update;
if not found then raise exception 'Class is not open'; end if;
perform pg_advisory_xact_lock(hashtextextended('invitation-email:'||security.current_auth_email(),0));
select invitation_id into v_inv from public.wf_user_invitations where role='student' and scope_type='class' and scope_id=v_class.class_id and email_normalized=security.current_auth_email() and (status='accepted' or (status='pending' and expires_at>now())) order by created_at desc limit 1;
if v_inv is null then
 v_inv:=security.new_legacy_id('INV'); v_key:='invite:'||v_inv;
 perform security.ensure_app_role_semantic(v_key,(select auth.uid()),v_user.user_id,'student','class',v_class.class_id,'pending','canonical_invitation:'||v_inv);
 insert into public.wf_user_invitations(invitation_id,email,role,scope_type,scope_id,institution_id,membership_key,status,activation_policy,expires_at,recipient_existing_identity,invited_by_auth_user_id,invited_by_user_id)
 select v_inv,security.current_auth_email(),'student','class',v_class.class_id,v_class.institution_id,v_key,'pending','auto_activate',v_link.expires_at,true,u.auth_user_id,u.user_id from public.users u where u.user_id=v_link.created_by;
 perform security.class_audit(v_class.class_id,'qr_claimed',v_inv);
end if;
return jsonb_build_object('invitationId',v_inv,'className',v_class.name);
end $$;

create table public.wf_cohort_assistance_requests(
 user_id text not null references public.users(user_id),institution_id text not null references public.wf_institutions(institution_id),
 requested_at timestamptz not null default now(),primary key(user_id,institution_id));
create index wf_cohort_assistance_institution_idx on public.wf_cohort_assistance_requests(institution_id);
alter table public.wf_cohort_assistance_requests enable row level security;
revoke all on public.wf_cohort_assistance_requests from public,anon,authenticated,service_role;
create function security.cohort_assistance(p_institution text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') or not exists(select 1 from public.wf_institutions where institution_id=p_institution and active=true) then raise exception 'Institution request denied'; end if;
insert into public.wf_cohort_assistance_requests(user_id,institution_id) values(security.current_legacy_user_id(),p_institution) on conflict do nothing;
if found then insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,institution_id,result)
values((select auth.uid()),security.current_legacy_user_id(),'COHORT_ASSISTANCE_REQUESTED','institution',p_institution,'onboarding',''||p_institution,'success'); end if;
return jsonb_build_object('requested',true);
end $$;

-- Cohort choice is institution-managed; onboarding cannot rewrite an existing affiliation.
alter function security.complete_student_onboarding(jsonb) rename to complete_student_onboarding_before_classes;
create function security.complete_student_onboarding(p_profile_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_result jsonb; v_cohort public.wf_cohorts%rowtype; v_student public.wf_student_profiles%rowtype; v_inst text; v_inv public.wf_user_invitations%rowtype;
begin
perform pg_advisory_xact_lock(hashtextextended('class-onboarding:'||coalesce((select auth.uid())::text,''),0));
select coalesce(profile_data,'{}') into v_input from public.wf_onboarding_accounts where auth_user_id=(select auth.uid());
v_input:=coalesce(v_input,'{}')||coalesce(p_profile_data,'{}');
select * into v_student from public.wf_student_profiles where user_id=security.current_legacy_user_id();
v_inst:=v_input->>'schoolId';
select * into v_inv from public.wf_user_invitations where accepted_by_auth_user_id=(select auth.uid()) and role='student' and status='accepted' and institution_id is not null order by accepted_at desc limit 1;
v_inst:=coalesce(v_inv.institution_id,nullif(v_input->>'schoolId',''),v_student.school_id);
if v_inv.scope_type='cohort' and nullif(v_input->>'cohortId','') is null then v_input:=v_input||jsonb_build_object('cohortId',v_inv.scope_id); end if;
if v_inst is not null and (v_student.student_id is null or v_student.cohort_id is null) then
 if v_student.school_id is not null and v_student.school_id is distinct from v_inst then raise exception 'Existing institution affiliation cannot change during onboarding'; end if;
 select * into v_cohort from public.wf_cohorts where cohort_id=v_input->>'cohortId' and institution_id=v_inst and lower(status) in ('active','enrolling','in_progress');
 if not found then raise exception 'Choose an active cohort or request staff assistance'; end if;
 if exists(select 1 from public.wf_class_enrollments e join public.wf_classes c using(class_id) where e.user_id=security.current_legacy_user_id() and e.status='active' and not exists(select 1 from public.wf_class_cohorts b where b.class_id=c.class_id and b.cohort_id=v_cohort.cohort_id)) then raise exception 'Selected cohort is not available for your accepted class. Contact staff'; end if;
 v_input:=v_input||jsonb_build_object('schoolId',v_inst,'cohortId',v_cohort.cohort_id,'programType',v_cohort.program_name);
elsif v_student.student_id is not null then
 v_input:=v_input||jsonb_build_object('schoolId',v_student.school_id,'cohortId',v_student.cohort_id,'programType',v_student.program_type);
end if;
v_result:=security.complete_student_onboarding_before_classes(v_input);
if v_cohort.cohort_id is not null then
 update public.wf_student_profiles set school_id=v_cohort.institution_id,cohort_id=v_cohort.cohort_id,program_type=v_cohort.program_name where user_id=security.current_legacy_user_id();
 if not exists(select 1 from public.wf_domain_events where event_key='student_linked_to_cohort:'||security.current_student_id()||':'||v_cohort.cohort_id) then
  perform security.emit_workforce_event('STUDENT_LINKED_TO_COHORT','student',security.current_student_id(),null,v_cohort.institution_id,security.current_student_id(),null,jsonb_build_object('cohortId',v_cohort.cohort_id),jsonb_build_object('source','onboarding'),'success','student_linked_to_cohort:'||security.current_student_id()||':'||v_cohort.cohort_id,null);
 end if;
elsif v_student.student_id is not null then
 update public.wf_student_profiles set school_id=v_student.school_id,cohort_id=v_student.cohort_id,program_type=v_student.program_type where student_id=v_student.student_id;
end if;
return v_result;
end $$;

create function security.class_enrollment_update(p_class text,p_user text,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not security.class_manage(p_class) or p_status not in ('withdrawn','completed') then raise exception 'Enrollment update denied'; end if;
update public.wf_class_enrollments set status=p_status where class_id=p_class and user_id=p_user and status='active';
if found then
 update public.app_role_memberships set status='revoked',updated_at=now() where user_id=p_user and role='student' and scope_type='class' and scope_id=p_class;
 perform security.class_audit(p_class,'enrollment_'||p_status,p_user);
end if;
return jsonb_build_object('status',p_status);
end $$;

create function security.institution_connections() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_student public.wf_student_profiles%rowtype;
begin
if not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') then raise exception 'Active authentication required'; end if;
select * into v_student from public.wf_student_profiles where student_id=security.current_student_id();
return jsonb_build_object('classes',security.class_workspace()->'classes','people',coalesce((select jsonb_agg(x) from (
 select distinct jsonb_build_object('userId',u.user_id,'name',concat_ws(' ',u.first_name,u.last_name),'role',security.canonical_institution_role(r.role),'scopeType',r.scope_type,'scopeId',r.scope_id,'institutionId',c.institution_id,'institutionName',i.name,'cohortId',c.cohort_id,'cohortName',c.name,'program',c.program_name) x
 from public.app_role_memberships r join public.users u using(user_id)
 join public.wf_cohorts c on security.institution_scope_matches(c.institution_id,r.scope_type,r.scope_id,c.cohort_id)
 join public.wf_institutions i using(institution_id)
 where lower(r.status)='active' and lower(u.status)='active' and security.institution_role_scope_valid(r.role,r.scope_type)
 and security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin','department_head','program_coordinator','instructor','assistant_instructor','career_services')
 and (security.class_cohort_access(c.institution_id,c.cohort_id,false) or (c.institution_id=v_student.school_id and c.cohort_id=v_student.cohort_id)) limit 500) q),'[]'),
'assistance',coalesce((select jsonb_agg(jsonb_build_object('name',concat_ws(' ',u.first_name,u.last_name),'institutionId',a.institution_id,'requestedAt',a.requested_at)) from public.wf_cohort_assistance_requests a join public.users u using(user_id)
where exists(select 1 from public.app_role_memberships r where r.auth_user_id=(select auth.uid()) and lower(r.status)='active' and r.scope_type='institution' and r.scope_id=a.institution_id and security.canonical_institution_role(r.role) in ('institution_super_admin','institution_admin','career_services'))),'[]'));
end $$;
create function public.cohort_assistance(p_institution text) returns jsonb language sql security invoker set search_path='' as $$select security.cohort_assistance(p_institution);$$;
create function public.institution_connections() returns jsonb language sql security invoker set search_path='' as $$select security.institution_connections();$$;
create function public.class_enrollment_update(p_class text,p_user text,p_status text) returns jsonb language sql security invoker set search_path='' as $$select security.class_enrollment_update(p_class,p_user,p_status);$$;
revoke all on function security.complete_student_onboarding_before_classes(jsonb),security.complete_student_onboarding(jsonb) from public,anon,authenticated;
grant execute on function security.complete_student_onboarding(jsonb) to authenticated;
revoke all on function security.institution_connections(),public.institution_connections(),security.cohort_assistance(text),public.cohort_assistance(text),security.class_enrollment_update(text,text,text),public.class_enrollment_update(text,text,text) from public,anon;
grant execute on function security.institution_connections(),public.institution_connections(),security.cohort_assistance(text),public.cohort_assistance(text),security.class_enrollment_update(text,text,text),public.class_enrollment_update(text,text,text) to authenticated;

create function security.class_invitation_decline(p_invitation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inv public.wf_user_invitations%rowtype;
begin
select * into v_inv from public.wf_user_invitations where invitation_id=p_invitation and scope_type='class' and email_normalized=security.current_auth_email() for update;
if not found then raise exception 'Invitation recipient denied'; end if;
if v_inv.status='declined' then return jsonb_build_object('status','declined'); end if;
if v_inv.status<>'pending' or v_inv.expires_at<=now() then raise exception 'Invitation is not active'; end if;
update public.wf_user_invitations set status='declined',closed_at=now(),closed_by_auth_user_id=(select auth.uid()),closed_by_user_id=security.current_legacy_user_id(),updated_at=now() where invitation_id=p_invitation;
update public.app_role_memberships set status='revoked',updated_at=now() where membership_key=v_inv.membership_key and status='pending';
perform security.class_audit(v_inv.scope_id,'invitation_declined',p_invitation); return jsonb_build_object('status','declined');
end $$;

-- Authenticated, safe affiliation options: no student records/contact data.
create function security.onboarding_cohorts(p_institution text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if security.current_legacy_user_id() is null then raise exception 'Authentication required'; end if;
return coalesce((select jsonb_agg(jsonb_build_object('cohortId',c.cohort_id,'name',c.name,'program',c.program_name,'startDate',c.start_date,'term',c.term) order by c.start_date,c.name) from public.wf_cohorts c join public.wf_institutions i using(institution_id) where c.institution_id=p_institution and lower(c.status) in ('active','enrolling','in_progress') and i.active=true),'[]');
end $$;

create function public.cohort_start_date(p_cohort text,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inst text;
begin
 select institution_id into v_inst from public.wf_cohorts where cohort_id=p_cohort for update;
 if not found or not security.can_manage_institution_program_cohort(v_inst,'cohort',p_cohort) then raise exception 'Cohort update scope denied'; end if;
 update public.wf_cohorts set start_date=p_date where cohort_id=p_cohort;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,institution_id,result)
 values((select auth.uid()),security.current_legacy_user_id(),'COHORT_START_DATE_UPDATED','cohort',p_cohort,'class_workspace',v_inst,'success');
 return jsonb_build_object('updated',true);
end $$;
revoke all on function public.cohort_start_date(text,date) from public,anon;
grant execute on function public.cohort_start_date(text,date) to authenticated;

-- Explicit wrappers; private implementation functions remain inaccessible to anon.
create function public.class_workspace(p_offset integer default 0,p_class text default null) returns jsonb language sql security invoker set search_path='' as $$select security.class_workspace(p_offset,p_class);$$;
create function public.class_save(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select security.class_save(p_input);$$;
create function public.class_link(p_class text,p_token_hash text default null,p_link uuid default null) returns jsonb language sql security invoker set search_path='' as $$select security.class_link(p_class,p_token_hash,p_link);$$;
create function public.class_qr_claim(p_hash text) returns jsonb language sql security invoker set search_path='' as $$select security.class_qr_claim(p_hash);$$;
create function public.class_invitation_decline(p_invitation text) returns jsonb language sql security invoker set search_path='' as $$select security.class_invitation_decline(p_invitation);$$;
create function public.onboarding_cohorts(p_institution text) returns jsonb language sql security invoker set search_path='' as $$select security.onboarding_cohorts(p_institution);$$;
revoke all on function security.class_audit(text,text,text),security.class_cohort_access(text,text,boolean),security.class_manage(text),security.class_read(text),security.institution_scope_matches_before_classes(text,text,text,text),security.user_invitation_actor_can_manage_before_classes(text,text,text,text,text),security.user_invitation_create_before_classes(text,text,text,text,text,text,timestamptz,text,jsonb),security.user_invitation_accept_before_classes(text),security.apply_student_invitation_affiliation_before_classes() from public,anon,authenticated;
revoke all on function security.institution_scope_matches(text,text,text,text),security.user_invitation_actor_can_manage(text,text,text,text,text),security.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb),security.user_invitation_accept(text),security.apply_student_invitation_affiliation() from public,anon;
grant execute on function security.user_invitation_create(text,text,text,text,text,text,timestamptz,text,jsonb),security.user_invitation_accept(text) to authenticated;
do $$ declare s text; f text; begin foreach s in array array['security','public'] loop foreach f in array array['class_workspace(integer,text)','class_save(jsonb)','class_link(text,text,uuid)','class_qr_claim(text)','class_invitation_decline(text)','onboarding_cohorts(text)'] loop
execute 'revoke all on function '||s||'.'||f||' from public,anon';
execute 'grant execute on function '||s||'.'||f||' to authenticated';
end loop; end loop; end $$;
