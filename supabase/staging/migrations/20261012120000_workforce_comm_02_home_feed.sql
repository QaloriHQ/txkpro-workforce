-- COMM-02: signed-in Workforce community home feed.
-- Reuses the canonical public-page/post foundation and exposes mutations only through RPCs.

alter table public.wf_public_pages drop constraint if exists wf_public_pages_entity_type_check;
alter table public.wf_public_pages add constraint wf_public_pages_entity_type_check
  check (entity_type in (
    'student','educator','staff','employer','institution','member',
    'course','lesson','credential','post'
  ));

alter table public.wf_profile_posts add column if not exists topic text;
alter table public.wf_profile_posts add column if not exists location_label text;
alter table public.wf_profile_posts add constraint wf_profile_posts_topic_length
  check (topic is null or char_length(topic) between 1 and 64) not valid;
alter table public.wf_profile_posts validate constraint wf_profile_posts_topic_length;
alter table public.wf_profile_posts add constraint wf_profile_posts_location_length
  check (location_label is null or char_length(location_label) between 1 and 120) not valid;
alter table public.wf_profile_posts validate constraint wf_profile_posts_location_length;

create index if not exists wf_profile_posts_feed_idx
  on public.wf_profile_posts(published_at desc, profile_post_id desc)
  where status='published' and visibility='public';
create index if not exists wf_profile_posts_topic_feed_idx
  on public.wf_profile_posts(lower(topic), published_at desc, profile_post_id desc)
  where status='published' and visibility='public' and topic is not null;

create table if not exists public.wf_community_preferences (
  user_id text primary key references public.users(user_id) on delete cascade,
  nearby_location text,
  preferred_topics text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nearby_location is null or char_length(nearby_location) between 1 and 120)
);

create table if not exists public.wf_community_follows (
  follower_user_id text not null references public.users(user_id) on delete cascade,
  followed_user_id text not null references public.users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create table if not exists public.wf_community_saves (
  user_id text not null references public.users(user_id) on delete cascade,
  profile_post_id text not null references public.wf_profile_posts(profile_post_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_post_id)
);

create table if not exists public.wf_community_reports (
  report_id text primary key default security.new_legacy_id('RPT'),
  reporter_user_id text not null references public.users(user_id) on delete cascade,
  profile_post_id text not null references public.wf_profile_posts(profile_post_id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','misinformation','unsafe','other')),
  status text not null default 'submitted' check (status in ('submitted','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_user_id, profile_post_id)
);

alter table public.wf_community_preferences enable row level security;
alter table public.wf_community_follows enable row level security;
alter table public.wf_community_saves enable row level security;
alter table public.wf_community_reports enable row level security;
revoke all on table public.wf_community_preferences, public.wf_community_follows,
  public.wf_community_saves, public.wf_community_reports from public, anon, authenticated;

create or replace function security.community_actor()
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_user text;
begin
  select u.user_id into v_user
  from public.users u
  where u.auth_user_id=auth.uid() and lower(u.status)='active'
    and exists (
      select 1 from public.app_role_memberships m
      where m.user_id=u.user_id and m.auth_user_id=auth.uid() and lower(m.status)='active'
    );
  if v_user is null then raise exception 'COMMUNITY_ACCESS_DENIED' using errcode='42501'; end if;
  return v_user;
end;
$$;

create or replace function security.community_author_page(p_user_id text)
returns text language plpgsql volatile security definer set search_path=''
as $$
declare v_page text; v_name text; v_slug text;
begin
  select p.public_page_id into v_page
  from public.wf_public_pages p
  where p.owner_user_id=p_user_id
    and p.entity_type in ('student','educator','staff','member')
  order by (p.visibility='public' and p.publication_status='published') desc, p.created_at
  limit 1;
  if v_page is not null then return v_page; end if;

  select nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),'') into v_name
  from public.users u where u.user_id=p_user_id;
  if v_name is null then raise exception 'COMMUNITY_USER_NOT_FOUND' using errcode='22023'; end if;
  v_slug := 'member-' || lower(substr(md5(p_user_id),1,12));
  insert into public.wf_public_pages(
    entity_type,entity_id,owner_user_id,slug,canonical_path,visibility,
    publication_status,robots_index,display_name
  ) values ('member',p_user_id,p_user_id,v_slug,'/members/'||v_slug,'private','draft',false,v_name)
  returning public_page_id into v_page;
  return v_page;
end;
$$;

create or replace function public.community_feed(
  p_filter text default 'recent', p_topic text default null,
  p_before timestamptz default null, p_before_id text default null, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
declare v_filter text:=lower(coalesce(nullif(btrim(p_filter),''),'recent')); v_location text; v_items jsonb; v_last jsonb; v_total integer;
begin
  if v_filter not in ('recent','following','nearby','topic') then raise exception 'INVALID_FEED_FILTER' using errcode='22023'; end if;
  select lower(nearby_location) into v_location from public.wf_community_preferences where user_id=v_actor;

  with candidates as (
    select p.*, page.display_name, page.profile_image_url,
      case when page.visibility='public' and page.publication_status='published' then page.canonical_path end profile_path,
      case when page.visibility='public' and page.publication_status='published' then page.headline end headline
    from public.wf_profile_posts p
    join public.wf_public_pages page on page.public_page_id=p.author_public_page_id
    join public.users author on author.user_id=p.author_user_id and lower(author.status)='active'
    where p.status='published' and p.visibility='public' and p.published_at is not null
      and (p_before is null or (p.published_at,p.profile_post_id) < (p_before,coalesce(p_before_id,'~')))
      and (v_filter<>'following' or exists(select 1 from public.wf_community_follows f where f.follower_user_id=v_actor and f.followed_user_id=p.author_user_id))
      and (v_filter<>'nearby' or (v_location is not null and lower(p.location_label)=v_location))
      and (v_filter<>'topic' or (nullif(btrim(p_topic),'') is not null and lower(p.topic)=lower(btrim(p_topic))))
    order by p.published_at desc,p.profile_post_id desc limit v_limit+1
  ), page_items as (
    select * from candidates order by published_at desc,profile_post_id desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.profile_post_id,'authorUserId',i.author_user_id,'authorName',i.display_name,
    'authorImageUrl',i.profile_image_url,'authorProfilePath',i.profile_path,'authorHeadline',i.headline,
    'title',i.title,'body',i.body,'media',i.media,'topic',i.topic,'location',i.location_label,
    'publishedAt',i.published_at,
    'likeCount',(select count(*) from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.reaction_type='like'),
    'commentCount',(select count(*) from public.wf_profile_post_comments c where c.profile_post_id=i.profile_post_id and c.status='published'),
    'shareCount',(select count(*) from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id),
    'viewerLiked',exists(select 1 from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.actor_user_id=v_actor and r.reaction_type='like'),
    'viewerSaved',exists(select 1 from public.wf_community_saves s where s.profile_post_id=i.profile_post_id and s.user_id=v_actor),
    'viewerFollowsAuthor',exists(select 1 from public.wf_community_follows f where f.follower_user_id=v_actor and f.followed_user_id=i.author_user_id),
    'isOwn',i.author_user_id=v_actor
  ) order by i.published_at desc,i.profile_post_id desc),'[]'::jsonb),
  (select to_jsonb(x) from (select published_at,profile_post_id from page_items order by published_at,profile_post_id limit 1) x),
  (select count(*) from candidates)
  into v_items,v_last,v_total from page_items i;
  return jsonb_build_object('items',v_items,'nextCursor',case when v_total>v_limit then v_last else null end,
    'nearbyConfigured',v_location is not null);
end;
$$;

create or replace function public.community_post_create(p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_page text; v_id text; v_title text; v_body text; v_topic text; v_location text; v_media jsonb;
begin
  if coalesce((p_input->>'publicAcknowledged')::boolean,false) is not true then raise exception 'PUBLIC_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023'; end if;
  v_title:=nullif(btrim(p_input->>'title'),''); v_body:=btrim(coalesce(p_input->>'body',''));
  v_topic:=nullif(btrim(p_input->>'topic'),''); v_location:=nullif(btrim(p_input->>'location'),''); v_media:=coalesce(p_input->'media','[]'::jsonb);
  if char_length(v_body) not between 1 and 8000 or char_length(coalesce(v_title,''))>160 or char_length(coalesce(v_topic,''))>64 or char_length(coalesce(v_location,''))>120
    then raise exception 'INVALID_POST_INPUT' using errcode='22023'; end if;
  if jsonb_typeof(v_media)<>'array' or jsonb_array_length(v_media)>4 or exists(select 1 from jsonb_array_elements_text(v_media) u where u !~ '^https://')
    then raise exception 'INVALID_POST_MEDIA' using errcode='22023'; end if;
  v_page:=security.community_author_page(v_actor);
  insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,title,body,media,visibility,status,published_at,topic,location_label)
  values(v_page,v_actor,'post',v_title,v_body,v_media,'public','published',now(),v_topic,v_location) returning profile_post_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'COMMUNITY_POST_PUBLISHED','community_post',v_id,'workforce-domain-event',jsonb_build_object('visibility','public','topic',v_topic));
  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.community_like_toggle(p_post_id text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_liked boolean; v_page text;
begin
  if not exists(select 1 from public.wf_profile_posts where profile_post_id=p_post_id and status='published' and visibility='public') then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  delete from public.wf_profile_post_reactions where profile_post_id=p_post_id and actor_user_id=v_actor and reaction_type='like';
  if found then v_liked:=false; else
    v_page:=security.community_author_page(v_actor);
    insert into public.wf_profile_post_reactions(profile_post_id,actor_user_id,actor_public_page_id,reaction_type) values(p_post_id,v_actor,v_page,'like'); v_liked:=true;
  end if;
  return jsonb_build_object('active',v_liked,'count',(select count(*) from public.wf_profile_post_reactions where profile_post_id=p_post_id and reaction_type='like'));
end;
$$;

create or replace function public.community_save_toggle(p_post_id text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_active boolean;
begin
  if not exists(select 1 from public.wf_profile_posts where profile_post_id=p_post_id and status='published' and visibility='public') then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  delete from public.wf_community_saves where profile_post_id=p_post_id and user_id=v_actor;
  if found then v_active:=false; else insert into public.wf_community_saves(user_id,profile_post_id) values(v_actor,p_post_id); v_active:=true; end if;
  return jsonb_build_object('active',v_active);
end;
$$;

create or replace function public.community_follow_toggle(p_followed_user_id text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_active boolean;
begin
  if p_followed_user_id=v_actor or not exists(select 1 from public.users where user_id=p_followed_user_id and lower(status)='active') then raise exception 'INVALID_FOLLOW_TARGET' using errcode='22023'; end if;
  delete from public.wf_community_follows where follower_user_id=v_actor and followed_user_id=p_followed_user_id;
  if found then v_active:=false; else insert into public.wf_community_follows(follower_user_id,followed_user_id) values(v_actor,p_followed_user_id); v_active:=true; end if;
  return jsonb_build_object('active',v_active);
end;
$$;

create or replace function public.community_preferences_update(p_nearby_location text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_location text:=nullif(btrim(p_nearby_location),'');
begin
  if char_length(coalesce(v_location,''))>120 then raise exception 'INVALID_LOCATION' using errcode='22023'; end if;
  insert into public.wf_community_preferences(user_id,nearby_location) values(v_actor,v_location)
  on conflict(user_id) do update set nearby_location=excluded.nearby_location,updated_at=now();
  return jsonb_build_object('nearbyLocation',v_location);
end;
$$;

create or replace function public.community_report_post(p_post_id text,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_reason text:=lower(btrim(coalesce(p_reason,''))); v_id text;
begin
  if v_reason not in ('spam','harassment','misinformation','unsafe','other') then raise exception 'INVALID_REPORT_REASON' using errcode='22023'; end if;
  if not exists(select 1 from public.wf_profile_posts where profile_post_id=p_post_id and status='published' and visibility='public') then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  insert into public.wf_community_reports(reporter_user_id,profile_post_id,reason) values(v_actor,p_post_id,v_reason)
  on conflict(reporter_user_id,profile_post_id) do update set reason=excluded.reason,status='submitted',updated_at=now()
  returning report_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,'COMMUNITY_POST_REPORTED','community_post',p_post_id,'workforce-domain-event',jsonb_build_object('reportId',v_id,'reason',v_reason));
  return jsonb_build_object('reported',true,'reportId',v_id);
end;
$$;

revoke all on function public.community_feed(text,text,timestamptz,text,integer), public.community_post_create(jsonb),
  public.community_like_toggle(text), public.community_save_toggle(text), public.community_follow_toggle(text),
  public.community_preferences_update(text), public.community_report_post(text,text) from public,anon;
grant execute on function public.community_feed(text,text,timestamptz,text,integer), public.community_post_create(jsonb),
  public.community_like_toggle(text), public.community_save_toggle(text), public.community_follow_toggle(text),
  public.community_preferences_update(text), public.community_report_post(text,text) to authenticated;
