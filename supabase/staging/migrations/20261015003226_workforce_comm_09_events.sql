-- COMM-09: event posts, privacy-safe detail projections, and idempotent RSVP state.
create table if not exists public.wf_post_events(
  profile_post_id text primary key references public.wf_profile_posts(profile_post_id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 160),
  description text not null check(char_length(btrim(description)) between 1 and 8000),
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  location_type text not null check(location_type in ('physical','online')),
  venue_name text,
  address_text text,
  online_url text,
  organizer_name text not null check(char_length(btrim(organizer_name)) between 1 and 160),
  status text not null default 'published' check(status in ('draft','published','cancelled','completed')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cancelled_at timestamptz,
  check(ends_at>starts_at),
  check((location_type='physical' and address_text is not null and online_url is null) or (location_type='online' and online_url is not null and address_text is null))
);
create table if not exists public.wf_post_event_rsvps(
  profile_post_id text not null references public.wf_post_events(profile_post_id) on delete cascade,
  user_id text not null references public.users(user_id) on delete cascade,
  status text not null check(status in ('interested','going','not_going')),
  first_qualified_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  primary key(profile_post_id,user_id)
);
create index if not exists wf_post_event_rsvps_user_idx on public.wf_post_event_rsvps(user_id,updated_at desc);
create index if not exists wf_post_events_schedule_idx on public.wf_post_events(starts_at,profile_post_id) where status='published';
alter table public.wf_post_events enable row level security;alter table public.wf_post_event_rsvps enable row level security;
revoke all on table public.wf_post_events,public.wf_post_event_rsvps from public,anon,authenticated;

create or replace function security.community_event_viewable(p_post text,p_actor text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_profile_posts p join public.users u on u.user_id=p.author_user_id and lower(u.status)='active'
 where p.profile_post_id=p_post and p.post_type='event' and p.status='published' and (p.visibility='public' or (p_actor is not null and exists(select 1 from public.wf_community_post_audiences a join public.wf_community_group_memberships m on m.group_id=a.group_id and m.user_id=p_actor and m.status='active' where a.profile_post_id=p.profile_post_id))));
$$;
revoke all on function security.community_event_viewable(text,text) from public,anon,authenticated,service_role;

create or replace function public.community_event_create(p_input jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();page text;pid text;group_id text:=nullif(p_input->>'groupId','');title text:=btrim(coalesce(p_input->>'title',''));description text:=btrim(coalesce(p_input->>'description',''));cover text:=nullif(btrim(coalesce(p_input->>'coverUrl','')),'');tz text:=btrim(coalesce(p_input->>'timezone',''));starts timestamptz;ends timestamptz;kind text:=coalesce(p_input->>'locationType','physical');venue text:=nullif(btrim(coalesce(p_input->>'venueName','')),'');address text:=nullif(btrim(coalesce(p_input->>'address','')),'');online text:=nullif(btrim(coalesce(p_input->>'onlineUrl','')),'');organizer text:=btrim(coalesce(p_input->>'organizerName',''));visibility text:='public';
begin
 if char_length(title) not between 1 and 160 or char_length(description) not between 1 and 8000 or char_length(organizer) not between 1 and 160 or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'INVALID_EVENT';end if;
 begin starts:=(p_input->>'startsAt')::timestamptz;ends:=(p_input->>'endsAt')::timestamptz;exception when others then raise exception 'INVALID_EVENT_TIME';end;
 if starts is null or ends is null or ends<=starts then raise exception 'INVALID_EVENT_TIME';end if;
 if kind='physical' then if address is null then raise exception 'INVALID_EVENT_LOCATION';end if;online:=null;elsif kind='online' then if online is null or online!~* '^https://[^[:space:]]+$' then raise exception 'INVALID_EVENT_LOCATION';end if;address:=null;else raise exception 'INVALID_EVENT_LOCATION';end if;
 if cover is not null and cover!~* '^https://[^[:space:]]+$' then raise exception 'INVALID_EVENT_COVER';end if;
 if group_id is not null then if security.community_group_role(group_id,a) is null then raise exception 'GROUP_ACCESS_DENIED';end if;select case when g.visibility='public' then 'unlisted' else 'private' end into visibility from public.wf_community_groups g where g.group_id=group_id and g.status='active';if visibility is null then raise exception 'GROUP_NOT_FOUND';end if;end if;
 page:=security.community_author_page(a);insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,title,body,media,visibility,status,published_at) values(page,a,'event',title,description,case when cover is null then '[]'::jsonb else jsonb_build_array(cover) end,visibility,'published',now()) returning profile_post_id into pid;
 insert into public.wf_post_events(profile_post_id,title,description,cover_url,starts_at,ends_at,timezone,location_type,venue_name,address_text,online_url,organizer_name) values(pid,title,description,cover,starts,ends,tz,kind,venue,address,online,organizer);
 if group_id is not null then insert into public.wf_community_post_audiences(profile_post_id,group_id) values(pid,group_id);end if;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'COMMUNITY_POST_PUBLISHED','community_event',pid,'workforce-domain-event',jsonb_build_object('postType','event','locationType',kind,'timezone',tz));return jsonb_build_object('id',pid);
end $$;

create or replace function public.community_event(p_post_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a text:=security.community_actor();result jsonb;
begin if not security.community_event_viewable(p_post_id,a) then raise exception 'EVENT_NOT_FOUND';end if;
 select jsonb_build_object('id',e.profile_post_id,'title',e.title,'description',e.description,'coverUrl',e.cover_url,'startsAt',e.starts_at,'endsAt',e.ends_at,'timezone',e.timezone,'locationType',e.location_type,'venueName',e.venue_name,'address',e.address_text,'onlineUrl',case when p.author_user_id=a or exists(select 1 from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.user_id=a and r.status in ('interested','going')) then e.online_url end,'organizerName',e.organizer_name,'status',case when e.status='published' and e.ends_at<=now() then 'completed' else e.status end,'viewerRsvp',(select r.status from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.user_id=a),'isOwn',p.author_user_id=a,'counts',jsonb_build_object('interested',(select count(*) from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.status='interested'),'going',(select count(*) from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.status='going'))) into result from public.wf_post_events e join public.wf_profile_posts p on p.profile_post_id=e.profile_post_id where e.profile_post_id=p_post_id;
 return result;
end $$;

create or replace function public.community_public_event(p_post_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin select jsonb_build_object('found',true,'id',e.profile_post_id,'title',e.title,'description',e.description,'coverUrl',e.cover_url,'startsAt',e.starts_at,'endsAt',e.ends_at,'timezone',e.timezone,'locationType',e.location_type,'venueName',e.venue_name,'address',e.address_text,'organizerName',e.organizer_name,'status',case when e.status='published' and e.ends_at<=now() then 'completed' else e.status end,'canonicalPath','/events/'||e.profile_post_id,'robotsIndex',p.robots_index and page.visibility='public' and page.publication_status='published' and page.robots_index,'robotsFollow',page.robots_follow,'authorName',page.display_name,'authorImageUrl',page.profile_image_url,'authorProfilePath',case when page.visibility='public' and page.publication_status='published' then page.canonical_path end,'counts',jsonb_build_object('interested',(select count(*) from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.status='interested'),'going',(select count(*) from public.wf_post_event_rsvps r where r.profile_post_id=e.profile_post_id and r.status='going'))) into result from public.wf_post_events e join public.wf_profile_posts p on p.profile_post_id=e.profile_post_id join public.users u on u.user_id=p.author_user_id and lower(u.status)='active' join public.wf_public_pages page on page.public_page_id=p.author_public_page_id and page.owner_user_id=p.author_user_id where e.profile_post_id=p_post_id and p.status='published' and p.visibility='public' and e.status in ('published','cancelled');return coalesce(result,jsonb_build_object('found',false));end $$;

create or replace function public.community_event_rsvp(p_post_id text,p_status text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();old_status text;first_at timestamptz;event_status text;
begin if p_status not in ('interested','going','not_going') or not security.community_event_viewable(p_post_id,a) then raise exception 'EVENT_NOT_FOUND';end if;select status into event_status from public.wf_post_events where profile_post_id=p_post_id for update;if event_status<>'published' then raise exception 'EVENT_CLOSED';end if;
 select status,first_qualified_at into old_status,first_at from public.wf_post_event_rsvps where profile_post_id=p_post_id and user_id=a;if old_status=p_status then return jsonb_build_object('status',p_status,'replayed',true);end if;
 if first_at is null and p_status in ('interested','going') then first_at:=now();end if;
 insert into public.wf_post_event_rsvps(profile_post_id,user_id,status,first_qualified_at) values(p_post_id,a,p_status,first_at) on conflict(profile_post_id,user_id) do update set status=excluded.status,first_qualified_at=coalesce(public.wf_post_event_rsvps.first_qualified_at,excluded.first_qualified_at),updated_at=now();
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'EVENT_RSVP_CHANGED','community_event',p_post_id,'workforce-domain-event',jsonb_build_object('previousStatus',old_status,'status',p_status,'qualifying',p_status in ('interested','going')));return jsonb_build_object('status',p_status,'replayed',false);
end $$;

create or replace function public.community_event_cancel(p_post_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a text:=security.community_actor();
begin update public.wf_post_events e set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() from public.wf_profile_posts p where e.profile_post_id=p_post_id and p.profile_post_id=p_post_id and p.author_user_id=a and e.status='published';if not found then if exists(select 1 from public.wf_post_events e join public.wf_profile_posts p on p.profile_post_id=e.profile_post_id where e.profile_post_id=p_post_id and p.author_user_id=a and e.status='cancelled') then return jsonb_build_object('status','cancelled','replayed',true);end if;raise exception 'EVENT_NOT_FOUND';end if;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata) values(auth.uid(),a,'EVENT_CANCELLED','community_event',p_post_id,'workforce-domain-event','{}');return jsonb_build_object('status','cancelled','replayed',false);
end $$;

create or replace function public.community_public_sitemap() returns table(path text,updated_at timestamptz) language sql stable security definer set search_path='' as $$
 select case when p.post_type='event' then '/events/'||p.profile_post_id else '/community/posts/'||p.profile_post_id end,p.updated_at from public.wf_profile_posts p join public.users u on u.user_id=p.author_user_id and lower(u.status)='active' join public.wf_public_pages page on page.public_page_id=p.author_public_page_id and page.owner_user_id=p.author_user_id left join public.wf_post_events e on e.profile_post_id=p.profile_post_id where p.status='published' and p.visibility='public' and p.published_at is not null and p.robots_index and page.visibility='public' and page.publication_status='published' and page.robots_index and (p.post_type<>'event' or e.status in ('published','cancelled')) order by p.published_at desc,p.profile_post_id desc;
$$;

revoke all on function public.community_event_create(jsonb),public.community_event(text),public.community_public_event(text),public.community_event_rsvp(text,text),public.community_event_cancel(text) from public,anon,authenticated;
grant execute on function public.community_event_create(jsonb),public.community_event(text),public.community_event_rsvp(text,text),public.community_event_cancel(text) to authenticated;
grant execute on function public.community_public_event(text) to service_role;
