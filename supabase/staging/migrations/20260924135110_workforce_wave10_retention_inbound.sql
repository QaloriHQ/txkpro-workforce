create or replace function public.retention_record_sms_response(
  p_provider_message_id text,p_from_phone text,p_raw_response text,p_received_at timestamptz default now()
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 v_provider_id text:=nullif(btrim(coalesce(p_provider_message_id,'')),'');
 v_phone text:=nullif(btrim(coalesce(p_from_phone,'')),'');
 v_digits text:=regexp_replace(coalesce(p_from_phone,''),'[^0-9]','','g');
 v_raw text:=btrim(coalesce(p_raw_response,''));
 v_upper text:=upper(btrim(coalesce(p_raw_response,'')));
 v_user_id text; v_student_id text; v_existing text; v_open_count int; v_score smallint; v_state text;
 v_ctx record; v_response_id text; v_case_id text; v_case_opened boolean:=false;
begin
 if v_provider_id is null then raise exception 'Provider message id is required'; end if;
 if v_phone is null or v_digits='' then raise exception 'Sender phone is required'; end if;

 select response_id into v_existing from public.wf_retention_responses where provider_message_id=v_provider_id;
 if found then return jsonb_build_object('kind','duplicate','responseId',v_existing); end if;

 if v_upper in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE') then
   select recipient_user_id into v_user_id from public.wf_retention_messages
   where regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g')=v_digits
   order by coalesce(sent_at,created_at) desc limit 1;
   if v_user_id is null then
     select user_id into v_user_id from public.users
     where regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_digits order by updated_at desc limit 1;
   end if;
   if v_user_id is null then return jsonb_build_object('kind','not_found','reason','phone_not_linked'); end if;
   insert into public.wf_sms_consents(user_id,category,status,phone_snapshot,sms_consent_at,consent_source,opt_out_at,updated_at)
   values(v_user_id,'retention','opted_out',v_phone,null,'sms_inbound_stop',coalesce(p_received_at,now()),now())
   on conflict(user_id,category) do update set status='opted_out',phone_snapshot=excluded.phone_snapshot,
     sms_consent_at=null,consent_source='sms_inbound_stop',opt_out_at=coalesce(p_received_at,now()),updated_at=now();
   select student_id into v_student_id from public.wf_student_profiles where user_id=v_user_id limit 1;
   perform security.emit_workforce_event('SMS_CONSENT_OPTED_OUT','student',v_student_id,null,null,v_student_id,null,
     jsonb_build_object('category','retention','status','opted_out'),
     jsonb_build_object('source','sms_inbound','phoneLast4',right(v_digits,4)),
     'success','sms_retention_opt_out:'||v_provider_id,null);
   return jsonb_build_object('kind','opt_out','status','opted_out');
 end if;

 if v_upper in ('START','UNSTOP') then
   select recipient_user_id into v_user_id from public.wf_retention_messages
   where regexp_replace(coalesce(recipient_phone,''),'[^0-9]','','g')=v_digits
   order by coalesce(sent_at,created_at) desc limit 1;
   if v_user_id is null then
     select user_id into v_user_id from public.users
     where regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_digits order by updated_at desc limit 1;
   end if;
   if v_user_id is null then return jsonb_build_object('kind','not_found','reason','phone_not_linked'); end if;
   insert into public.wf_sms_consents(user_id,category,status,phone_snapshot,sms_consent_at,consent_source,opt_out_at,updated_at)
   values(v_user_id,'retention','consented',v_phone,coalesce(p_received_at,now()),'sms_inbound_start',null,now())
   on conflict(user_id,category) do update set status='consented',phone_snapshot=excluded.phone_snapshot,
     sms_consent_at=coalesce(p_received_at,now()),consent_source='sms_inbound_start',opt_out_at=null,updated_at=now();
   return jsonb_build_object('kind','opt_in','status','consented');
 end if;

 if v_raw !~ '^[123]([[:space:]].*)?$' then return jsonb_build_object('kind','invalid'); end if;
 v_score:=left(v_raw,1)::smallint;
 v_state:=case v_score when 1 then 'going_well' when 2 then 'some_friction' else 'needs_help' end;

 select count(*) into v_open_count
 from public.wf_retention_messages msg join public.wf_retention_milestones rm on rm.milestone_id=msg.milestone_id
 where regexp_replace(coalesce(msg.recipient_phone,''),'[^0-9]','','g')=v_digits
   and msg.delivery_status in ('sent','delivered') and rm.status='sent'
   and not exists(select 1 from public.wf_retention_responses r where r.message_id=msg.message_id);

 if v_open_count=0 then return jsonb_build_object('kind','not_found','reason','no_open_retention_message'); end if;
 if v_open_count>1 then return jsonb_build_object('kind','ambiguous','openCount',v_open_count); end if;

 select msg.message_id,msg.milestone_id,msg.recipient_user_id,rm.placement_id,rm.day_number,p.student_id,p.employer_id,sp.school_id institution_id
 into v_ctx
 from public.wf_retention_messages msg join public.wf_retention_milestones rm on rm.milestone_id=msg.milestone_id
 join public.wf_placements p on p.placement_id=rm.placement_id left join public.wf_student_profiles sp on sp.student_id=p.student_id
 where regexp_replace(coalesce(msg.recipient_phone,''),'[^0-9]','','g')=v_digits
   and msg.delivery_status in ('sent','delivered') and rm.status='sent'
   and not exists(select 1 from public.wf_retention_responses r where r.message_id=msg.message_id)
 order by coalesce(msg.sent_at,msg.created_at) desc limit 1 for update of msg,rm;

 insert into public.wf_retention_responses(milestone_id,message_id,recipient_user_id,provider_message_id,sender_phone,raw_response,normalized_score,normalized_state,received_at)
 values(v_ctx.milestone_id,v_ctx.message_id,v_ctx.recipient_user_id,v_provider_id,v_phone,left(v_raw,1000),v_score,v_state,coalesce(p_received_at,now()))
 returning response_id into v_response_id;

 update public.wf_retention_milestones set status='responded',response_received_at=coalesce(p_received_at,now()),updated_at=now()
 where milestone_id=v_ctx.milestone_id and status='sent';

 perform security.emit_workforce_event('RETENTION_RESPONSE_RECEIVED','retention_milestone',v_ctx.milestone_id,
  v_ctx.employer_id,v_ctx.institution_id,v_ctx.student_id,jsonb_build_object('status','sent'),
  jsonb_build_object('status','responded','normalizedScore',v_score,'normalizedState',v_state),
  jsonb_build_object('channel','sms','responseId',v_response_id),'success','retention_response_received:'||v_response_id,null);

 if v_score=3 then
   insert into public.wf_retention_cases(placement_id,milestone_id,source_response_id,severity,status,summary,opened_at)
   values(v_ctx.placement_id,v_ctx.milestone_id,v_response_id,'high','open',
     'Student requested help during the Day '||v_ctx.day_number||' retention check-in.',coalesce(p_received_at,now()))
   on conflict(milestone_id) do nothing returning case_id into v_case_id;
   if v_case_id is not null then v_case_opened:=true;
   else select case_id into v_case_id from public.wf_retention_cases where milestone_id=v_ctx.milestone_id; end if;

   if v_case_opened then
     insert into public.wf_notifications(recipient_user_id,event_type,target_type,target_id,channel,status,payload)
     select distinct arm.user_id,'RETENTION_CASE_OPENED','retention_case',v_case_id,'in_app','queued',
       jsonb_build_object('caseId',v_case_id,'milestoneId',v_ctx.milestone_id,'placementId',v_ctx.placement_id,
         'studentId',v_ctx.student_id,'severity','high','dayNumber',v_ctx.day_number)
     from public.app_role_memberships arm
     where lower(arm.status)='active' and arm.user_id is not null and (
       (lower(arm.role) in ('super_admin','admin') and lower(arm.scope_type)='platform') or
       (v_ctx.institution_id is not null and lower(arm.scope_type)='institution' and arm.scope_id=v_ctx.institution_id
        and lower(arm.role) in ('institution_admin','department_head','program_coordinator','career_services')));
     perform security.emit_workforce_event('RETENTION_CASE_OPENED','retention_case',v_case_id,
       v_ctx.employer_id,v_ctx.institution_id,v_ctx.student_id,null,
       jsonb_build_object('status','open','severity','high','milestoneId',v_ctx.milestone_id),
       jsonb_build_object('source','retention_response','responseId',v_response_id),
       'success','retention_case_opened:'||v_case_id,null);
   end if;
 end if;

 return jsonb_build_object('kind','recorded','responseId',v_response_id,'milestoneId',v_ctx.milestone_id,
   'normalizedScore',v_score,'normalizedState',v_state,'caseId',v_case_id,'caseOpened',v_case_opened);
end $$;

revoke all on function public.retention_record_sms_response(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.retention_record_sms_response(text,text,text,timestamptz) to service_role;
