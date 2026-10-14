-- COMM-06: private group conversations inherit canonical community-group membership.
alter table public.wf_conversations add column if not exists community_group_id text references public.wf_community_groups(group_id) on delete cascade;
alter table public.wf_conversations drop constraint if exists wf_conversations_check;
alter table public.wf_conversations add constraint wf_conversations_shape_check check(
 (conversation_type='direct' and direct_pair_key is not null and community_group_id is null) or
 (conversation_type='group' and direct_pair_key is null and community_group_id is not null));
create unique index if not exists wf_conversations_group_idx on public.wf_conversations(community_group_id) where community_group_id is not null;
alter table public.wf_community_group_memberships add column if not exists invite_expires_at timestamptz;

create or replace function public.community_group_invite(p_group_id text,p_user_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); r text:=security.community_group_role(p_group_id,a);
begin
 if r not in ('admin','moderator') or not exists(select 1 from public.wf_community_groups where group_id=p_group_id and visibility='private' and status='active') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if not exists(select 1 from public.users where user_id=p_user_id and lower(status)='active') then raise exception 'GROUP_MEMBER_NOT_FOUND'; end if;
 insert into public.wf_community_group_memberships(group_id,user_id,role,status,invited_by_user_id,invite_expires_at) values(p_group_id,p_user_id,'member','pending',a,now()+interval '7 days')
 on conflict(group_id,user_id) do update set status='pending',role='member',invited_by_user_id=a,invite_expires_at=now()+interval '7 days',updated_at=now() where public.wf_community_group_memberships.status in ('left','removed');
 return jsonb_build_object('status','pending','expiresAt',now()+interval '7 days');
end $$;

create or replace function public.community_group_join(p_group_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); g public.wf_community_groups; st text;
begin
 select * into g from public.wf_community_groups where group_id=p_group_id and status='active'; if g.group_id is null then raise exception 'GROUP_NOT_FOUND'; end if;
 if g.visibility='private' then
   if not exists(select 1 from public.wf_community_group_memberships where group_id=p_group_id and user_id=a and status='pending' and invited_by_user_id is not null and invite_expires_at>now()) then raise exception 'GROUP_ACCESS_DENIED'; end if;
   update public.wf_community_group_memberships set status='active',joined_at=now(),invite_expires_at=null,updated_at=now() where group_id=p_group_id and user_id=a;
   return jsonb_build_object('status','active');
 end if;
 if exists(select 1 from public.wf_community_group_memberships where group_id=p_group_id and user_id=a and status='banned') then raise exception 'GROUP_ACCESS_DENIED'; end if;
 st:=case when g.join_policy='open' then 'active' else 'pending' end;
 insert into public.wf_community_group_memberships(group_id,user_id,role,status,joined_at) values(p_group_id,a,'member',st,case when st='active' then now() end)
 on conflict(group_id,user_id) do update set status=excluded.status,role='member',joined_at=excluded.joined_at,updated_at=now() where public.wf_community_group_memberships.status in ('left','removed');
 if st='pending' then insert into public.wf_community_group_join_requests(group_id,requester_user_id) values(p_group_id,a) on conflict do nothing; end if;
 return jsonb_build_object('status',st);
end $$;

create or replace function public.community_group_leave(p_group_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor(); r text; admins int;
begin
 select role into r from public.wf_community_group_memberships where group_id=p_group_id and user_id=a and status='active' for update;
 if r is null then raise exception 'GROUP_ACCESS_DENIED'; end if;
 if r='admin' then select count(*) into admins from public.wf_community_group_memberships where group_id=p_group_id and role='admin' and status='active'; if admins<=1 then raise exception 'LAST_GROUP_ADMIN'; end if; end if;
 update public.wf_community_group_memberships set status='left',updated_at=now() where group_id=p_group_id and user_id=a;
 update public.wf_conversation_members set membership_status='left' where user_id=a and conversation_id=(select conversation_id from public.wf_conversations where community_group_id=p_group_id);
 return jsonb_build_object('status','left');
end $$;

create or replace function public.community_group_conversation(p_group_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor(); c text; joined timestamptz; n text;
begin
 select m.joined_at,g.name into joined,n from public.wf_community_group_memberships m join public.wf_community_groups g on g.group_id=m.group_id where m.group_id=p_group_id and m.user_id=a and m.status='active' and g.status='active';
 if joined is null then raise exception 'GROUP_CONVERSATION_DENIED'; end if;
 insert into public.wf_conversations(conversation_type,community_group_id) values('group',p_group_id) on conflict(community_group_id) where community_group_id is not null do update set updated_at=public.wf_conversations.updated_at returning conversation_id into c;
 insert into public.wf_conversation_members(conversation_id,user_id,membership_status,joined_at) values(c,a,'active',joined) on conflict(conversation_id,user_id) do update set membership_status='active',joined_at=greatest(public.wf_conversation_members.joined_at,excluded.joined_at);
 return jsonb_build_object('conversationId',c,'name',n);
end $$;

create or replace function security.group_conversation_member(p_conversation text,p_actor text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_conversations c join public.wf_community_groups g on g.group_id=c.community_group_id join public.wf_community_group_memberships m on m.group_id=g.group_id and m.user_id=p_actor where c.conversation_id=p_conversation and c.conversation_type='group' and c.status='active' and g.status='active' and m.status='active');
$$;

create or replace function public.community_group_conversations() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor(); out jsonb;
begin
 insert into public.wf_conversations(conversation_type,community_group_id)
 select 'group',m.group_id from public.wf_community_group_memberships m join public.wf_community_groups g on g.group_id=m.group_id where m.user_id=a and m.status='active' and g.status='active'
 on conflict(community_group_id) where community_group_id is not null do nothing;
 insert into public.wf_conversation_members(conversation_id,user_id,membership_status,joined_at)
 select c.conversation_id,a,'active',m.joined_at from public.wf_conversations c join public.wf_community_group_memberships m on m.group_id=c.community_group_id where m.user_id=a and m.status='active'
 on conflict(conversation_id,user_id) do update set membership_status='active',joined_at=greatest(public.wf_conversation_members.joined_at,excluded.joined_at);
 select coalesce(jsonb_agg(jsonb_build_object('conversationId',c.conversation_id,'groupId',g.group_id,'conversationType','group','userId',null,'name',g.name,'imageUrl',null,
 'lastMessage',case when lm.status='sent' then left(lm.body,160) else null end,'lastMessageAt',lm.sent_at,'muted',cm.muted,
 'unreadCount',(select count(*) from public.wf_messages x where x.conversation_id=c.conversation_id and x.sender_user_id<>a and x.sent_at>greatest(coalesce(cm.last_read_at,'epoch'),m.joined_at))) order by coalesce(lm.sent_at,c.created_at) desc),'[]'::jsonb) into out
 from public.wf_community_group_memberships m join public.wf_community_groups g on g.group_id=m.group_id and g.status='active' join public.wf_conversations c on c.community_group_id=g.group_id join public.wf_conversation_members cm on cm.conversation_id=c.conversation_id and cm.user_id=a
 left join lateral(select * from public.wf_messages where conversation_id=c.conversation_id and sent_at>=m.joined_at order by sent_at desc,message_id desc limit 1) lm on true where m.user_id=a and m.status='active';
 return out;
end $$;

create or replace function public.community_group_conversation_mute(p_conversation_id text,p_muted boolean) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor();begin if not security.group_conversation_member(p_conversation_id,a) then raise exception 'GROUP_CONVERSATION_DENIED';end if;
 insert into public.wf_conversation_members(conversation_id,user_id,muted) values(p_conversation_id,a,coalesce(p_muted,false)) on conflict(conversation_id,user_id) do update set muted=excluded.muted;
 return jsonb_build_object('muted',coalesce(p_muted,false));end $$;

create or replace function public.community_conversation_messages(p_conversation_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.messaging_actor();items jsonb;since timestamptz;
begin
 select case when c.conversation_type='group' then gm.joined_at else cm.joined_at end into since from public.wf_conversations c left join public.wf_conversation_members cm on cm.conversation_id=c.conversation_id and cm.user_id=a left join public.wf_community_group_memberships gm on gm.group_id=c.community_group_id and gm.user_id=a where c.conversation_id=p_conversation_id and c.status='active' and ((c.conversation_type='direct' and cm.membership_status='active') or (c.conversation_type='group' and gm.status='active'));
 if since is null then raise exception 'CONVERSATION_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('messageId',m.message_id,'senderUserId',m.sender_user_id,'senderName',coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name),'TXKPRO member'),'isOwn',m.sender_user_id=a,'body',case when m.status='sent' then m.body else '' end,'attachments',case when m.status='sent' then security.messaging_attachment_metadata(m.attachments) else '[]'::jsonb end,'status',m.status,'sentAt',m.sent_at) order by m.sent_at,m.message_id),'[]'::jsonb) into items from (select * from public.wf_messages where conversation_id=p_conversation_id and sent_at>=since order by sent_at desc,message_id desc limit 100)m join public.users u on u.user_id=m.sender_user_id left join lateral(select display_name from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true;
 return items;
end $$;

create or replace function public.community_message_send(p_conversation_id text,p_body text,p_attachments jsonb,p_client_key uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor();b text:=btrim(coalesce(p_body,''));items jsonb:=coalesce(p_attachments,'[]');typ text;other text;id text;at timestamptz;
begin
 select conversation_type into typ from public.wf_conversations where conversation_id=p_conversation_id and status='active';
 if typ='direct' then select x.user_id into other from public.wf_conversation_members me join public.wf_conversation_members x on x.conversation_id=me.conversation_id and x.user_id<>a and x.membership_status='active' where me.conversation_id=p_conversation_id and me.user_id=a and me.membership_status='active';if other is null or not security.community_relationship_allowed(a,other) then raise exception 'MESSAGE_BLOCKED';end if;
 elsif typ='group' then if not security.group_conversation_member(p_conversation_id,a) then raise exception 'GROUP_CONVERSATION_DENIED';end if;
 else raise exception 'CONVERSATION_NOT_FOUND';end if;
 if p_client_key is null or char_length(b)>4000 or (b='' and jsonb_array_length(items)=0) or not security.messaging_attachments_valid(a,items) then raise exception 'INVALID_MESSAGE';end if;
 select message_id,sent_at into id,at from public.wf_messages where sender_user_id=a and client_key=p_client_key;if found then return jsonb_build_object('messageId',id,'sentAt',at);end if;
 insert into public.wf_messages(conversation_id,sender_user_id,body,attachments,client_key) values(p_conversation_id,a,b,items,p_client_key) returning message_id,sent_at into id,at;update public.wf_conversations set last_message_at=at,updated_at=now() where conversation_id=p_conversation_id;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'MESSAGE_SENT','message',id,'workforce-domain-event',jsonb_build_object('conversationId',p_conversation_id,'conversationType',typ,'attachmentCount',jsonb_array_length(items)));
 return jsonb_build_object('messageId',id,'sentAt',at);
end $$;

create or replace function public.community_conversation_read(p_conversation_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor();begin if not exists(select 1 from public.wf_conversations c left join public.wf_conversation_members cm on cm.conversation_id=c.conversation_id and cm.user_id=a where c.conversation_id=p_conversation_id and ((c.conversation_type='direct' and cm.membership_status='active') or (c.conversation_type='group' and security.group_conversation_member(c.conversation_id,a)))) then raise exception 'CONVERSATION_NOT_FOUND';end if;
 insert into public.wf_conversation_members(conversation_id,user_id,last_read_at) values(p_conversation_id,a,now()) on conflict(conversation_id,user_id) do update set last_read_at=now(),membership_status='active';return jsonb_build_object('read',true);end $$;

create or replace function public.community_message_attachment(p_scope text,p_id text,p_index int) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.messaging_actor();items jsonb;item jsonb;
begin if p_index<0 or p_index>3 then return null;end if;
 if p_scope='message' then select m.attachments into items from public.wf_messages m join public.wf_conversations c on c.conversation_id=m.conversation_id left join public.wf_conversation_members cm on cm.conversation_id=c.conversation_id and cm.user_id=a where m.message_id=p_id and m.status='sent' and ((c.conversation_type='direct' and cm.membership_status='active') or (c.conversation_type='group' and security.group_conversation_member(c.conversation_id,a))) and (c.conversation_type='direct' or m.sent_at>=(select joined_at from public.wf_community_group_memberships where group_id=c.community_group_id and user_id=a));
 elsif p_scope='request' then select attachments into items from public.wf_message_requests where request_id=p_id and (sender_user_id=a or recipient_user_id=a);else return null;end if;
 item:=items->p_index;if item is null then return null;end if;return jsonb_build_object('storagePath',item->>'storagePath','name',item->>'name','mime',item->>'mime','size',(item->>'size')::bigint);end $$;

create or replace function public.community_message_report(p_message_id text,p_reason text,p_details text default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.messaging_actor();m public.wf_messages%rowtype;v_case text;v_report text;v_reason text:=lower(btrim(p_reason));
begin if v_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','unsafe','illegal','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'INVALID_REPORT';end if;
 select msg.* into m from public.wf_messages msg join public.wf_conversations conv on conv.conversation_id=msg.conversation_id left join public.wf_conversation_members cm on cm.conversation_id=conv.conversation_id and cm.user_id=a where msg.message_id=p_message_id and msg.sender_user_id<>a and ((conv.conversation_type='direct' and cm.membership_status='active') or (conv.conversation_type='group' and security.group_conversation_member(conv.conversation_id,a)));
 if m.message_id is null then raise exception 'MESSAGE_NOT_FOUND';end if;
 insert into public.wf_community_moderation_cases(target_type,target_id,target_user_id) values('message',m.message_id,m.sender_user_id) on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null returning wf_community_moderation_cases.case_id into v_case;
 insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash) values(v_case,'message',jsonb_build_object('body',m.body,'attachments',security.messaging_attachment_metadata(m.attachments),'status',m.status),md5(jsonb_build_object('body',m.body,'attachments',m.attachments,'status',m.status)::text)) on conflict(case_id) do update set content_snapshot=excluded.content_snapshot,content_hash=excluded.content_hash,captured_at=now();
 insert into public.wf_community_reports(reporter_user_id,reason,case_id,details,target_type,target_id) values(a,v_reason,v_case,nullif(btrim(p_details),''),'message',m.message_id) on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,status='submitted',updated_at=now() returning wf_community_reports.report_id into v_report;
 update public.wf_community_moderation_cases set report_count=(select count(*) from public.wf_community_reports where wf_community_reports.case_id=v_case),last_reported_at=now(),updated_at=now() where wf_community_moderation_cases.case_id=v_case;perform security.community_moderation_triage(v_case);
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',jsonb_build_object('reportId',v_report,'targetType','message','targetId',m.message_id,'reason',v_reason));return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);end $$;

revoke all on function security.group_conversation_member(text,text) from public,anon,authenticated,service_role;
revoke all on function public.community_group_leave(text),public.community_group_conversation(text),public.community_group_conversations(),public.community_group_conversation_mute(text,boolean) from public,anon;
grant execute on function public.community_group_leave(text),public.community_group_conversation(text),public.community_group_conversations(),public.community_group_conversation_mute(text,boolean) to authenticated;
