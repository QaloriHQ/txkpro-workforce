create or replace function public.retention_claim_due_milestones(p_limit integer default 50)
returns table(message_id text,milestone_id text,placement_id text,day_number integer,student_id text,recipient_user_id text,recipient_phone text,consent_status text,employer_id text,institution_id text,role_title text)
language plpgsql security invoker set search_path=''
as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,50),200)); v_row record; v_message_id text;
begin
 for v_row in
  select rm.milestone_id,rm.placement_id,rm.day_number,p.student_id,p.employer_id,p.role_title,
         sp.user_id recipient_user_id,sp.school_id institution_id,u.phone recipient_phone,coalesce(sc.status,'unknown') consent_status
  from public.wf_retention_milestones rm
  join public.wf_placements p on p.placement_id=rm.placement_id
  join public.wf_student_profiles sp on sp.student_id=p.student_id
  join public.users u on u.user_id=sp.user_id
  left join public.wf_sms_consents sc on sc.user_id=sp.user_id and sc.category='retention'
  where rm.status in ('pending','due') and rm.scheduled_for<=now() and p.status='active'
    and not exists(select 1 from public.wf_retention_messages msg where msg.milestone_id=rm.milestone_id and msg.channel='sms')
  order by rm.scheduled_for,rm.milestone_id for update of rm skip locked limit v_limit
 loop
  update public.wf_retention_milestones set status='sending',updated_at=now()
   where public.wf_retention_milestones.milestone_id=v_row.milestone_id and status in ('pending','due');
  insert into public.wf_retention_messages(milestone_id,recipient_user_id,recipient_phone,channel,template_version,delivery_status)
   values(v_row.milestone_id,v_row.recipient_user_id,v_row.recipient_phone,'sms','retention_v1','sending')
   returning public.wf_retention_messages.message_id into v_message_id;
  perform security.emit_workforce_event('RETENTION_MILESTONE_DUE','retention_milestone',v_row.milestone_id,v_row.employer_id,v_row.institution_id,v_row.student_id,
   jsonb_build_object('status','pending'),jsonb_build_object('status','sending','dayNumber',v_row.day_number),
   jsonb_build_object('channel','sms','source','retention_scheduler'),'success','retention_milestone_due:'||v_row.milestone_id,null);
  return query select v_message_id,v_row.milestone_id::text,v_row.placement_id::text,v_row.day_number::integer,v_row.student_id::text,
   v_row.recipient_user_id::text,v_row.recipient_phone::text,v_row.consent_status::text,v_row.employer_id::text,v_row.institution_id::text,v_row.role_title::text;
 end loop;
end $$;

create or replace function public.retention_mark_message_sent(p_message_id text,p_provider_message_id text,p_provider_status text default 'queued')
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_ctx record; v_status text;
begin
 select msg.delivery_status,msg.milestone_id,rm.placement_id,p.student_id,p.employer_id,sp.school_id institution_id into v_ctx
 from public.wf_retention_messages msg join public.wf_retention_milestones rm on rm.milestone_id=msg.milestone_id
 join public.wf_placements p on p.placement_id=rm.placement_id left join public.wf_student_profiles sp on sp.student_id=p.student_id
 where msg.message_id=p_message_id for update of msg,rm;
 if not found then raise exception 'Retention message not found'; end if;
 if v_ctx.delivery_status in ('sent','delivered') then return jsonb_build_object('ok',true,'idempotent',true); end if;
 if v_ctx.delivery_status not in ('queued','sending') then raise exception 'Retention message not sendable'; end if;
 if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then raise exception 'Provider message id required'; end if;
 v_status:=case when lower(coalesce(p_provider_status,''))='delivered' then 'delivered' else 'sent' end;
 update public.wf_retention_messages set provider_message_id=p_provider_message_id,delivery_status=v_status,sent_at=coalesce(sent_at,now()),
 delivered_at=case when v_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,error_code=null,error_detail=null,updated_at=now()
 where public.wf_retention_messages.message_id=p_message_id;
 update public.wf_retention_milestones set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now()
 where public.wf_retention_milestones.milestone_id=v_ctx.milestone_id and status='sending';
 perform security.emit_workforce_event('RETENTION_MESSAGE_SENT','retention_milestone',v_ctx.milestone_id,v_ctx.employer_id,v_ctx.institution_id,v_ctx.student_id,
 jsonb_build_object('status','sending'),jsonb_build_object('status','sent','messageId',p_message_id,'providerMessageId',p_provider_message_id),
 jsonb_build_object('channel','sms','providerStatus',p_provider_status),'success','retention_message_sent:'||p_message_id,null);
 return jsonb_build_object('ok',true,'messageId',p_message_id,'status',v_status,'idempotent',false);
end $$;

create or replace function public.retention_mark_message_failed(p_message_id text,p_error_code text,p_error_detail text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_mid text;
begin
 select milestone_id into v_mid from public.wf_retention_messages where message_id=p_message_id for update;
 if not found then raise exception 'Retention message not found'; end if;
 update public.wf_retention_messages set delivery_status='failed',error_code=left(coalesce(p_error_code,'send_failed'),120),error_detail=left(coalesce(p_error_detail,''),2000),updated_at=now()
 where message_id=p_message_id and delivery_status in ('queued','sending');
 update public.wf_retention_milestones set status='failed',updated_at=now() where milestone_id=v_mid and status='sending';
 return jsonb_build_object('ok',true,'messageId',p_message_id,'status','failed');
end $$;

create or replace function public.retention_mark_message_skipped(p_message_id text,p_reason text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_mid text;
begin
 select milestone_id into v_mid from public.wf_retention_messages where message_id=p_message_id for update;
 if not found then raise exception 'Retention message not found'; end if;
 update public.wf_retention_messages set delivery_status='skipped',error_code=left(coalesce(p_reason,'not_sendable'),120),updated_at=now()
 where message_id=p_message_id and delivery_status in ('queued','sending');
 update public.wf_retention_milestones set status='skipped',updated_at=now() where milestone_id=v_mid and status='sending';
 return jsonb_build_object('ok',true,'messageId',p_message_id,'status','skipped');
end $$;

revoke all on function public.retention_claim_due_milestones(integer) from public,anon,authenticated;
revoke all on function public.retention_mark_message_sent(text,text,text) from public,anon,authenticated;
revoke all on function public.retention_mark_message_failed(text,text,text) from public,anon,authenticated;
revoke all on function public.retention_mark_message_skipped(text,text) from public,anon,authenticated;
grant execute on function public.retention_claim_due_milestones(integer) to service_role;
grant execute on function public.retention_mark_message_sent(text,text,text) to service_role;
grant execute on function public.retention_mark_message_failed(text,text,text) to service_role;
grant execute on function public.retention_mark_message_skipped(text,text) to service_role;
