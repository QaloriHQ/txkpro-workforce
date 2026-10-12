-- W12-20: profile posts and attributable social interaction controls.
-- Reuses the canonical W11-01B tables. All client access remains RPC-only.

alter table public.wf_profile_post_comments
  add column if not exists parent_comment_id text
  references public.wf_profile_post_comments(profile_post_comment_id) on delete set null;

alter table public.wf_profile_post_comments
  add constraint wf_profile_post_comments_body_length
  check (char_length(btrim(body)) between 1 and 2000) not valid;
alter table public.wf_profile_post_comments
  validate constraint wf_profile_post_comments_body_length;

alter table public.wf_profile_post_shares
  add constraint wf_profile_post_shares_commentary_length
  check (commentary is null or char_length(commentary) <= 500) not valid;
alter table public.wf_profile_post_shares
  validate constraint wf_profile_post_shares_commentary_length;

create index if not exists wf_profile_post_comments_parent_idx
  on public.wf_profile_post_comments(parent_comment_id, created_at)
  where parent_comment_id is not null;

create or replace function security.community_post_publishable(p_post_id text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1
    from public.wf_profile_posts p
    join public.users u on u.user_id=p.author_user_id and lower(u.status)='active'
    join public.wf_public_pages page on page.public_page_id=p.author_public_page_id
      and page.owner_user_id=p.author_user_id
    where p.profile_post_id=p_post_id
      and p.status='published'
      and p.visibility='public'
      and p.published_at is not null
  );
$$;
revoke all on function security.community_post_publishable(text) from public,anon,authenticated,service_role;

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
    'id',i.profile_post_id,'postType',i.post_type,'authorUserId',i.author_user_id,'authorName',i.display_name,
    'authorImageUrl',i.profile_image_url,'authorProfilePath',i.profile_path,'authorHeadline',i.headline,
    'title',i.title,'body',i.body,'media',i.media,'topic',i.topic,'location',i.location_label,
    'publishedAt',i.published_at,
    'likeCount',(select count(*) from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.reaction_type='like'),
    'commentCount',(select count(*) from public.wf_profile_post_comments c where c.profile_post_id=i.profile_post_id and c.status='published'),
    'shareCount',(select count(*) from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id),
    'viewerLiked',exists(select 1 from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.actor_user_id=v_actor and r.reaction_type='like'),
    'viewerShared',exists(select 1 from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id and s.actor_user_id=v_actor and s.share_type='share'),
    'viewerReposted',exists(select 1 from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id and s.actor_user_id=v_actor and s.share_type='repost'),
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
declare v_actor text:=security.community_actor(); v_page text; v_id text; v_title text; v_body text; v_topic text; v_location text; v_media jsonb; v_type text;
begin
  if coalesce((p_input->>'publicAcknowledged')::boolean,false) is not true then raise exception 'PUBLIC_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023'; end if;
  v_title:=nullif(btrim(p_input->>'title'),''); v_body:=btrim(coalesce(p_input->>'body',''));
  v_topic:=nullif(btrim(p_input->>'topic'),''); v_location:=nullif(btrim(p_input->>'location'),''); v_media:=coalesce(p_input->'media','[]'::jsonb);
  v_type:=lower(coalesce(nullif(btrim(p_input->>'postType'),''),'post'));
  if v_type not in ('post','article','update') or char_length(v_body) not between 1 and 8000
    or char_length(coalesce(v_title,''))>160 or (v_type='article' and v_title is null)
    or char_length(coalesce(v_topic,''))>64 or char_length(coalesce(v_location,''))>120
    then raise exception 'INVALID_POST_INPUT' using errcode='22023'; end if;
  if jsonb_typeof(v_media)<>'array' or jsonb_array_length(v_media)>4 or exists(select 1 from jsonb_array_elements_text(v_media) u where u !~ '^https://')
    then raise exception 'INVALID_POST_MEDIA' using errcode='22023'; end if;
  v_page:=security.community_author_page(v_actor);
  insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,title,body,media,visibility,status,published_at,topic,location_label)
  values(v_page,v_actor,v_type,v_title,v_body,v_media,'public','published',now(),v_topic,v_location) returning profile_post_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values(auth.uid(),v_actor,'COMMUNITY_POST_PUBLISHED','community_post',v_id,'workforce-domain-event',jsonb_build_object('visibility','public','postType',v_type,'topic',v_topic));
  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.community_like_toggle(p_post_id text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_liked boolean; v_page text; v_action text;
begin
  if not security.community_post_publishable(p_post_id) then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  delete from public.wf_profile_post_reactions where profile_post_id=p_post_id and actor_user_id=v_actor and reaction_type='like';
  if found then v_liked:=false; v_action:='COMMUNITY_REACTION_WITHDRAWN'; else
    v_page:=security.community_author_page(v_actor);
    insert into public.wf_profile_post_reactions(profile_post_id,actor_user_id,actor_public_page_id,reaction_type) values(p_post_id,v_actor,v_page,'like');
    v_liked:=true; v_action:='COMMUNITY_REACTION_SET';
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,v_action,'community_post',p_post_id,'workforce-domain-event',jsonb_build_object('reactionType','like'));
  return jsonb_build_object('active',v_liked,'count',(select count(*) from public.wf_profile_post_reactions where profile_post_id=p_post_id and reaction_type='like'));
end;
$$;

create or replace function public.community_comments(p_post_id text,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_items jsonb;
begin
  if not security.community_post_publishable(p_post_id) then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.profile_post_comment_id,'parentId',c.parent_comment_id,'body',c.body,'createdAt',c.created_at,
    'authorName',page.display_name,'authorImageUrl',page.profile_image_url,
    'authorProfilePath',case when page.visibility='public' and page.publication_status='published' then page.canonical_path end,
    'isOwn',c.author_user_id=v_actor
  ) order by c.created_at,c.profile_post_comment_id),'[]'::jsonb) into v_items
  from (select * from public.wf_profile_post_comments where profile_post_id=p_post_id and status='published'
    order by created_at,profile_post_comment_id limit least(greatest(coalesce(p_limit,50),1),100)) c
  join public.users u on u.user_id=c.author_user_id and lower(u.status)='active'
  join public.wf_public_pages page on page.public_page_id=c.author_public_page_id and page.owner_user_id=c.author_user_id;
  return v_items;
end;
$$;

create or replace function public.community_comment_create(p_post_id text,p_body text,p_parent_comment_id text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_page text; v_body text:=btrim(coalesce(p_body,'')); v_id text; v_created timestamptz;
begin
  if not security.community_post_publishable(p_post_id) then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'INVALID_COMMENT' using errcode='22023'; end if;
  if p_parent_comment_id is not null and not exists(
    select 1 from public.wf_profile_post_comments c where c.profile_post_comment_id=p_parent_comment_id
      and c.profile_post_id=p_post_id and c.status='published'
  ) then raise exception 'INVALID_COMMENT_PARENT' using errcode='22023'; end if;
  v_page:=security.community_author_page(v_actor);
  insert into public.wf_profile_post_comments(profile_post_id,parent_comment_id,author_user_id,author_public_page_id,body,status)
  values(p_post_id,p_parent_comment_id,v_actor,v_page,v_body,'published') returning profile_post_comment_id,created_at into v_id,v_created;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,'COMMUNITY_COMMENT_PUBLISHED','community_comment',v_id,'workforce-domain-event',jsonb_build_object('postId',p_post_id,'parentCommentId',p_parent_comment_id));
  return jsonb_build_object('id',v_id,'parentId',p_parent_comment_id,'body',v_body,'createdAt',v_created);
end;
$$;

create or replace function public.community_share_toggle(p_post_id text,p_share_type text,p_commentary text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_actor text:=security.community_actor(); v_page text; v_type text:=lower(btrim(coalesce(p_share_type,'')));
declare v_commentary text:=nullif(btrim(p_commentary),''); v_active boolean; v_action text;
begin
  if not security.community_post_publishable(p_post_id) then raise exception 'POST_NOT_FOUND' using errcode='22023'; end if;
  if v_type not in ('share','repost') or char_length(coalesce(v_commentary,''))>500 then raise exception 'INVALID_SHARE' using errcode='22023'; end if;
  delete from public.wf_profile_post_shares where profile_post_id=p_post_id and actor_user_id=v_actor and share_type=v_type;
  if found then v_active:=false; v_action:='COMMUNITY_SHARE_WITHDRAWN'; else
    v_page:=security.community_author_page(v_actor);
    insert into public.wf_profile_post_shares(profile_post_id,actor_user_id,actor_public_page_id,share_type,commentary)
    values(p_post_id,v_actor,v_page,v_type,v_commentary);
    v_active:=true; v_action:='COMMUNITY_SHARE_CONFIRMED';
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
  values(auth.uid(),v_actor,v_action,'community_post',p_post_id,'workforce-domain-event',jsonb_build_object('shareType',v_type));
  return jsonb_build_object('active',v_active,'shareType',v_type,
    'count',(select count(*) from public.wf_profile_post_shares where profile_post_id=p_post_id));
end;
$$;

-- Restore RPC privileges explicitly; direct table grants remain revoked with RLS enabled.
revoke all on function public.community_comments(text,integer), public.community_comment_create(text,text,text),
  public.community_share_toggle(text,text,text) from public,anon;
grant execute on function public.community_comments(text,integer), public.community_comment_create(text,text,text),
  public.community_share_toggle(text,text,text) to authenticated;
revoke all on function public.community_feed(text,text,timestamptz,text,integer), public.community_post_create(jsonb),
  public.community_like_toggle(text) from public,anon;
grant execute on function public.community_feed(text,text,timestamptz,text,integer), public.community_post_create(jsonb),
  public.community_like_toggle(text) to authenticated;
