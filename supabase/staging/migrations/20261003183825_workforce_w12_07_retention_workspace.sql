-- W12-07: canonical human retention workspace. No employer or skill mutations.
alter table public.wf_retention_cases
  add column version integer not null default 0 check (version >= 0),
  add column next_follow_up_at timestamptz,
  add column contacted_at timestamptz,
  add column closed_at timestamptz;
create index wf_retention_cases_follow_up_idx on public.wf_retention_cases(next_follow_up_at)
  where status not in ('resolved','closed_no_response','cancelled');

-- Technical replay receipts; never a competing source of case state.
create table security.retention_mutation_receipts (
  case_id text not null references public.wf_retention_cases(case_id) on delete cascade,
  actor_auth_user_id uuid not null,
  request_key uuid not null,
  request_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key(case_id,actor_auth_user_id,request_key)
);
alter table security.retention_mutation_receipts enable row level security;
revoke all on security.retention_mutation_receipts from public,anon,authenticated;

create function security.retention_platform_admin(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.users u join public.app_role_memberships r
    on r.auth_user_id=u.auth_user_id
    where u.auth_user_id=p_actor and lower(u.status)='active'
      and lower(r.status)='active' and lower(r.scope_type)='platform'
      and lower(r.role) in ('super_admin','admin','platform_admin'));
$$;

-- Legacy Program/Department labels can exist in more than one Institution.
-- Bind invitation-created memberships to their canonical Institution; fail closed
-- for ambiguous legacy labels until an explicitly bound invitation is accepted.
create function security.retention_membership_matches(p_membership_id uuid,p_institution_id text,p_cohort_id text default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_role_memberships r
   join public.wf_institutions i on i.institution_id=p_institution_id and i.active=true
   where r.id=p_membership_id
     and security.institution_scope_matches(p_institution_id,r.scope_type,r.scope_id,p_cohort_id)
     and (lower(r.scope_type) in ('institution','cohort') or (
       lower(r.scope_type) in ('program','department') and (
         exists(select 1 from public.wf_user_invitations inv
           where inv.membership_key=r.membership_key and inv.status='accepted'
             and r.source='canonical_invitation:'||inv.invitation_id
             and inv.institution_id=p_institution_id
             and security.canonical_institution_role(inv.role)=security.canonical_institution_role(r.role)
             and inv.scope_type=lower(r.scope_type) and inv.scope_id=r.scope_id)
         or (r.source not like 'canonical_invitation:%' and
           (select count(*) from public.wf_institutions ci where ci.active=true
             and security.institution_scope_matches(ci.institution_id,r.scope_type,r.scope_id,null))=1)
       )
     )));
$$;

-- Check a single membership's role AND scope; never combine two memberships.
create function security.retention_actor_access(p_actor uuid,p_case_id text,p_manage boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(security.retention_platform_admin(p_actor) or exists(
    select 1 from public.wf_retention_cases rc
    join public.wf_placements p on p.placement_id=rc.placement_id
    join public.wf_student_profiles s on s.student_id=p.student_id
    join public.users u on u.auth_user_id=p_actor and lower(u.status)='active'
    join public.app_role_memberships r on r.auth_user_id=u.auth_user_id
    where rc.case_id=p_case_id and lower(r.status)='active'
      and security.canonical_institution_role(r.role) = any(case when p_manage then
        array['institution_super_admin','institution_admin','career_services','program_coordinator','instructor','assistant_instructor']
        else array['institution_super_admin','institution_admin','career_services','program_coordinator','instructor','assistant_instructor','department_head','read_only_analyst'] end)
      and security.institution_role_scope_valid(r.role,r.scope_type)
      and case when lower(r.scope_type)='institution' then security.retention_membership_matches(r.id,s.school_id,null)
        else security.retention_membership_matches(r.id,s.school_id,s.cohort_id)
          and s.cohort_id is not null end
  ),false);
$$;
create function security.retention_workspace_access(p_actor uuid,p_institution_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_institution_id is null then security.retention_platform_admin(p_actor)
 else security.retention_platform_admin(p_actor) or exists(
   select 1 from public.users u join public.app_role_memberships r on r.auth_user_id=u.auth_user_id
   where u.auth_user_id=p_actor and lower(u.status)='active' and lower(r.status)='active'
     and security.institution_role_scope_valid(r.role,r.scope_type)
     and security.retention_membership_matches(r.id,p_institution_id,null)
 ) end;
$$;

create function security.retention_case_payload(p_case_id text,p_detail boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; v_manage boolean;
begin
 if auth.uid() is null or not security.retention_actor_access(auth.uid(),p_case_id,false) then
   raise exception 'Case unavailable in your authorized scope.' using errcode='42501'; end if;
 v_manage:=security.retention_actor_access(auth.uid(),p_case_id,true);
 select jsonb_build_object(
   'caseId',rc.case_id,'placementId',p.placement_id,'studentId',s.student_id,
   'studentName',coalesce(nullif(concat_ws(' ',su.first_name,su.last_name),''),s.preferred_name,'Student'),
   'institutionId',s.school_id,'roleTitle',p.role_title,'cohortName',c.name,
   'status',rc.status,'severity',rc.severity,'ownerUserId',rc.owner_user_id,
   'ownerName',nullif(concat_ws(' ',ou.first_name,ou.last_name),''),
   'openedAt',rc.opened_at,'updatedAt',rc.updated_at,'nextFollowUpAt',rc.next_follow_up_at,
   'contactedAt',rc.contacted_at,'closedAt',rc.closed_at,'resolvedAt',rc.resolved_at,
   'resolutionCode',rc.resolution_code,'milestoneDay',m.day_number,'version',rc.version,'canManage',v_manage
 ) into v from public.wf_retention_cases rc
 join public.wf_placements p on p.placement_id=rc.placement_id
 join public.wf_student_profiles s on s.student_id=p.student_id
 join public.users su on su.user_id=s.user_id
 left join public.users ou on ou.user_id=rc.owner_user_id
 left join public.wf_cohorts c on c.cohort_id=s.cohort_id and c.institution_id=s.school_id
 join public.wf_retention_milestones m on m.milestone_id=rc.milestone_id
 where rc.case_id=p_case_id;
 if v is null then raise exception 'Case unavailable in your authorized scope.' using errcode='42501'; end if;
 if p_detail then
   -- Notes are internal to authorized Institution/TXKPRO operators, including matrix READ roles.
   v:=v || jsonb_build_object('notes',coalesce((select jsonb_agg(jsonb_build_object(
     'noteId',n.note_id,'authorName',coalesce(nullif(concat_ws(' ',u.first_name,u.last_name),''),'Operator'),
     'note',n.note,'createdAt',n.created_at) order by n.created_at,n.note_id)
     from public.wf_retention_case_notes n join public.users u on u.user_id=n.author_user_id
     where n.case_id=p_case_id),'[]'::jsonb),
     'eligibleOwners',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
       'userId',u.user_id,'name',coalesce(nullif(concat_ws(' ',u.first_name,u.last_name),''),'Operator'))
       order by u.first_name,u.last_name,u.user_id) from public.users u
       where u.auth_user_id is not null and security.retention_actor_access(u.auth_user_id,p_case_id,true)),'[]'::jsonb)
       else '[]'::jsonb end);
 end if;
 return v;
end; $$;

create function security.retention_cases_list(p_institution_id text default null,p_status text default null,
 p_owner text default null,p_query text default null,p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_total integer; v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
begin
 if auth.uid() is null or not security.retention_workspace_access(auth.uid(),p_institution_id) then
   raise exception 'Retention workspace access required.' using errcode='42501'; end if;
 if p_status is not null and p_status not in ('active','open','assigned','contacted','monitoring','resolved','closed_no_response','cancelled') then
   raise exception 'Invalid status filter.' using errcode='22023'; end if;
 if p_owner is not null and p_owner not in ('mine','unassigned') then
   raise exception 'Invalid owner filter.' using errcode='22023'; end if;
 with permitted as (
   select rc.case_id,rc.opened_at,rc.next_follow_up_at from public.wf_retention_cases rc
   join public.wf_placements p on p.placement_id=rc.placement_id
   join public.wf_student_profiles s on s.student_id=p.student_id
   join public.users u on u.user_id=s.user_id
   where (p_institution_id is null or s.school_id=p_institution_id)
     and security.retention_actor_access(auth.uid(),rc.case_id,false)
     and (p_status is null or rc.status=p_status or (p_status='active' and rc.status not in ('resolved','closed_no_response','cancelled')))
     and (p_owner is null or (p_owner='unassigned' and rc.owner_user_id is null)
       or (p_owner='mine' and rc.owner_user_id=(select me.user_id from public.users me where me.auth_user_id=auth.uid())))
     and (nullif(btrim(p_query),'') is null or concat_ws(' ',rc.case_id,u.first_name,u.last_name,p.role_title) ilike '%'||left(p_query,100)||'%')
 ), page as (select * from permitted order by next_follow_up_at nulls last,opened_at,case_id
   offset greatest(coalesce(p_offset,0),0) limit v_limit)
 select (select count(*) from permitted),coalesce((select jsonb_agg(security.retention_case_payload(case_id,false)
   order by next_follow_up_at nulls last,opened_at,case_id) from page),'[]'::jsonb) into v_total,v_items;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',greatest(coalesce(p_offset,0),0),'limit',v_limit);
end; $$;

create function security.retention_case_update(p_case_id text,p_expected_version integer,p_request_key uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_case public.wf_retention_cases%rowtype; v_body jsonb; v_prior jsonb;
 v_actor text; v_student text; v_inst text; v_status text; v_owner text; v_note text; v_resolution text;
 v_follow timestamptz; v_note_id text; v_before jsonb; v_after jsonb;
begin
 if auth.uid() is null or not security.retention_actor_access(auth.uid(),p_case_id,true) then
   raise exception 'Case management permission required in this scope.' using errcode='42501'; end if;
 if p_request_key is null or p_expected_version is null or p_expected_version<0
   or jsonb_typeof(p_command) is distinct from 'object' or p_command='{}'::jsonb then
   raise exception 'Version, request key and command are required.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('status','ownerUserId','note','nextFollowUpAt','resolutionCode')) then
   raise exception 'Unsupported case field.' using errcode='22023'; end if;
 select * into v_case from public.wf_retention_cases where case_id=p_case_id for update;
 -- Serialize first, then revalidate current actor scope and any replay.
 if not security.retention_actor_access(auth.uid(),p_case_id,true) then
   raise exception 'Case management permission required in this scope.' using errcode='42501'; end if;
 v_body:=jsonb_build_object('version',p_expected_version,'command',p_command);
 select request_body into v_prior from security.retention_mutation_receipts
 where case_id=p_case_id and actor_auth_user_id=auth.uid() and request_key=p_request_key;
 if found then
   if v_prior<>v_body then raise exception 'Request key already used for another command.' using errcode='22023'; end if;
   return security.retention_case_payload(p_case_id,true);
 end if;
 if v_case.version<>p_expected_version then raise exception 'Case changed. Refresh before saving.' using errcode='40001'; end if;
 if v_case.status in ('resolved','closed_no_response','cancelled') then
   raise exception 'Closed cases cannot be changed.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(p_command) kv where kv.key in ('status','note','resolutionCode') and jsonb_typeof(kv.value)<>'string')
   or (p_command ? 'ownerUserId' and jsonb_typeof(p_command->'ownerUserId') not in ('string','null'))
   or (p_command ? 'nextFollowUpAt' and jsonb_typeof(p_command->'nextFollowUpAt') not in ('string','null')) then
   raise exception 'Invalid case field type.' using errcode='22023'; end if;
 v_owner:=case when p_command ? 'ownerUserId' then nullif(btrim(p_command->>'ownerUserId'),'') else v_case.owner_user_id end;
 if v_owner is not null and not exists(select 1 from public.users u where u.user_id=v_owner
   and security.retention_actor_access(u.auth_user_id,p_case_id,true)) then
   raise exception 'Owner must have active management access to this case.' using errcode='22023'; end if;
 v_status:=coalesce(p_command->>'status',case when v_case.status='open' and v_owner is not null then 'assigned' else v_case.status end);
 if v_status not in ('open','assigned','contacted','monitoring','resolved','closed_no_response','cancelled')
   or (v_status<>v_case.status and not (
     (v_case.status='open' and v_status in ('assigned','cancelled')) or
     (v_case.status='assigned' and v_status in ('contacted','closed_no_response','cancelled')) or
     (v_case.status='contacted' and v_status in ('monitoring','resolved','closed_no_response','cancelled')) or
     (v_case.status='monitoring' and v_status in ('contacted','resolved','closed_no_response','cancelled')))) then
   raise exception 'Invalid case status transition.' using errcode='22023'; end if;
 if v_status in ('assigned','contacted','monitoring','resolved','closed_no_response') and v_owner is null then
   raise exception 'Assign an eligible owner first.' using errcode='22023'; end if;
 v_note:=nullif(btrim(p_command->>'note'),'');
 if p_command ? 'note' and (v_note is null or length(v_note)>4000) then
   raise exception 'Note must contain 1 to 4000 characters.' using errcode='22023'; end if;
 v_resolution:=case when p_command ? 'resolutionCode' then nullif(btrim(p_command->>'resolutionCode'),'') else v_case.resolution_code end;
 if length(v_resolution)>120 then raise exception 'Resolution code must be at most 120 characters.' using errcode='22023'; end if;
 if v_status in ('resolved','closed_no_response','cancelled') and (v_resolution is null or v_note is null) then
   raise exception 'Closure requires a resolution code and internal note.' using errcode='22023'; end if;
 if p_command ? 'resolutionCode' and v_status not in ('resolved','closed_no_response','cancelled') then
   raise exception 'Resolution code is only used when closing a case.' using errcode='22023'; end if;
 if v_status='contacted' and v_status<>v_case.status and v_note is null then
   raise exception 'Record the contact outcome in an internal note.' using errcode='22023'; end if;
 begin
   v_follow:=case when p_command ? 'nextFollowUpAt' then (p_command->>'nextFollowUpAt')::timestamptz else v_case.next_follow_up_at end;
 exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Invalid follow-up date.' using errcode='22023'; end;
 if v_follow is not null and not isfinite(v_follow) then raise exception 'Invalid follow-up date.' using errcode='22023'; end if;
 if v_status in ('resolved','closed_no_response','cancelled') then v_follow:=null; end if;
 select u.user_id into v_actor from public.users u where u.auth_user_id=auth.uid() and lower(u.status)='active';
 select s.student_id,s.school_id into v_student,v_inst from public.wf_placements p
 join public.wf_student_profiles s on s.student_id=p.student_id where p.placement_id=v_case.placement_id;
 v_before:=jsonb_build_object('status',v_case.status,'ownerUserId',v_case.owner_user_id,'version',v_case.version,'nextFollowUpAt',v_case.next_follow_up_at);
 update public.wf_retention_cases set status=v_status,owner_user_id=v_owner,next_follow_up_at=v_follow,
   contacted_at=case when v_status='contacted' and v_status<>v_case.status then now() else contacted_at end,
   resolved_at=case when v_status='resolved' then now() else resolved_at end,
   closed_at=case when v_status in ('resolved','closed_no_response','cancelled') then now() else closed_at end,
   resolution_code=v_resolution,version=version+1,updated_at=now() where case_id=p_case_id;
 if v_note is not null then
   insert into public.wf_retention_case_notes(case_id,author_user_id,note) values(p_case_id,v_actor,v_note) returning note_id into v_note_id;
 end if;
 v_after:=jsonb_build_object('status',v_status,'ownerUserId',v_owner,'version',v_case.version+1,'nextFollowUpAt',v_follow);
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,
   institution_id,student_id,metadata,before_json,after_json,result)
 values(auth.uid(),v_actor,'retention_case_updated','retention_case',p_case_id,'workforce_retention',v_inst,v_student,
   jsonb_build_object('requestKey',p_request_key,'noteId',v_note_id),v_before,v_after,'success');
 if v_status='resolved' and v_case.status<>'resolved' then
   perform security.emit_workforce_event('RETENTION_CASE_RESOLVED','retention_case',p_case_id,null,v_inst,v_student,
     v_before,v_after,jsonb_build_object('source','workforce_retention'),
     'success','retention_case_resolved:'||p_case_id||':'||p_request_key,p_request_key);
 end if;
 insert into security.retention_mutation_receipts(case_id,actor_auth_user_id,request_key,request_body)
 values(p_case_id,auth.uid(),p_request_key,v_body);
 return security.retention_case_payload(p_case_id,true);
end; $$;

-- Public invoker facades; private definers have fixed search paths and explicit authorization.
revoke all on function security.retention_platform_admin(uuid),security.retention_actor_access(uuid,text,boolean),
 security.retention_membership_matches(uuid,text,text),security.retention_workspace_access(uuid,text),security.retention_case_payload(text,boolean),
 security.retention_cases_list(text,text,text,text,integer,integer),security.retention_case_update(text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function security.retention_case_payload(text,boolean),security.retention_cases_list(text,text,text,text,integer,integer),
 security.retention_case_update(text,integer,uuid,jsonb) to authenticated;
create function public.retention_cases_list(p_institution_id text default null,p_status text default null,p_owner text default null,
 p_query text default null,p_offset integer default 0,p_limit integer default 25) returns jsonb
language sql security invoker set search_path='' as $$ select security.retention_cases_list(p_institution_id,p_status,p_owner,p_query,p_offset,p_limit); $$;
create function public.retention_case_detail(p_case_id text) returns jsonb
language sql security invoker set search_path='' as $$ select security.retention_case_payload(p_case_id,true); $$;
create function public.retention_case_update(p_case_id text,p_expected_version integer,p_request_key uuid,p_command jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select security.retention_case_update(p_case_id,p_expected_version,p_request_key,p_command); $$;
revoke all on function public.retention_cases_list(text,text,text,text,integer,integer),public.retention_case_detail(text),
 public.retention_case_update(text,integer,uuid,jsonb) from public,anon;
grant execute on function public.retention_cases_list(text,text,text,text,integer,integer),public.retention_case_detail(text),
 public.retention_case_update(text,integer,uuid,jsonb) to authenticated;
