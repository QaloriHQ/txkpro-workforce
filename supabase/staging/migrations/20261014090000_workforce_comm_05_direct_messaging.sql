-- COMM-05 / #269: private direct messaging and first-contact requests.
-- All reads and writes are participant-scoped RPCs. Message content is never
-- copied into analytics or ordinary audit metadata.

create table if not exists public.wf_conversations (
  conversation_id text primary key default security.new_legacy_id('CONV'),
  conversation_type text not null default 'direct' check(conversation_type in ('direct','group')),
  direct_pair_key text unique,
  status text not null default 'active' check(status in ('active','archived','closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((conversation_type='direct' and direct_pair_key is not null) or (conversation_type='group' and direct_pair_key is null))
);

create table if not exists public.wf_conversation_members (
  conversation_id text not null references public.wf_conversations(conversation_id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  membership_status text not null default 'active' check(membership_status in ('active','left','removed','banned')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key(conversation_id,user_id)
);

create table if not exists public.wf_message_requests (
  request_id text primary key default security.new_legacy_id('MSGR'),
  sender_user_id text not null references public.users(user_id) on delete cascade,
  recipient_user_id text not null references public.users(user_id) on delete cascade,
  initial_body text not null default '' check(char_length(initial_body)<=4000),
  attachments jsonb not null default '[]'::jsonb,
  client_key uuid not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','blocked','expired')),
  conversation_id text references public.wf_conversations(conversation_id) on delete set null,
  expires_at timestamptz not null default now()+interval '7 days',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(sender_user_id<>recipient_user_id),
  check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=4),
  check(initial_body<>'' or jsonb_array_length(attachments)>0),
  unique(sender_user_id,client_key)
);

create unique index if not exists wf_message_requests_pending_pair_idx
  on public.wf_message_requests(sender_user_id,recipient_user_id) where status='pending';
create index if not exists wf_message_requests_recipient_idx
  on public.wf_message_requests(recipient_user_id,status,created_at desc);

create table if not exists public.wf_messages (
  message_id text primary key default security.new_legacy_id('MSG'),
  conversation_id text not null references public.wf_conversations(conversation_id) on delete cascade,
  sender_user_id text not null references public.users(user_id) on delete cascade,
  body text not null default '' check(char_length(body)<=4000),
  attachments jsonb not null default '[]'::jsonb,
  client_key uuid not null,
  source_request_id text unique references public.wf_message_requests(request_id) on delete set null,
  status text not null default 'sent' check(status in ('sent','redacted','removed')),
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=4),
  check(status<>'sent' or body<>'' or jsonb_array_length(attachments)>0),
  unique(sender_user_id,client_key)
);

create index if not exists wf_messages_conversation_idx on public.wf_messages(conversation_id,sent_at,message_id);
create index if not exists wf_conversation_members_user_idx on public.wf_conversation_members(user_id,membership_status,conversation_id);

alter table public.wf_conversations enable row level security;
alter table public.wf_conversation_members enable row level security;
alter table public.wf_message_requests enable row level security;
alter table public.wf_messages enable row level security;
revoke all on table public.wf_conversations,public.wf_conversation_members,public.wf_message_requests,public.wf_messages from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('community-messages','community-messages',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Storage remains service-only. Authenticated clients receive bytes exclusively
-- through participant-authorized application routes.

create or replace function security.messaging_actor()
returns text language sql stable security definer set search_path='' as $$
  select security.community_actor();
$$;

create or replace function security.messaging_pair(p_a text,p_b text)
returns text language sql immutable set search_path='' as $$
  select least(p_a,p_b)||':'||greatest(p_a,p_b);
$$;

create or replace function security.messaging_attachment_metadata(p_items jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(item-'storagePath' order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as value(item,ordinal);
$$;

create or replace function security.messaging_attachments_valid(p_actor text,p_items jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select jsonb_typeof(coalesce(p_items,'[]'::jsonb))='array'
    and jsonb_array_length(coalesce(p_items,'[]'::jsonb))<=4
    and octet_length(coalesce(p_items,'[]'::jsonb)::text)<=12000
    and not exists(
      select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) item
      where jsonb_typeof(item)<>'object' or item-array['storagePath','name','mime','size']::text[]<>'{}'::jsonb
        or item->>'storagePath' !~ ('^'||p_actor||'/[0-9a-f-]{36}$')
        or coalesce(item->>'name','')='' or char_length(item->>'name')>160
        or coalesce(item->>'mime','') not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')
        or coalesce((item->>'size')::bigint,0) not between 1 and 10485760
        or not exists(select 1 from storage.objects o where o.bucket_id='community-messages' and o.name=item->>'storagePath'
          and (o.metadata->>'size')::bigint=(item->>'size')::bigint and o.metadata->>'mimetype'=item->>'mime')
    );
$$;

create or replace function public.community_message_people(p_query text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor(); v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'name',x.display_name,'imageUrl',x.profile_image_url,
    'conversationId',(select c.conversation_id from public.wf_conversations c where c.direct_pair_key=security.messaging_pair(v_actor,x.user_id) and c.status='active')) order by x.display_name),'[]'::jsonb)
  into v_items from (
    select u.user_id,coalesce(p.display_name,nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'TXKPRO member') display_name,p.profile_image_url
    from public.users u left join lateral(select display_name,profile_image_url from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true
    where lower(u.status)='active' and u.user_id<>v_actor
      and exists(select 1 from public.app_role_memberships m where m.user_id=u.user_id and lower(m.status)='active')
      and security.community_relationship_allowed(v_actor,u.user_id)
      and (nullif(btrim(p_query),'') is null or coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name)) ilike '%'||btrim(p_query)||'%')
    order by display_name limit 20
  ) x;
  return v_items;
end;
$$;

create or replace function public.community_message_request_create(p_recipient_user_id text,p_body text,p_attachments jsonb,p_client_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_body text:=btrim(coalesce(p_body,''));v_items jsonb:=coalesce(p_attachments,'[]'::jsonb);v_id text;v_existing public.wf_message_requests%rowtype;
begin
  perform 1 from public.users where user_id=v_actor for update;
  if p_client_key is null then raise exception 'MESSAGE_CLIENT_KEY_REQUIRED' using errcode='22023';end if;
  select * into v_existing from public.wf_message_requests where sender_user_id=v_actor and client_key=p_client_key;
  if found then return jsonb_build_object('requestId',v_existing.request_id,'status',v_existing.status);end if;
  if p_recipient_user_id=v_actor or not exists(select 1 from public.users u where u.user_id=p_recipient_user_id and lower(u.status)='active'
    and exists(select 1 from public.app_role_memberships m where m.user_id=u.user_id and lower(m.status)='active')) then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE' using errcode='22023';end if;
  if not security.community_relationship_allowed(v_actor,p_recipient_user_id) then raise exception 'MESSAGE_BLOCKED' using errcode='42501';end if;
  if char_length(v_body)>4000 or (v_body='' and jsonb_array_length(v_items)=0) or not security.messaging_attachments_valid(v_actor,v_items) then raise exception 'INVALID_MESSAGE' using errcode='22023';end if;
  if exists(select 1 from public.wf_conversations where direct_pair_key=security.messaging_pair(v_actor,p_recipient_user_id) and status='active') then raise exception 'MESSAGE_ALREADY_CONNECTED' using errcode='22023';end if;
  update public.wf_message_requests set status='expired',resolved_at=now(),updated_at=now() where status='pending' and expires_at<=now() and (sender_user_id=v_actor or recipient_user_id=v_actor);
  select * into v_existing from public.wf_message_requests where sender_user_id=v_actor and recipient_user_id=p_recipient_user_id and status='pending';
  if found then return jsonb_build_object('requestId',v_existing.request_id,'status','pending');end if;
  if exists(select 1 from public.wf_message_requests where sender_user_id=p_recipient_user_id and recipient_user_id=v_actor and status='pending') then raise exception 'INCOMING_MESSAGE_REQUEST_EXISTS' using errcode='22023';end if;
  if exists(select 1 from public.wf_message_requests where sender_user_id=v_actor and recipient_user_id=p_recipient_user_id and status='declined' and resolved_at>now()-interval '30 days') then raise exception 'MESSAGE_REQUEST_COOLDOWN' using errcode='42501';end if;
  insert into public.wf_message_requests(sender_user_id,recipient_user_id,initial_body,attachments,client_key) values(v_actor,p_recipient_user_id,v_body,v_items,p_client_key) returning request_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'MESSAGE_REQUEST_CREATED','message_request',v_id,'workforce-domain-event',jsonb_build_object('recipientUserId',p_recipient_user_id,'attachmentCount',jsonb_array_length(v_items)));
  return jsonb_build_object('requestId',v_id,'status','pending');
end;
$$;

create or replace function public.community_message_request_report(p_request_id text,p_reason text,p_details text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();r public.wf_message_requests%rowtype;v_case text;v_report text;v_reason text:=lower(btrim(p_reason));
begin
  if v_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','unsafe','illegal','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'INVALID_REPORT' using errcode='22023';end if;
  select * into r from public.wf_message_requests where request_id=p_request_id and recipient_user_id=v_actor;
  if not found then raise exception 'MESSAGE_REQUEST_NOT_FOUND' using errcode='22023';end if;
  insert into public.wf_community_moderation_cases(target_type,target_id,target_user_id) values('message',r.request_id,r.sender_user_id)
    on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null returning case_id into v_case;
  insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash)
    values(v_case,'message_request',jsonb_build_object('body',r.initial_body,'attachments',security.messaging_attachment_metadata(r.attachments),'status',r.status),md5((jsonb_build_object('body',r.initial_body,'attachments',r.attachments,'status',r.status))::text))
    on conflict(case_id) do update set content_snapshot=excluded.content_snapshot,content_hash=excluded.content_hash,captured_at=now();
  insert into public.wf_community_reports(reporter_user_id,reason,case_id,details,target_type,target_id)
    values(v_actor,v_reason,v_case,nullif(btrim(p_details),''),'message',r.request_id)
    on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,status='submitted',updated_at=now() returning report_id into v_report;
  update public.wf_community_moderation_cases set report_count=(select count(*) from public.wf_community_reports where case_id=v_case),last_reported_at=now(),updated_at=now() where case_id=v_case;
  perform security.community_moderation_triage(v_case);
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',jsonb_build_object('reportId',v_report,'targetType','message','targetId',r.request_id,'reason',v_reason));
  return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);
end;$$;

create or replace function public.community_message_request_resolve(p_request_id text,p_decision text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_decision text:=lower(btrim(p_decision));r public.wf_message_requests%rowtype;v_conversation text;v_message text;
begin
  if v_decision not in ('accept','decline','block','report') then raise exception 'INVALID_REQUEST_DECISION' using errcode='22023';end if;
  select * into r from public.wf_message_requests where request_id=p_request_id for update;
  if not found or r.recipient_user_id<>v_actor then raise exception 'MESSAGE_REQUEST_NOT_FOUND' using errcode='22023';end if;
  if r.status<>'pending' then return jsonb_build_object('requestId',r.request_id,'status',r.status,'conversationId',r.conversation_id);end if;
  if r.expires_at<=now() then update public.wf_message_requests set status='expired',resolved_at=now(),updated_at=now() where request_id=r.request_id;return jsonb_build_object('requestId',r.request_id,'status','expired');end if;
  if v_decision='accept' then
    if not security.community_relationship_allowed(v_actor,r.sender_user_id) then raise exception 'MESSAGE_BLOCKED' using errcode='42501';end if;
    insert into public.wf_conversations(conversation_type,direct_pair_key,last_message_at) values('direct',security.messaging_pair(v_actor,r.sender_user_id),r.created_at)
      on conflict(direct_pair_key) do update set status='active',updated_at=now() returning conversation_id into v_conversation;
    insert into public.wf_conversation_members(conversation_id,user_id,joined_at) values(v_conversation,r.sender_user_id,r.created_at),(v_conversation,r.recipient_user_id,r.created_at)
      on conflict(conversation_id,user_id) do update set membership_status='active';
    insert into public.wf_messages(conversation_id,sender_user_id,body,attachments,client_key,source_request_id,sent_at)
      values(v_conversation,r.sender_user_id,r.initial_body,r.attachments,r.client_key,r.request_id,r.created_at)
      on conflict(source_request_id) do update set source_request_id=excluded.source_request_id returning message_id into v_message;
    update public.wf_message_requests set status='accepted',conversation_id=v_conversation,resolved_at=now(),updated_at=now() where request_id=r.request_id;
  elsif v_decision='decline' then update public.wf_message_requests set status='declined',resolved_at=now(),updated_at=now() where request_id=r.request_id;
  elsif v_decision='block' then
    insert into public.wf_community_blocks(blocker_user_id,blocked_user_id,mode) values(v_actor,r.sender_user_id,'block') on conflict(blocker_user_id,blocked_user_id) do update set mode='block',updated_at=now();
    update public.wf_message_requests set status='blocked',resolved_at=now(),updated_at=now() where request_id=r.request_id;
  else
    perform public.community_message_request_report(r.request_id,'other',null);
    update public.wf_message_requests set status='declined',resolved_at=now(),updated_at=now() where request_id=r.request_id;
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'MESSAGE_REQUEST_RESOLVED','message_request',r.request_id,'workforce-domain-event',jsonb_build_object('decision',v_decision,'conversationId',v_conversation));
  return jsonb_build_object('requestId',r.request_id,'status',case when v_decision='accept' then 'accepted' when v_decision in ('decline','report') then 'declined' else 'blocked' end,'conversationId',v_conversation,'messageId',v_message);
end;
$$;

create or replace function public.community_messaging_inbox()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_result jsonb;
begin
  select jsonb_build_object(
    'incomingRequests',coalesce((select jsonb_agg(jsonb_build_object('requestId',r.request_id,'userId',r.sender_user_id,'name',coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name),'TXKPRO member'),'imageUrl',p.profile_image_url,'body',r.initial_body,'attachments',security.messaging_attachment_metadata(r.attachments),'createdAt',r.created_at,'expiresAt',r.expires_at) order by r.created_at desc)
      from public.wf_message_requests r join public.users u on u.user_id=r.sender_user_id left join lateral(select display_name,profile_image_url from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true
      where r.recipient_user_id=v_actor and r.status='pending' and r.expires_at>now()),'[]'::jsonb),
    'outgoingRequests',coalesce((select jsonb_agg(jsonb_build_object('requestId',r.request_id,'userId',r.recipient_user_id,'name',coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name),'TXKPRO member'),'status',case when r.status='pending' and r.expires_at<=now() then 'expired' else r.status end,'createdAt',r.created_at) order by r.created_at desc)
      from public.wf_message_requests r join public.users u on u.user_id=r.recipient_user_id left join lateral(select display_name from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true
      where r.sender_user_id=v_actor and r.created_at>now()-interval '60 days'),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object('conversationId',c.conversation_id,'userId',other.user_id,'name',coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name),'TXKPRO member'),'imageUrl',p.profile_image_url,
      'lastMessage',case when lm.status='sent' then left(lm.body,160) else 'Message unavailable' end,'lastMessageAt',lm.sent_at,
      'unreadCount',(select count(*) from public.wf_messages unread where unread.conversation_id=c.conversation_id and unread.sender_user_id<>v_actor and unread.sent_at>coalesce(me.last_read_at,'epoch'::timestamptz))) order by coalesce(lm.sent_at,c.created_at) desc)
      from public.wf_conversation_members me join public.wf_conversations c on c.conversation_id=me.conversation_id and c.status='active'
      join public.wf_conversation_members other on other.conversation_id=c.conversation_id and other.user_id<>v_actor and other.membership_status='active'
      join public.users u on u.user_id=other.user_id left join lateral(select display_name,profile_image_url from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true
      left join lateral(select * from public.wf_messages where conversation_id=c.conversation_id order by sent_at desc,message_id desc limit 1)lm on true
      where me.user_id=v_actor and me.membership_status='active'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.community_conversation_messages(p_conversation_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_items jsonb;
begin
  if not exists(select 1 from public.wf_conversation_members where conversation_id=p_conversation_id and user_id=v_actor and membership_status='active') then raise exception 'CONVERSATION_NOT_FOUND' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('messageId',m.message_id,'senderUserId',m.sender_user_id,'senderName',coalesce(p.display_name,concat_ws(' ',u.first_name,u.last_name),'TXKPRO member'),'isOwn',m.sender_user_id=v_actor,'body',case when m.status='sent' then m.body else '' end,'attachments',case when m.status='sent' then security.messaging_attachment_metadata(m.attachments) else '[]'::jsonb end,'status',m.status,'sentAt',m.sent_at) order by m.sent_at,m.message_id),'[]'::jsonb)
  into v_items from (select * from public.wf_messages where conversation_id=p_conversation_id order by sent_at desc,message_id desc limit 100)m
  join public.users u on u.user_id=m.sender_user_id left join lateral(select display_name from public.wf_public_pages where owner_user_id=u.user_id order by created_at limit 1)p on true;
  return v_items;
end;
$$;

create or replace function public.community_message_send(p_conversation_id text,p_body text,p_attachments jsonb,p_client_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_body text:=btrim(coalesce(p_body,''));v_items jsonb:=coalesce(p_attachments,'[]'::jsonb);v_other text;v_id text;v_at timestamptz;
begin
  perform 1 from public.users where user_id=v_actor for update;
  select other.user_id into v_other from public.wf_conversation_members me join public.wf_conversations c on c.conversation_id=me.conversation_id and c.status='active'
    join public.wf_conversation_members other on other.conversation_id=c.conversation_id and other.user_id<>v_actor and other.membership_status='active'
    where me.conversation_id=p_conversation_id and me.user_id=v_actor and me.membership_status='active' and c.conversation_type='direct';
  if v_other is null then raise exception 'CONVERSATION_NOT_FOUND' using errcode='22023';end if;
  if not security.community_relationship_allowed(v_actor,v_other) or security.community_restricted(v_actor,'interactions') then raise exception 'MESSAGE_BLOCKED' using errcode='42501';end if;
  if p_client_key is null or char_length(v_body)>4000 or (v_body='' and jsonb_array_length(v_items)=0) or not security.messaging_attachments_valid(v_actor,v_items) then raise exception 'INVALID_MESSAGE' using errcode='22023';end if;
  select message_id,sent_at into v_id,v_at from public.wf_messages where sender_user_id=v_actor and client_key=p_client_key;
  if found then return jsonb_build_object('messageId',v_id,'sentAt',v_at);end if;
  insert into public.wf_messages(conversation_id,sender_user_id,body,attachments,client_key) values(p_conversation_id,v_actor,v_body,v_items,p_client_key) returning message_id,sent_at into v_id,v_at;
  update public.wf_conversations set last_message_at=v_at,updated_at=now() where conversation_id=p_conversation_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'MESSAGE_SENT','message',v_id,'workforce-domain-event',jsonb_build_object('conversationId',p_conversation_id,'attachmentCount',jsonb_array_length(v_items)));
  return jsonb_build_object('messageId',v_id,'sentAt',v_at);
end;
$$;

create or replace function public.community_conversation_read(p_conversation_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();begin
  update public.wf_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_actor and membership_status='active';
  if not found then raise exception 'CONVERSATION_NOT_FOUND' using errcode='22023';end if;
  return jsonb_build_object('conversationId',p_conversation_id,'read',true);
end;$$;

create or replace function public.community_message_redact(p_message_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();begin
  update public.wf_messages set body='',attachments='[]'::jsonb,status='redacted',updated_at=now() where message_id=p_message_id and sender_user_id=v_actor and status='sent';
  if not found and not exists(select 1 from public.wf_messages where message_id=p_message_id and sender_user_id=v_actor and status='redacted') then raise exception 'MESSAGE_NOT_FOUND' using errcode='22023';end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source)
    values(auth.uid(),v_actor,'MESSAGE_REDACTED','message',p_message_id,'workforce-domain-event');
  return jsonb_build_object('messageId',p_message_id,'status','redacted');
end;$$;

create or replace function public.community_message_attachment(p_scope text,p_id text,p_index int)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();v_items jsonb;v_item jsonb;
begin
  if p_index<0 or p_index>3 then return null;end if;
  if p_scope='message' then
    select m.attachments into v_items from public.wf_messages m join public.wf_conversation_members cm on cm.conversation_id=m.conversation_id
      where m.message_id=p_id and m.status='sent' and cm.user_id=v_actor and cm.membership_status='active';
  elsif p_scope='request' then
    select attachments into v_items from public.wf_message_requests where request_id=p_id and (sender_user_id=v_actor or recipient_user_id=v_actor);
  else return null;end if;
  v_item:=v_items->p_index;
  if v_item is null then return null;end if;
  return jsonb_build_object('storagePath',v_item->>'storagePath','name',v_item->>'name','mime',v_item->>'mime','size',(v_item->>'size')::bigint);
end;$$;

create or replace function public.community_message_report(p_message_id text,p_reason text,p_details text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.messaging_actor();m public.wf_messages%rowtype;v_case text;v_report text;v_reason text:=lower(btrim(p_reason));
begin
  if v_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','unsafe','illegal','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'INVALID_REPORT' using errcode='22023';end if;
  select msg.* into m from public.wf_messages msg join public.wf_conversation_members cm on cm.conversation_id=msg.conversation_id
    where msg.message_id=p_message_id and cm.user_id=v_actor and cm.membership_status='active';
  if not found or m.sender_user_id=v_actor then raise exception 'MESSAGE_NOT_FOUND' using errcode='22023';end if;
  insert into public.wf_community_moderation_cases(target_type,target_id,target_user_id) values('message',m.message_id,m.sender_user_id)
    on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null returning case_id into v_case;
  insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash)
    values(v_case,'message',jsonb_build_object('body',m.body,'attachments',security.messaging_attachment_metadata(m.attachments),'status',m.status),md5((jsonb_build_object('body',m.body,'attachments',m.attachments,'status',m.status))::text))
    on conflict(case_id) do update set content_snapshot=excluded.content_snapshot,content_hash=excluded.content_hash,captured_at=now();
  insert into public.wf_community_reports(reporter_user_id,reason,case_id,details,target_type,target_id)
    values(v_actor,v_reason,v_case,nullif(btrim(p_details),''),'message',m.message_id)
    on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,status='submitted',updated_at=now() returning report_id into v_report;
  update public.wf_community_moderation_cases set report_count=(select count(*) from public.wf_community_reports where case_id=v_case),last_reported_at=now(),updated_at=now() where case_id=v_case;
  perform security.community_moderation_triage(v_case);
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',jsonb_build_object('reportId',v_report,'targetType','message','targetId',m.message_id,'reason',v_reason));
  return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);
end;$$;

-- Report resolution may remove/restore only the specifically reported message.
create or replace function security.community_moderation_apply_state(p_type text,p_id text,p_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_type='post' then update public.wf_profile_posts set status=p_state,updated_at=now() where profile_post_id=p_id;
  elsif p_type='comment' then update public.wf_profile_post_comments set status=p_state,updated_at=now() where profile_post_comment_id=p_id;
  elsif p_type='message' then
    update public.wf_messages set status=case when p_state='published' then 'sent' else 'removed' end,updated_at=now() where message_id=p_id and status<>'redacted';
    if not found then update public.wf_message_requests set status=case when p_state='published' and expires_at>now() then 'pending' else 'blocked' end,updated_at=now() where request_id=p_id;end if;
  else raise exception 'CONTENT_TARGET_REQUIRED' using errcode='22023';end if;
  if not found then raise exception 'MODERATION_TARGET_NOT_FOUND' using errcode='22023';end if;
end;$$;

revoke all on function security.messaging_actor(),security.messaging_pair(text,text),security.messaging_attachment_metadata(jsonb),security.messaging_attachments_valid(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.community_message_people(text),public.community_message_request_create(text,text,jsonb,uuid),public.community_message_request_report(text,text,text),public.community_message_request_resolve(text,text),public.community_messaging_inbox(),public.community_conversation_messages(text),public.community_message_send(text,text,jsonb,uuid),public.community_conversation_read(text),public.community_message_redact(text),public.community_message_attachment(text,text,int),public.community_message_report(text,text,text) from public,anon;
grant execute on function public.community_message_people(text),public.community_message_request_create(text,text,jsonb,uuid),public.community_message_request_report(text,text,text),public.community_message_request_resolve(text,text),public.community_messaging_inbox(),public.community_conversation_messages(text),public.community_message_send(text,text,jsonb,uuid),public.community_conversation_read(text),public.community_message_redact(text),public.community_message_attachment(text,text,int),public.community_message_report(text,text,text) to authenticated;

comment on table public.wf_messages is 'COMM-05 private participant-only messages. Content is excluded from indexing, ad targeting and analytics.';
