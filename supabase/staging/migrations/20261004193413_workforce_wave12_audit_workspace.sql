-- W12-11: privacy-safe, immutable audit read models. No new domain authority.
create index if not exists platform_audit_events_institution_created_idx
 on public.platform_audit_events(institution_id,created_at desc,id) where institution_id is not null;
create index if not exists wf_domain_events_institution_created_idx
 on public.wf_domain_events(institution_id,created_at desc,event_id) where institution_id is not null;

create function security.audit_workspace_access(p_actor uuid,p_institution_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(security.retention_platform_admin(p_actor) or (
  p_institution_id is not null and exists(
   select 1 from public.users u join public.app_role_memberships r on r.auth_user_id=u.auth_user_id
   where u.auth_user_id=p_actor and lower(u.status)='active' and lower(r.status)='active'
    and security.canonical_institution_role(r.role) in
      ('institution_super_admin','institution_admin','department_head','program_coordinator','read_only_analyst')
    and security.institution_role_scope_valid(r.role,r.scope_type)
    and security.retention_membership_matches(r.id,p_institution_id,null)
  )),false);
$$;

create function security.audit_safe_status(p_snapshot jsonb) returns text
language sql immutable set search_path='' as $$
 select case when p_snapshot->>'status'=any(array[
  'active','inactive','disabled','pending','pending_start','approved','rejected','accepted','revoked',
  'expired','cancelled','ended','open','assigned','contacted','monitoring','resolved','closed_no_response',
  'draft','published','ready','archived','completed','in_progress','not_started','sent','responded',
  'due','sending','skipped','failed','confirmed','verified','requested','scheduled','declined','closed',
  'delivered','viewed','paused','pending_review','blocked']) then p_snapshot->>'status' else null end;
$$;

-- Resolve scope only from canonical records/explicit event columns, never raw JSON.
create function security.audit_record_scope(p_institution_id text,p_student_id text,p_target_type text,p_target_id text)
returns table(institution_id text,student_id text,cohort_id text)
language plpgsql stable security definer set search_path='' as $$
declare v_student text:=p_student_id; v_institution text:=p_institution_id; v_cohort text;
begin
 if v_student is null then
  case lower(p_target_type)
   when 'student' then v_student:=p_target_id;
   when 'student_profile' then v_student:=p_target_id;
   when 'placement' then select p.student_id into v_student from public.wf_placements p where p.placement_id=p_target_id;
   when 'referral' then select r.student_id,r.institution_id into v_student,v_institution from public.wf_referrals r
     where r.referral_id=p_target_id and (p_institution_id is null or r.institution_id=p_institution_id);
   when 'interview_request' then select i.student_id into v_student from public.wf_interview_requests i where i.interview_request_id=p_target_id;
   when 'retention_case' then select p.student_id into v_student from public.wf_retention_cases c
     join public.wf_placements p on p.placement_id=c.placement_id where c.case_id=p_target_id;
   when 'retention_milestone' then select p.student_id into v_student from public.wf_retention_milestones m
     join public.wf_placements p on p.placement_id=m.placement_id where m.milestone_id=p_target_id;
   when 'assignment' then select a.student_id,a.institution_id,a.cohort_id into v_student,v_institution,v_cohort
     from public.wf_micro_cert_assignments a where a.assignment_id=p_target_id
      and (p_institution_id is null or a.institution_id=p_institution_id);
   when 'cohort' then select c.institution_id,c.cohort_id into v_institution,v_cohort from public.wf_cohorts c
     where c.cohort_id=p_target_id and (p_institution_id is null or c.institution_id=p_institution_id);
   when 'institution' then v_institution:=coalesce(p_institution_id,p_target_id);
   else null;
  end case;
 end if;
 if v_student is not null then
  select s.school_id,s.cohort_id into institution_id,cohort_id from public.wf_student_profiles s where s.student_id=v_student;
  if institution_id is null or (v_institution is not null and v_institution<>institution_id) then return; end if;
  student_id:=v_student;
 else institution_id:=v_institution; cohort_id:=v_cohort; student_id:=null;
 end if;
 return next;
end;
$$;

create function security.audit_record_access(p_actor uuid,p_institution_id text,p_cohort_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(security.retention_platform_admin(p_actor) or exists(
  select 1 from public.users u join public.app_role_memberships r on r.auth_user_id=u.auth_user_id
  where u.auth_user_id=p_actor and lower(u.status)='active' and lower(r.status)='active'
   and security.canonical_institution_role(r.role) in
    ('institution_super_admin','institution_admin','department_head','program_coordinator','read_only_analyst')
   and security.institution_role_scope_valid(r.role,r.scope_type)
   and security.retention_membership_matches(r.id,p_institution_id,p_cohort_id)
   and (lower(r.scope_type)='institution' or p_cohort_id is not null)
 ),false);
$$;

create function security.audit_workspace_query(p_institution_id text default null,p_filters jsonb default '{}'::jsonb,p_export boolean default false)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid(); v_platform boolean; v_limit int; v_offset int; v_total bigint; v_items jsonb;
 v_type text:=nullif(upper(btrim(p_filters->>'eventType')),''); v_result text:=nullif(p_filters->>'result','');
 v_record text:=nullif(p_filters->>'recordId',''); v_from timestamptz; v_to timestamptz;
begin
 if v_actor is null or not security.audit_workspace_access(v_actor,p_institution_id) then
  raise exception 'Audit workspace unavailable in your authorized scope.' using errcode='42501'; end if;
 v_platform:=security.retention_platform_admin(v_actor);
 if jsonb_typeof(p_filters)<>'object' or p_filters is null then raise exception 'Invalid filters.' using errcode='22023'; end if;
 if v_type is not null and (length(v_type)>100 or v_type!~'^[A-Z0-9_.:-]+$') then
  raise exception 'Invalid event type.' using errcode='22023'; end if;
 if v_result is not null and v_result not in ('success','denied','failed') then raise exception 'Invalid result.' using errcode='22023'; end if;
 v_offset:=coalesce((p_filters->>'offset')::int,0);
 if v_offset<0 or v_offset>100000 then raise exception 'Invalid page.' using errcode='22023'; end if;
 v_limit:=case when p_export then 1000 else 25 end;
 if p_export then v_offset:=0; end if;
 v_from:=nullif(p_filters->>'from','')::timestamptz; v_to:=nullif(p_filters->>'to','')::timestamptz;
 if v_from is not null and v_to is not null and v_to<=v_from then raise exception 'Invalid date range.' using errcode='22023'; end if;
 if v_record is not null and (length(v_record)>50 or v_record!~'^(audit|domain):[0-9a-f-]{36}$') then
  raise exception 'Invalid record.' using errcode='22023'; end if;
 with records as (
  select 'audit:'||a.id record_id,'audit' record_source,a.action event_type,a.entity_type target_type,a.entity_id target_id,
   a.actor_user_id,a.result,a.institution_id,a.student_id,a.correlation_id,a.created_at,a.before_json,a.after_json
  from public.platform_audit_events a
  union all
  select 'domain:'||d.event_id,'domain',d.event_type,d.target_type,d.target_id,d.actor_user_id,d.result,
   d.institution_id,d.student_id,d.correlation_id,d.created_at,d.before_json,d.after_json
  from public.wf_domain_events d where not exists(
   select 1 from public.platform_audit_events a where a.source='workforce-domain-event'
    and a.correlation_id=d.correlation_id and a.action=d.event_type and a.entity_type=d.target_type
    and a.entity_id is not distinct from d.target_id)
 ), authorized as (
  select r.*,s.institution_id resolved_institution,s.student_id resolved_student from records r
   left join lateral security.audit_record_scope(r.institution_id,r.student_id,r.target_type,r.target_id) s on true
  where (p_institution_id is null or s.institution_id=p_institution_id)
   and (v_platform or (security.audit_record_access(v_actor,s.institution_id,s.cohort_id)
    and upper(r.event_type)=any(array[
     'AUTH_ACCOUNT_CREATED','AUTH_EMAIL_CONFIRMED','ROLE_MEMBERSHIP_CREATED','ROLE_MEMBERSHIP_APPROVED','ROLE_MEMBERSHIP_LINKED',
     'INSTITUTION_APPROVED','ROSTER_IMPORTED','STUDENT_LINKED_TO_COHORT','READINESS_UPDATED',
     'SKILL_SELF_ATTESTED','SKILL_VERIFIED','SKILL_VERIFICATION_REVOKED','REFERRAL_CREATED','REFERRAL_VIEWED',
     'INTERVIEW_REQUESTED','INTERVIEW_RESPONDED','PLACEMENT_CREATED','PLACEMENT_STATUS_CHANGED',
     'RETENTION_MESSAGE_SENT','RETENTION_RESPONSE_RECEIVED','RETENTION_CASE_OPENED','RETENTION_CASE_RESOLVED',
     'RETENTION_CASE_UPDATED','REPORT_EXPORTED','EMPLOYER_LEARNING_ASSIGNED','EMPLOYER_LEARNING_COMPLETED',
     'EMPLOYER_LEARNING_ASSIGNMENT_CREATED','EMPLOYER_LEARNING_ASSIGNMENT_COMPLETED','INVITATION_CREATED',
     'INVITATION_ACCEPTED','INVITATION_REVOKED','INVITATION_APPROVED','INVITATION_REJECTED'])))
   and (v_type is null or upper(r.event_type)=v_type) and (v_result is null or r.result=v_result)
   and (v_record is null or r.record_id=v_record)
   and (v_from is null or r.created_at>=v_from) and (v_to is null or r.created_at<v_to)
 ), paged as (
  select * from authorized order by created_at desc,record_id desc limit v_limit offset v_offset
 )
 select (select count(*) from authorized),coalesce((select jsonb_agg(jsonb_build_object(
  'recordId',record_id,'source',record_source,'eventType',event_type,'targetType',target_type,'targetId',target_id,
  'actorUserId',actor_user_id,'result',result,'institutionId',resolved_institution,'studentId',resolved_student,
  'correlationId',correlation_id,'createdAt',created_at,
  'beforeStatus',security.audit_safe_status(before_json),'afterStatus',security.audit_safe_status(after_json)
 ) order by created_at desc,record_id desc) from paged),'[]'::jsonb) into v_total,v_items;
 if p_export then
  -- Every successful export is attributable. Filter text is not persisted.
  perform security.emit_workforce_event('REPORT_EXPORTED','audit_export',null,null,p_institution_id,null,
   null,null,jsonb_build_object('report','audit_events','rows',jsonb_array_length(v_items),'truncated',v_total>v_limit),'success');
 end if;
 return jsonb_build_object('items',v_items,'total',v_total,'offset',v_offset,'limit',v_limit,
  'hasMore',v_total>v_offset+v_limit,'truncated',p_export and v_total>v_limit);
end;
$$;

create function public.audit_workspace_read(p_institution_id text default null,p_filters jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select security.audit_workspace_query(p_institution_id,p_filters,false);
$$;
create function public.audit_workspace_export(p_institution_id text default null,p_filters jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select security.audit_workspace_query(p_institution_id,p_filters,true);
$$;
revoke all on function security.audit_workspace_access(uuid,text),security.audit_record_scope(text,text,text,text),
 security.audit_record_access(uuid,text,text),security.audit_safe_status(jsonb),security.audit_workspace_query(text,jsonb,boolean)
 from public,anon,authenticated,service_role;
grant execute on function security.audit_workspace_query(text,jsonb,boolean) to authenticated,service_role;
revoke all on function public.audit_workspace_read(text,jsonb),public.audit_workspace_export(text,jsonb) from public,anon;
grant execute on function public.audit_workspace_read(text,jsonb),public.audit_workspace_export(text,jsonb) to authenticated,service_role;
comment on function security.audit_workspace_query(text,jsonb,boolean) is
 'W12-11 guarded projection: active canonical role+scope, safe fields only, no raw snapshots/metadata or auth IDs. Export emits REPORT_EXPORTED.';
