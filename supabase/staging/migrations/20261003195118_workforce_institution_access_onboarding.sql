-- Owner decision #194: internal platform Super Admin provisions institutions;
-- marketing captures requests only. Directory reads never grant affiliation.
begin;

create function security.institution_provisioning_super_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u join public.app_role_memberships r
   on r.auth_user_id=u.auth_user_id and r.user_id=u.user_id
   where u.auth_user_id=(select auth.uid()) and lower(u.status)='active'
     and lower(r.status)='active' and lower(r.role)='super_admin'
     and lower(r.scope_type)='platform');
$$;

create function security.onboarding_educator_affiliation(p_institution_id text)
returns text language sql stable security definer set search_path='' as $$
 select case when bool_or(lower(r.status)='active') then 'active'
   when bool_or(lower(r.status)='pending') then 'pending' else null end
 from public.app_role_memberships r join public.users u
   on u.auth_user_id=r.auth_user_id and u.user_id=r.user_id
 where u.auth_user_id=(select auth.uid()) and lower(u.status)='active'
   and lower(r.status) in ('active','pending')
   and security.institution_role_scope_valid(r.role,r.scope_type)
   and security.retention_membership_matches(r.id,p_institution_id,null);
$$;

create function security.onboarding_institutions_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') then
   raise exception 'Active workforce account required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'institution_id',i.institution_id,'name',coalesce(i.name,i.short_name,i.institution_id),
   'city',i.city,'state',i.state,'authorized',security.onboarding_educator_affiliation(i.institution_id) is not null)
   order by i.name,i.institution_id) from public.wf_institutions i where i.active=true),'[]'::jsonb);
end;
$$;

-- Contact and onboarding changes are atomic. Existing approved/pending roles
-- remain untouched, including cohort/program scope and read-only roles.
create function security.save_educator_onboarding(p_profile_data jsonb,p_current_step integer,p_complete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user public.users%rowtype; v_data jsonb; v_institution text; v_affiliation text;
 v_status text; v_existing public.wf_onboarding_accounts%rowtype;
begin
 select * into v_user from public.users where auth_user_id=(select auth.uid()) and lower(status)='active' for update;
 if not found then raise exception 'Active workforce account required' using errcode='42501'; end if;
 if p_profile_data is null or jsonb_typeof(p_profile_data)<>'object' or octet_length(p_profile_data::text)>24000
   or p_current_step not between 1 and 4 then raise exception 'Invalid onboarding data'; end if;
 if not exists(select 1 from public.wf_institutions i where i.active=true
   and security.onboarding_educator_affiliation(i.institution_id) is not null) then
   raise exception 'Institution access must be provisioned by invitation' using errcode='42501';
 end if;
 select * into v_existing from public.wf_onboarding_accounts where auth_user_id=v_user.auth_user_id;
 if v_existing.selected_role is not null and v_existing.selected_role<>'educator' then
   raise exception 'Provisioned onboarding role cannot be changed' using errcode='42501';
 end if;
 v_data:=coalesce(v_existing.profile_data,'{}'::jsonb)||p_profile_data;
 v_institution:=nullif(btrim(v_data->>'institutionId'),'');
 if v_institution is not null then
   v_affiliation:=security.onboarding_educator_affiliation(v_institution);
   if v_affiliation is null then raise exception 'Choose an institution covered by your approved invitation' using errcode='42501'; end if;
 end if;
 if (p_complete or p_current_step>=3) and v_institution is null then raise exception 'Choose your institution before continuing'; end if;
 if p_complete and (nullif(btrim(v_data->>'firstName'),'') is null or nullif(btrim(v_data->>'lastName'),'') is null) then
   raise exception 'First and last name are required';
 end if;
 v_status:=case when v_existing.status='complete' then 'complete' when p_complete and v_affiliation='active' then 'complete'
   when p_complete or v_existing.status='pending_review' then 'pending_review' else 'in_progress' end;
 if p_complete then
   update public.users set first_name=left(btrim(v_data->>'firstName'),100),last_name=left(btrim(v_data->>'lastName'),100),
     phone=nullif(left(btrim(v_data->>'phone'),60),''),updated_at=now() where user_id=v_user.user_id;
 end if;
 insert into public.wf_onboarding_accounts(auth_user_id,user_id,selected_role,status,current_step,profile_data,submitted_at,completed_at)
 values(v_user.auth_user_id,v_user.user_id,'educator',v_status,case when v_status='complete' then 4 else p_current_step end,v_data,
   case when p_complete then coalesce(v_existing.submitted_at,now()) else v_existing.submitted_at end,
   case when v_status='complete' then coalesce(v_existing.completed_at,now()) else null end)
 on conflict(auth_user_id) do update set status=excluded.status,current_step=excluded.current_step,profile_data=excluded.profile_data,
   submitted_at=excluded.submitted_at,completed_at=excluded.completed_at,updated_at=now();
 if p_complete and v_existing.status is distinct from v_status then
   insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
   values(v_user.auth_user_id,v_user.user_id,'workforce.onboarding.completed','wf_onboarding',v_user.user_id,'workforce-web',
     jsonb_build_object('selectedRole','educator','status',v_status,'institutionId',v_institution,'membershipChanged',false));
 end if;
 return jsonb_build_object('ok',true,'role','educator','status',v_status,'currentStep',p_current_step,
   'redirectTo',case when p_complete then case when v_status='complete' then '/institution' else '/onboarding?pending=1' end else null end);
end;
$$;

create table public.wf_institution_creation_receipts(
 actor_auth_user_id uuid not null,request_key uuid not null,institution_id text not null references public.wf_institutions(institution_id),
 payload jsonb not null,created_at timestamptz not null default now(),primary key(actor_auth_user_id,request_key));
alter table public.wf_institution_creation_receipts enable row level security;
revoke all on public.wf_institution_creation_receipts from public,anon,authenticated,service_role;

create function security.platform_institutions_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not security.institution_provisioning_super_admin() then raise exception 'Active platform Super Admin required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('institution_id',institution_id,'name',name,'city',city,'state',state,
   'institution_type',institution_type,'active',active) order by name,institution_id) from public.wf_institutions),'[]'::jsonb);
end;
$$;

create function security.platform_institution_create(p_request_key uuid,p_name text,p_institution_type text,p_city text,p_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_receipt public.wf_institution_creation_receipts%rowtype; v_institution public.wf_institutions%rowtype;
begin
 if not security.institution_provisioning_super_admin() then raise exception 'Active platform Super Admin required' using errcode='42501'; end if;
 if p_request_key is null or nullif(btrim(p_name),'') is null or length(btrim(p_name))>160
   or p_institution_type is null or p_institution_type not in ('technical_college','community_college','high_school_cte','workforce_program','other')
   or length(coalesce(p_city,''))>120 or length(coalesce(p_state,''))>40 then raise exception 'Invalid institution details'; end if;
 v_payload:=jsonb_build_object('name',btrim(p_name),'type',p_institution_type,'city',nullif(btrim(p_city),''),'state',nullif(btrim(p_state),''));
 perform pg_advisory_xact_lock(hashtextextended('institution-create:'||(select auth.uid())::text||':'||p_request_key::text,0));
 select * into v_receipt from public.wf_institution_creation_receipts where actor_auth_user_id=(select auth.uid()) and request_key=p_request_key;
 if found then
   if v_receipt.payload<>v_payload then raise exception 'Request key was already used for different details'; end if;
   return jsonb_build_object('institutionId',v_receipt.institution_id,'created',false);
 end if;
 -- Serialize same-name/location requests, preventing accidental duplicate institutions.
 perform pg_advisory_xact_lock(hashtextextended('institution-name:'||lower(btrim(p_name))||':'||lower(coalesce(btrim(p_city),''))||':'||lower(coalesce(btrim(p_state),'')),0));
 if exists(select 1 from public.wf_institutions where lower(btrim(name))=lower(btrim(p_name))
   and lower(coalesce(btrim(city),''))=lower(coalesce(btrim(p_city),''))
   and lower(coalesce(btrim(state),''))=lower(coalesce(btrim(p_state),''))) then
   raise exception 'That institution already exists. Use the existing institution';
 end if;
 insert into public.wf_institutions(name,institution_type,city,state,active)
 values(btrim(p_name),p_institution_type,nullif(btrim(p_city),''),nullif(btrim(p_state),''),true) returning * into v_institution;
 insert into public.wf_institution_creation_receipts(actor_auth_user_id,request_key,institution_id,payload)
 values((select auth.uid()),p_request_key,v_institution.institution_id,v_payload);
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
 values((select auth.uid()),security.current_legacy_user_id(),'workforce.institution.created','wf_institution',v_institution.institution_id,
   'workforce-web',jsonb_build_object('requestKey',p_request_key,'status','active'));
 return jsonb_build_object('institutionId',v_institution.institution_id,'created',true);
end;
$$;

-- Marketing intake uses the existing pilot-request status vocabulary only.
-- No Auth, user, membership, institution or account provisioning side effects.
create table public.wf_access_requests(
 request_id uuid primary key default gen_random_uuid(),contact_name text not null check(length(contact_name) between 1 and 120),
 email text not null check(length(email) between 3 and 254),requested_role text not null check(requested_role in ('student','educator','employer')),
 intent text not null check(intent in ('demo','access','both')),organization_name text check(length(organization_name)<=160),
 message text check(length(message)<=2000),status text not null default 'new' check(status in ('new','contacted','qualified','scheduled','closed')),
 created_at timestamptz not null default now());
create index wf_access_requests_email_created_idx on public.wf_access_requests(email,created_at desc);
alter table public.wf_access_requests enable row level security;
revoke all on public.wf_access_requests from public,anon,authenticated,service_role;

create function security.marketing_access_request(p_contact_name text,p_email text,p_requested_role text,p_intent text,p_organization_name text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(btrim(p_email));
begin
 if nullif(btrim(p_contact_name),'') is null or length(p_contact_name)>120
   or v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or p_requested_role is null or p_requested_role not in ('student','educator','employer')
   or p_intent is null or p_intent not in ('demo','access','both')
   or length(coalesce(p_organization_name,''))>160 or length(coalesce(p_message,''))>2000 then raise exception 'Invalid access request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('marketing-access:'||v_email,0));
 if not exists(select 1 from public.wf_access_requests where email=v_email and created_at>now()-interval '5 minutes') then
   insert into public.wf_access_requests(contact_name,email,requested_role,intent,organization_name,message)
   values(btrim(p_contact_name),v_email,p_requested_role,p_intent,nullif(btrim(p_organization_name),''),nullif(btrim(p_message),''));
 end if;
 return jsonb_build_object('ok',true);
end;
$$;

create function security.platform_access_requests_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not security.institution_provisioning_super_admin() then raise exception 'Active platform Super Admin required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from
   (select request_id,contact_name,email,requested_role,intent,organization_name,message,status,created_at
    from public.wf_access_requests order by created_at desc limit 100) r),'[]'::jsonb);
end;
$$;

create function public.onboarding_institutions_directory() returns jsonb language sql security invoker set search_path='' as $$ select security.onboarding_institutions_directory(); $$;
create function public.save_educator_onboarding(p_profile_data jsonb,p_current_step integer default 1,p_complete boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select security.save_educator_onboarding(p_profile_data,p_current_step,p_complete); $$;
create function public.platform_institutions_list() returns jsonb language sql security invoker set search_path='' as $$ select security.platform_institutions_list(); $$;
create function public.platform_institution_create(p_request_key uuid,p_name text,p_institution_type text,p_city text default null,p_state text default null)
returns jsonb language sql security invoker set search_path='' as $$ select security.platform_institution_create(p_request_key,p_name,p_institution_type,p_city,p_state); $$;
create function public.marketing_access_request(p_contact_name text,p_email text,p_requested_role text,p_intent text,p_organization_name text default null,p_message text default null)
returns jsonb language sql security invoker set search_path='' as $$ select security.marketing_access_request(p_contact_name,p_email,p_requested_role,p_intent,p_organization_name,p_message); $$;
create function public.platform_access_requests_list() returns jsonb language sql security invoker set search_path='' as $$ select security.platform_access_requests_list(); $$;

revoke all on function security.institution_provisioning_super_admin(),security.onboarding_educator_affiliation(text),
 security.onboarding_institutions_directory(),security.save_educator_onboarding(jsonb,integer,boolean),
 security.platform_institutions_list(),security.platform_institution_create(uuid,text,text,text,text),security.platform_access_requests_list(),
 security.marketing_access_request(text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.onboarding_institutions_directory(),public.save_educator_onboarding(jsonb,integer,boolean),
 public.platform_institutions_list(),public.platform_institution_create(uuid,text,text,text,text),public.platform_access_requests_list(),
 public.marketing_access_request(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function security.onboarding_institutions_directory(),security.save_educator_onboarding(jsonb,integer,boolean),
 security.platform_institutions_list(),security.platform_institution_create(uuid,text,text,text,text),security.platform_access_requests_list(),
 public.onboarding_institutions_directory(),public.save_educator_onboarding(jsonb,integer,boolean),
 public.platform_institutions_list(),public.platform_institution_create(uuid,text,text,text,text),public.platform_access_requests_list() to authenticated;
grant execute on function security.marketing_access_request(text,text,text,text,text,text),
 public.marketing_access_request(text,text,text,text,text,text) to service_role;
commit;
