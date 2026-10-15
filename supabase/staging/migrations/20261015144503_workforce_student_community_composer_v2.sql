-- Student Community composer v2: private uploads, resumable drafts, and atomic publishing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-media','community-media',false,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.wf_community_drafts(
  draft_id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(user_id) on delete cascade,
  content_type text not null check(content_type in ('post','article','event','poll')),
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(owner_user_id,content_type)
);
create table if not exists public.wf_community_media_assets(
  asset_id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.users(user_id) on delete cascade,
  draft_id uuid references public.wf_community_drafts(draft_id) on delete cascade,
  profile_post_id text references public.wf_profile_posts(profile_post_id) on delete cascade,
  storage_path text not null unique,public_url text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size integer not null check(byte_size between 1 and 8388608),alt_text text not null default '',
  state text not null default 'draft' check(state in ('draft','published')),
  created_at timestamptz not null default now()
);
create index if not exists wf_community_media_post_idx on public.wf_community_media_assets(profile_post_id) where profile_post_id is not null;
alter table public.wf_community_drafts enable row level security;
alter table public.wf_community_media_assets enable row level security;
revoke all on table public.wf_community_drafts,public.wf_community_media_assets from public,anon,authenticated;

create or replace function security.community_student_actor() returns text language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_actor();
begin
 if not exists(select 1 from public.app_role_memberships m where m.user_id=a and m.auth_user_id=auth.uid() and lower(m.role)='student' and lower(m.status)='active') then raise exception 'STUDENT_ACCESS_REQUIRED' using errcode='42501';end if;
 return a;
end $$;
revoke all on function security.community_student_actor() from public,anon,authenticated,service_role;

create or replace function public.community_student_drafts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_student_actor();result jsonb;
begin select coalesce(jsonb_agg(jsonb_build_object('id',draft_id,'contentType',content_type,'payload',payload,'version',version,'updatedAt',updated_at) order by updated_at desc),'[]'::jsonb) into result from public.wf_community_drafts where owner_user_id=a;return result;end $$;

create or replace function public.community_student_draft_save(p_content_type text,p_payload jsonb,p_draft_id uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();d public.wf_community_drafts;
begin
 if p_content_type not in ('post','article','event','poll') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then raise exception 'INVALID_DRAFT';end if;
 if p_draft_id is not null then
   update public.wf_community_drafts set payload=p_payload,version=version+1,updated_at=now() where draft_id=p_draft_id and owner_user_id=a and content_type=p_content_type returning * into d;
   if d.draft_id is null then raise exception 'DRAFT_NOT_FOUND';end if;
 else
   insert into public.wf_community_drafts(owner_user_id,content_type,payload) values(a,p_content_type,p_payload)
   on conflict(owner_user_id,content_type) do update set payload=excluded.payload,version=public.wf_community_drafts.version+1,updated_at=now() returning * into d;
 end if;
 return jsonb_build_object('id',d.draft_id,'contentType',d.content_type,'payload',d.payload,'version',d.version,'updatedAt',d.updated_at);
end $$;

create or replace function public.community_student_draft_delete(p_draft_id uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();begin delete from public.wf_community_drafts where draft_id=p_draft_id and owner_user_id=a;return found;end $$;

create or replace function public.community_student_media_register(p_asset_id uuid,p_draft_id uuid,p_storage_path text,p_public_url text,p_mime_type text,p_byte_size integer,p_alt_text text default '') returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();id uuid;count_assets integer;
begin
 if not exists(select 1 from public.wf_community_drafts where draft_id=p_draft_id and owner_user_id=a) then raise exception 'DRAFT_NOT_FOUND';end if;
 select count(*) into count_assets from public.wf_community_media_assets where draft_id=p_draft_id and owner_user_id=a;
 if count_assets>=10 or p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif') or p_byte_size not between 1 and 8388608 or p_storage_path!~'^[a-zA-Z0-9/_\.-]+$' or p_public_url!~'^https://[^[:space:]]+$' then raise exception 'INVALID_MEDIA';end if;
 insert into public.wf_community_media_assets(asset_id,owner_user_id,draft_id,storage_path,public_url,mime_type,byte_size,alt_text) values(p_asset_id,a,p_draft_id,p_storage_path,p_public_url,p_mime_type,p_byte_size,left(coalesce(p_alt_text,''),300)) returning asset_id into id;
 return jsonb_build_object('id',id,'url',p_public_url,'altText',left(coalesce(p_alt_text,''),300));
end $$;

create or replace function public.community_student_media_delete(p_asset_id uuid) returns text language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();p text;begin delete from public.wf_community_media_assets where asset_id=p_asset_id and owner_user_id=a and state='draft' returning storage_path into p;if p is null then raise exception 'MEDIA_NOT_FOUND';end if;return p;end $$;

create or replace function public.community_student_media_access(p_asset_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_student_actor();result jsonb;begin select jsonb_build_object('path',m.storage_path,'mimeType',m.mime_type) into result from public.wf_community_media_assets m where m.asset_id=p_asset_id and (m.owner_user_id=a or exists(select 1 from public.wf_profile_posts p where p.profile_post_id=m.profile_post_id and p.status='published' and p.visibility='public'));if result is null then raise exception 'MEDIA_NOT_FOUND';end if;return result;end $$;

create or replace function public.community_public_media_access(p_asset_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('path',a.storage_path,'mimeType',a.mime_type) from public.wf_community_media_assets a join public.wf_profile_posts p on p.profile_post_id=a.profile_post_id where a.asset_id=p_asset_id and a.state='published' and p.status='published' and p.visibility='public';
$$;

create or replace function security.community_student_attach(p_actor text,p_draft uuid,p_post text,p_assets uuid[]) returns void language plpgsql volatile security definer set search_path='' as $$
declare expected integer:=coalesce(array_length(p_assets,1),0);actual integer;
begin
 if not exists(select 1 from public.wf_community_drafts where draft_id=p_draft and owner_user_id=p_actor) then raise exception 'DRAFT_NOT_FOUND';end if;
 if expected>10 then raise exception 'INVALID_MEDIA_COUNT';end if;
 select count(*) into actual from public.wf_community_media_assets where asset_id=any(coalesce(p_assets,'{}'::uuid[])) and owner_user_id=p_actor and draft_id=p_draft and state='draft';
 if actual<>expected then raise exception 'INVALID_MEDIA';end if;
 update public.wf_community_media_assets set profile_post_id=p_post,draft_id=null,state='published' where asset_id=any(coalesce(p_assets,'{}'::uuid[]));
 delete from public.wf_community_drafts where draft_id=p_draft and owner_user_id=p_actor;
end $$;
revoke all on function security.community_student_attach(text,uuid,text,uuid[]) from public,anon,authenticated,service_role;

create or replace function public.community_student_post_publish(p_input jsonb,p_draft_id uuid,p_asset_ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();page text;pid text;urls jsonb;asset_count integer;title text:=nullif(btrim(p_input->>'title'),'');body text:=btrim(coalesce(p_input->>'body',''));topic text:=nullif(btrim(p_input->>'topic'),'');location_label text:=nullif(btrim(p_input->>'location'),'');kind text:=lower(coalesce(nullif(btrim(p_input->>'postType'),''),'post'));
begin
 if security.community_restricted(a,'posting') then raise exception 'COMMUNITY_POSTING_RESTRICTED' using errcode='42501';end if;
 if coalesce((p_input->>'publicAcknowledged')::boolean,false) is not true then raise exception 'PUBLIC_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023';end if;
 if kind not in ('post','article') or char_length(body) not between 1 and 8000 or char_length(coalesce(title,''))>160 or (kind='article' and title is null) or char_length(coalesce(topic,''))>64 or char_length(coalesce(location_label,''))>120 then raise exception 'INVALID_POST_INPUT' using errcode='22023';end if;
 select count(*),coalesce(jsonb_agg(public_url order by created_at),'[]'::jsonb) into asset_count,urls from public.wf_community_media_assets where asset_id=any(coalesce(p_asset_ids,'{}'::uuid[])) and owner_user_id=a and draft_id=p_draft_id and state='draft';
 if asset_count<>coalesce(array_length(p_asset_ids,1),0) or asset_count>10 then raise exception 'INVALID_MEDIA';end if;
 page:=security.community_author_page(a);
 insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,title,body,media,visibility,status,published_at,topic,location_label) values(page,a,kind,title,body,urls,'public','published',now(),topic,location_label) returning profile_post_id into pid;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'COMMUNITY_POST_PUBLISHED','community_post',pid,'workforce-domain-event',jsonb_build_object('visibility','public','postType',kind,'topic',topic,'mediaCount',asset_count));
 perform security.community_student_attach(a,p_draft_id,pid,p_asset_ids);return jsonb_build_object('id',pid);
end $$;
create or replace function public.community_student_event_publish(p_input jsonb,p_draft_id uuid,p_asset_ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();result jsonb;cover text;
begin
 if coalesce(array_length(p_asset_ids,1),0)>1 then raise exception 'INVALID_MEDIA_COUNT';end if;
 select public_url into cover from public.wf_community_media_assets where asset_id=any(coalesce(p_asset_ids,'{}'::uuid[])) and owner_user_id=a and draft_id=p_draft_id and state='draft';
 result:=public.community_event_create(p_input||jsonb_build_object('coverUrl',coalesce(cover,'')));perform security.community_student_attach(a,p_draft_id,result->>'id',p_asset_ids);return result;
end $$;
create or replace function public.community_student_poll_publish(p_input jsonb,p_draft_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_student_actor();result jsonb;begin result:=public.community_poll_create(p_input);perform security.community_student_attach(a,p_draft_id,result->>'id','{}'::uuid[]);return result;end $$;

revoke all on function public.community_student_drafts(),public.community_student_draft_save(text,jsonb,uuid),public.community_student_draft_delete(uuid),public.community_student_media_register(uuid,uuid,text,text,text,integer,text),public.community_student_media_delete(uuid),public.community_student_media_access(uuid),public.community_student_post_publish(jsonb,uuid,uuid[]),public.community_student_event_publish(jsonb,uuid,uuid[]),public.community_student_poll_publish(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.community_student_drafts(),public.community_student_draft_save(text,jsonb,uuid),public.community_student_draft_delete(uuid),public.community_student_media_register(uuid,uuid,text,text,text,integer,text),public.community_student_media_delete(uuid),public.community_student_media_access(uuid),public.community_student_post_publish(jsonb,uuid,uuid[]),public.community_student_event_publish(jsonb,uuid,uuid[]),public.community_student_poll_publish(jsonb,uuid) to authenticated;
revoke all on function public.community_public_media_access(uuid) from public,anon,authenticated;
grant execute on function public.community_public_media_access(uuid) to service_role;
