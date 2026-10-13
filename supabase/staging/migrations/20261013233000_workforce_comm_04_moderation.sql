-- COMM-04 / #268: community reports, blocks, automated triage, appeals and audit.
-- Reporting alone never proves a violation. Automated enforcement requires a
-- versioned objective signal; ambiguous/high-impact cases remain reviewable.

create table if not exists public.wf_community_blocks (
  blocker_user_id text not null references public.users(user_id) on delete cascade,
  blocked_user_id text not null references public.users(user_id) on delete cascade,
  mode text not null check (mode in ('mute','block')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(blocker_user_id,blocked_user_id),
  check(blocker_user_id<>blocked_user_id)
);

create table if not exists public.wf_community_moderation_cases (
  case_id text primary key default security.new_legacy_id('MOD'),
  target_type text not null check (target_type in ('post','comment','user','message')),
  target_id text not null,
  target_user_id text references public.users(user_id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted','reviewing','resolved','dismissed')),
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  automation_state text not null default 'pending'
    check (automation_state in ('pending','monitoring','actioned','needs_review','failed','overridden')),
  priority_score integer not null default 0 check (priority_score between 0 and 100),
  policy_version text not null default 'community-moderation-v1',
  report_count integer not null default 0 check (report_count>=0),
  outcome text,
  decision_summary text,
  assigned_admin_user_id text references public.users(user_id) on delete set null,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_type,target_id)
);

alter table public.wf_community_reports
  add column if not exists case_id text references public.wf_community_moderation_cases(case_id) on delete cascade,
  add column if not exists details text,
  add column if not exists target_type text not null default 'post',
  add column if not exists target_id text;
alter table public.wf_community_reports alter column profile_post_id drop not null;
alter table public.wf_community_reports drop constraint if exists wf_community_reports_reason_check;
alter table public.wf_community_reports add constraint wf_community_reports_reason_check
  check(reason in ('spam','scam','harassment','hate','threat','privacy','impersonation','misinformation','unsafe','illegal','other'));
alter table public.wf_community_reports add constraint wf_community_reports_details_length
  check(details is null or char_length(details)<=2000) not valid;
alter table public.wf_community_reports validate constraint wf_community_reports_details_length;
update public.wf_community_reports set target_id=profile_post_id where target_id is null;
alter table public.wf_community_reports alter column target_id set not null;
alter table public.wf_community_reports add constraint wf_community_reports_target_type_check
  check(target_type in ('post','comment','user','message')) not valid;
alter table public.wf_community_reports validate constraint wf_community_reports_target_type_check;
create unique index if not exists wf_community_reports_reporter_case_key
  on public.wf_community_reports(reporter_user_id,case_id) where case_id is not null;

create table if not exists public.wf_community_moderation_actions (
  action_id text primary key default security.new_legacy_id('MDA'),
  case_id text not null references public.wf_community_moderation_cases(case_id) on delete cascade,
  actor_type text not null check (actor_type in ('system_policy','platform_admin','group_moderator')),
  actor_user_id text references public.users(user_id) on delete set null,
  action text not null check (action in ('no_action','warn','hide_content','remove_content','restore_content','restrict_posting','restrict_interactions','suspend_user','restore_user','escalate')),
  rationale text not null check (char_length(btrim(rationale)) between 8 and 2000),
  policy_version text not null,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  expires_at timestamptz,
  reversed_at timestamptz,
  reversed_by_user_id text references public.users(user_id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.wf_community_moderation_appeals (
  appeal_id text primary key default security.new_legacy_id('APL'),
  case_id text not null references public.wf_community_moderation_cases(case_id) on delete cascade,
  appellant_user_id text not null references public.users(user_id) on delete cascade,
  statement text not null check (char_length(btrim(statement)) between 10 and 4000),
  status text not null default 'submitted' check (status in ('submitted','reviewing','upheld','reversed')),
  decision_reason text,
  decided_by_user_id text references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(case_id,appellant_user_id)
);

create table if not exists public.wf_community_user_restrictions (
  restriction_id text primary key default security.new_legacy_id('RST'),
  user_id text not null references public.users(user_id) on delete cascade,
  case_id text not null references public.wf_community_moderation_cases(case_id) on delete cascade,
  restriction_type text not null check (restriction_type in ('posting','interactions','all_community')),
  status text not null default 'active' check (status in ('active','expired','revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Raw snapshots stay outside the API-exposed public schema. A future COMM-05
-- adapter may attach only the reported message plus bounded context; it may not
-- expose or copy a participant's unrestricted inbox.
create table if not exists security.wf_community_moderation_evidence (
  case_id text primary key references public.wf_community_moderation_cases(case_id) on delete cascade,
  content_type text not null,
  content_snapshot jsonb not null default '{}'::jsonb,
  content_hash text not null,
  captured_at timestamptz not null default now()
);

create index if not exists wf_community_moderation_queue_idx on public.wf_community_moderation_cases(automation_state,status,priority_score desc,last_reported_at desc);
create index if not exists wf_community_reports_case_idx on public.wf_community_reports(case_id,created_at desc);
create index if not exists wf_community_moderation_actions_case_idx on public.wf_community_moderation_actions(case_id,created_at desc);
create index if not exists wf_community_restrictions_active_idx on public.wf_community_user_restrictions(user_id,restriction_type,expires_at) where status='active';
create index if not exists wf_community_blocks_blocked_idx on public.wf_community_blocks(blocked_user_id,blocker_user_id);

alter table public.wf_community_blocks enable row level security;
alter table public.wf_community_moderation_cases enable row level security;
alter table public.wf_community_moderation_actions enable row level security;
alter table public.wf_community_moderation_appeals enable row level security;
alter table public.wf_community_user_restrictions enable row level security;
revoke all on table public.wf_community_blocks,public.wf_community_moderation_cases,
  public.wf_community_moderation_actions,public.wf_community_moderation_appeals,
  public.wf_community_user_restrictions from public,anon,authenticated;
revoke all on table security.wf_community_moderation_evidence from public,anon,authenticated;

create or replace function security.community_relationship_allowed(p_actor text,p_other text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.wf_community_blocks b
    where b.mode='block' and ((b.blocker_user_id=p_actor and b.blocked_user_id=p_other)
      or (b.blocker_user_id=p_other and b.blocked_user_id=p_actor)));
$$;

create or replace function security.community_content_visible(p_actor text,p_author text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.wf_community_blocks b
    where (b.blocker_user_id=p_actor and b.blocked_user_id=p_author)
       or (b.mode='block' and b.blocker_user_id=p_author and b.blocked_user_id=p_actor));
$$;

create or replace function security.community_restricted(p_user text,p_kind text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.wf_community_user_restrictions r where r.user_id=p_user and r.status='active'
    and (r.expires_at is null or r.expires_at>now()) and (r.restriction_type=p_kind or r.restriction_type='all_community'));
$$;

create or replace function security.community_moderation_admin(p_super_only boolean default false)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_user text;
begin
  select u.user_id into v_user from public.users u where u.auth_user_id=auth.uid() and lower(u.status)='active'
    and exists(select 1 from public.app_role_memberships r where r.user_id=u.user_id and r.auth_user_id=auth.uid()
      and lower(r.status)='active' and lower(r.scope_type)='platform'
      and lower(r.role)=any(case when p_super_only then array['super_admin'] else array['super_admin','admin','platform_admin'] end));
  if v_user is null then raise exception 'MODERATION_ADMIN_REQUIRED' using errcode='42501'; end if;
  return v_user;
end;
$$;

create or replace function security.community_moderation_subject()
returns text language plpgsql stable security definer set search_path='' as $$
declare v_user text;
begin
  select u.user_id into v_user from public.users u where u.auth_user_id=auth.uid() and lower(u.status) in ('active','suspended')
    and exists(select 1 from public.app_role_memberships r where r.user_id=u.user_id and r.auth_user_id=auth.uid() and lower(r.status)='active');
  if v_user is null then raise exception 'MODERATION_SUBJECT_REQUIRED' using errcode='42501';end if;
  return v_user;
end;
$$;

create or replace function public.community_block_set(p_user_id text,p_mode text default 'block')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor(); v_mode text:=lower(btrim(p_mode));
begin
  if v_mode not in ('mute','block','none') or p_user_id=v_actor or not exists(select 1 from public.users where user_id=p_user_id and lower(status)='active')
    then raise exception 'INVALID_BLOCK_TARGET' using errcode='22023'; end if;
  if v_mode='none' then delete from public.wf_community_blocks where blocker_user_id=v_actor and blocked_user_id=p_user_id;
  else
    insert into public.wf_community_blocks(blocker_user_id,blocked_user_id,mode) values(v_actor,p_user_id,v_mode)
      on conflict(blocker_user_id,blocked_user_id) do update set mode=excluded.mode,updated_at=now();
    if v_mode='block' then
      delete from public.wf_community_follows where (follower_user_id=v_actor and followed_user_id=p_user_id) or (follower_user_id=p_user_id and followed_user_id=v_actor);
    end if;
  end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_USER_BLOCK_CHANGED','community_user',p_user_id,'workforce-domain-event',jsonb_build_object('mode',v_mode));
  return jsonb_build_object('userId',p_user_id,'mode',v_mode);
end;
$$;

-- Enforce blocks/mutes in the signed-in feed. Content hidden or removed by
-- moderation remains excluded by the existing published-state predicate.
create or replace function public.community_feed(
  p_filter text default 'recent',p_topic text default null,p_before timestamptz default null,
  p_before_id text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.community_actor(); v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_filter text:=lower(coalesce(nullif(btrim(p_filter),''),'recent')); v_location text; v_items jsonb; v_last jsonb; v_total integer;
begin
  if v_filter not in ('recent','following','nearby','topic') then raise exception 'INVALID_FEED_FILTER' using errcode='22023'; end if;
  select lower(nearby_location) into v_location from public.wf_community_preferences where user_id=v_actor;
  with candidates as (
    select p.*,page.display_name,page.profile_image_url,
      case when page.visibility='public' and page.publication_status='published' then page.canonical_path end profile_path,
      case when page.visibility='public' and page.publication_status='published' then page.headline end headline
    from public.wf_profile_posts p join public.wf_public_pages page on page.public_page_id=p.author_public_page_id
    join public.users author on author.user_id=p.author_user_id and lower(author.status)='active'
    where p.status='published' and p.visibility='public' and p.published_at is not null
      and security.community_content_visible(v_actor,p.author_user_id)
      and (p_before is null or (p.published_at,p.profile_post_id)<(p_before,coalesce(p_before_id,'~')))
      and (v_filter<>'following' or exists(select 1 from public.wf_community_follows f where f.follower_user_id=v_actor and f.followed_user_id=p.author_user_id))
      and (v_filter<>'nearby' or (v_location is not null and lower(p.location_label)=v_location))
      and (v_filter<>'topic' or (nullif(btrim(p_topic),'') is not null and lower(p.topic)=lower(btrim(p_topic))))
    order by p.published_at desc,p.profile_post_id desc limit v_limit+1
  ),page_items as (select * from candidates order by published_at desc,profile_post_id desc limit v_limit)
  select coalesce(jsonb_agg(jsonb_build_object('id',i.profile_post_id,'postType',i.post_type,'authorUserId',i.author_user_id,
    'authorName',i.display_name,'authorImageUrl',i.profile_image_url,'authorProfilePath',i.profile_path,'authorHeadline',i.headline,
    'title',i.title,'body',i.body,'media',i.media,'topic',i.topic,'location',i.location_label,'publishedAt',i.published_at,
    'likeCount',(select count(*) from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.reaction_type='like'),
    'commentCount',(select count(*) from public.wf_profile_post_comments c where c.profile_post_id=i.profile_post_id and c.status='published'),
    'shareCount',(select count(*) from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id),
    'viewerLiked',exists(select 1 from public.wf_profile_post_reactions r where r.profile_post_id=i.profile_post_id and r.actor_user_id=v_actor and r.reaction_type='like'),
    'viewerShared',exists(select 1 from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id and s.actor_user_id=v_actor and s.share_type='share'),
    'viewerReposted',exists(select 1 from public.wf_profile_post_shares s where s.profile_post_id=i.profile_post_id and s.actor_user_id=v_actor and s.share_type='repost'),
    'viewerSaved',exists(select 1 from public.wf_community_saves s where s.profile_post_id=i.profile_post_id and s.user_id=v_actor),
    'viewerFollowsAuthor',exists(select 1 from public.wf_community_follows f where f.follower_user_id=v_actor and f.followed_user_id=i.author_user_id),
    'isOwn',i.author_user_id=v_actor) order by i.published_at desc,i.profile_post_id desc),'[]'::jsonb),
    (select to_jsonb(x) from (select published_at,profile_post_id from page_items order by published_at,profile_post_id limit 1)x),
    (select count(*) from candidates) into v_items,v_last,v_total from page_items i;
  return jsonb_build_object('items',v_items,'nextCursor',case when v_total>v_limit then v_last else null end,'nearbyConfigured',v_location is not null);
end;
$$;

create or replace function public.community_like_toggle(p_post_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor(); v_owner text; v_liked boolean; v_page text; v_action text;
begin
  select author_user_id into v_owner from public.wf_profile_posts where profile_post_id=p_post_id;
  if not security.community_post_publishable(p_post_id) or not security.community_relationship_allowed(v_actor,v_owner)
    or security.community_restricted(v_actor,'interactions') then raise exception 'COMMUNITY_INTERACTION_DENIED' using errcode='42501'; end if;
  delete from public.wf_profile_post_reactions where profile_post_id=p_post_id and actor_user_id=v_actor and reaction_type='like';
  if found then v_liked:=false;v_action:='COMMUNITY_REACTION_WITHDRAWN';else
    v_page:=security.community_author_page(v_actor);insert into public.wf_profile_post_reactions(profile_post_id,actor_user_id,actor_public_page_id,reaction_type) values(p_post_id,v_actor,v_page,'like');
    v_liked:=true;v_action:='COMMUNITY_REACTION_SET';end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,v_action,'community_post',p_post_id,'workforce-domain-event',jsonb_build_object('reactionType','like'));
  return jsonb_build_object('active',v_liked,'count',(select count(*) from public.wf_profile_post_reactions where profile_post_id=p_post_id and reaction_type='like'));
end;
$$;

create or replace function public.community_follow_toggle(p_followed_user_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor();v_active boolean;
begin
  if p_followed_user_id=v_actor or not exists(select 1 from public.users where user_id=p_followed_user_id and lower(status)='active')
    or not security.community_relationship_allowed(v_actor,p_followed_user_id) or security.community_restricted(v_actor,'interactions')
    then raise exception 'COMMUNITY_INTERACTION_DENIED' using errcode='42501';end if;
  delete from public.wf_community_follows where follower_user_id=v_actor and followed_user_id=p_followed_user_id;
  if found then v_active:=false;else insert into public.wf_community_follows(follower_user_id,followed_user_id) values(v_actor,p_followed_user_id);v_active:=true;end if;
  return jsonb_build_object('active',v_active);
end;
$$;

create or replace function public.community_post_create(p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor();v_page text;v_id text;v_title text;v_body text;v_topic text;v_location text;v_media jsonb;v_type text;
begin
  if security.community_restricted(v_actor,'posting') then raise exception 'COMMUNITY_POSTING_RESTRICTED' using errcode='42501';end if;
  if coalesce((p_input->>'publicAcknowledged')::boolean,false) is not true then raise exception 'PUBLIC_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023';end if;
  v_title:=nullif(btrim(p_input->>'title'),'');v_body:=btrim(coalesce(p_input->>'body',''));v_topic:=nullif(btrim(p_input->>'topic'),'');
  v_location:=nullif(btrim(p_input->>'location'),'');v_media:=coalesce(p_input->'media','[]'::jsonb);v_type:=lower(coalesce(nullif(btrim(p_input->>'postType'),''),'post'));
  if v_type not in ('post','article','update') or char_length(v_body) not between 1 and 8000 or char_length(coalesce(v_title,''))>160
    or (v_type='article' and v_title is null) or char_length(coalesce(v_topic,''))>64 or char_length(coalesce(v_location,''))>120
    then raise exception 'INVALID_POST_INPUT' using errcode='22023';end if;
  if jsonb_typeof(v_media)<>'array' or jsonb_array_length(v_media)>4 or exists(select 1 from jsonb_array_elements_text(v_media)u where u!~'^https://')
    then raise exception 'INVALID_POST_MEDIA' using errcode='22023';end if;
  v_page:=security.community_author_page(v_actor);
  insert into public.wf_profile_posts(author_public_page_id,author_user_id,post_type,title,body,media,visibility,status,published_at,topic,location_label)
    values(v_page,v_actor,v_type,v_title,v_body,v_media,'public','published',now(),v_topic,v_location) returning profile_post_id into v_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
    values(auth.uid(),v_actor,'COMMUNITY_POST_PUBLISHED','community_post',v_id,'workforce-domain-event',jsonb_build_object('visibility','public','postType',v_type,'topic',v_topic));
  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.community_comments(p_post_id text,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.community_actor();v_owner text;v_items jsonb;
begin
  select author_user_id into v_owner from public.wf_profile_posts where profile_post_id=p_post_id;
  if not security.community_post_publishable(p_post_id) or not security.community_content_visible(v_actor,v_owner) then raise exception 'POST_NOT_FOUND' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.profile_post_comment_id,'parentId',c.parent_comment_id,'body',c.body,'createdAt',c.created_at,
    'authorName',page.display_name,'authorImageUrl',page.profile_image_url,'authorProfilePath',case when page.visibility='public' and page.publication_status='published' then page.canonical_path end,
    'authorUserId',c.author_user_id,'isOwn',c.author_user_id=v_actor) order by c.created_at,c.profile_post_comment_id),'[]'::jsonb) into v_items
  from (select * from public.wf_profile_post_comments where profile_post_id=p_post_id and status='published'
    order by created_at,profile_post_comment_id limit least(greatest(coalesce(p_limit,50),1),100))c
  join public.users u on u.user_id=c.author_user_id and lower(u.status)='active'
  join public.wf_public_pages page on page.public_page_id=c.author_public_page_id and page.owner_user_id=c.author_user_id
  where security.community_content_visible(v_actor,c.author_user_id);
  return v_items;
end;
$$;

create or replace function public.community_comment_create(p_post_id text,p_body text,p_parent_comment_id text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor();v_owner text;v_page text;v_body text:=btrim(coalesce(p_body,''));v_id text;v_created timestamptz;
begin
  select author_user_id into v_owner from public.wf_profile_posts where profile_post_id=p_post_id;
  if not security.community_post_publishable(p_post_id) or not security.community_relationship_allowed(v_actor,v_owner)
    or security.community_restricted(v_actor,'interactions') then raise exception 'COMMUNITY_INTERACTION_DENIED' using errcode='42501';end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'INVALID_COMMENT' using errcode='22023';end if;
  if p_parent_comment_id is not null and not exists(select 1 from public.wf_profile_post_comments c where c.profile_post_comment_id=p_parent_comment_id and c.profile_post_id=p_post_id and c.status='published')
    then raise exception 'INVALID_COMMENT_PARENT' using errcode='22023';end if;
  v_page:=security.community_author_page(v_actor);insert into public.wf_profile_post_comments(profile_post_id,parent_comment_id,author_user_id,author_public_page_id,body,status)
    values(p_post_id,p_parent_comment_id,v_actor,v_page,v_body,'published') returning profile_post_comment_id,created_at into v_id,v_created;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_COMMENT_PUBLISHED','community_comment',v_id,'workforce-domain-event',jsonb_build_object('postId',p_post_id,'parentCommentId',p_parent_comment_id));
  return jsonb_build_object('id',v_id,'parentId',p_parent_comment_id,'body',v_body,'createdAt',v_created);
end;
$$;

create or replace function public.community_share_toggle(p_post_id text,p_share_type text,p_commentary text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor();v_owner text;v_page text;v_type text:=lower(btrim(coalesce(p_share_type,'')));
  v_commentary text:=nullif(btrim(p_commentary),'');v_active boolean;v_action text;
begin
  select author_user_id into v_owner from public.wf_profile_posts where profile_post_id=p_post_id;
  if not security.community_post_publishable(p_post_id) or not security.community_relationship_allowed(v_actor,v_owner)
    or security.community_restricted(v_actor,'interactions') then raise exception 'COMMUNITY_INTERACTION_DENIED' using errcode='42501';end if;
  if v_type not in ('share','repost') or char_length(coalesce(v_commentary,''))>500 then raise exception 'INVALID_SHARE' using errcode='22023';end if;
  delete from public.wf_profile_post_shares where profile_post_id=p_post_id and actor_user_id=v_actor and share_type=v_type;
  if found then v_active:=false;v_action:='COMMUNITY_SHARE_WITHDRAWN';else
    v_page:=security.community_author_page(v_actor);insert into public.wf_profile_post_shares(profile_post_id,actor_user_id,actor_public_page_id,share_type,commentary)
      values(p_post_id,v_actor,v_page,v_type,v_commentary);v_active:=true;v_action:='COMMUNITY_SHARE_CONFIRMED';end if;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,v_action,'community_post',p_post_id,'workforce-domain-event',jsonb_build_object('shareType',v_type));
  return jsonb_build_object('active',v_active,'shareType',v_type,'count',(select count(*) from public.wf_profile_post_shares where profile_post_id=p_post_id));
end;
$$;

create or replace function security.community_moderation_apply_state(p_type text,p_id text,p_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_type='post' then update public.wf_profile_posts set status=p_state,updated_at=now() where profile_post_id=p_id;
  elsif p_type='comment' then update public.wf_profile_post_comments set status=p_state,updated_at=now() where profile_post_comment_id=p_id;
  else raise exception 'CONTENT_TARGET_REQUIRED' using errcode='22023'; end if;
  if not found then raise exception 'MODERATION_TARGET_NOT_FOUND' using errcode='22023'; end if;
end;
$$;

create or replace function security.community_moderation_triage(p_case_id text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_case public.wf_community_moderation_cases%rowtype; v_reason text; v_text text:=''; v_objective_spam boolean:=false; v_prior int:=0;
begin
  select * into v_case from public.wf_community_moderation_cases where case_id=p_case_id for update;
  select reason into v_reason from public.wf_community_reports where case_id=p_case_id order by updated_at desc limit 1;
  select coalesce(content_snapshot->>'body','') into v_text from security.wf_community_moderation_evidence where case_id=p_case_id;
  select count(*) into v_prior from public.wf_community_moderation_actions a join public.wf_community_moderation_cases c on c.case_id=a.case_id
    where c.target_user_id=v_case.target_user_id and a.reversed_at is null and a.created_at>now()-interval '90 days'
      and a.action in ('hide_content','remove_content','restrict_posting','restrict_interactions','suspend_user');
  v_objective_spam:=v_reason in ('spam','scam') and (
    (length(lower(v_text))-length(replace(lower(v_text),'http','')))/4>=2
    or v_text~*'(crypto giveaway|guaranteed income|gift card payment|wire transfer|click here now)');

  if v_reason in ('threat','privacy','illegal','unsafe') then
    update public.wf_community_moderation_cases set severity='critical',priority_score=95,automation_state='needs_review',status='reviewing',updated_at=now() where case_id=p_case_id;
  elsif v_reason in ('harassment','hate','impersonation') then
    update public.wf_community_moderation_cases set severity='high',priority_score=80,automation_state='needs_review',status='reviewing',updated_at=now() where case_id=p_case_id;
  elsif v_objective_spam and v_case.target_type in ('post','comment') then
    perform security.community_moderation_apply_state(v_case.target_type,v_case.target_id,'hidden');
    insert into public.wf_community_moderation_actions(case_id,actor_type,action,rationale,policy_version,confidence)
      values(p_case_id,'system_policy','hide_content','Objective high-confidence spam pattern; content quarantined pending appeal.',v_case.policy_version,0.9700);
    if v_prior>=2 and v_case.target_user_id is not null then
      insert into public.wf_community_user_restrictions(user_id,case_id,restriction_type,expires_at)
        values(v_case.target_user_id,p_case_id,'posting',now()+interval '7 days');
      insert into public.wf_community_moderation_actions(case_id,actor_type,action,rationale,policy_version,confidence,expires_at)
        values(p_case_id,'system_policy','restrict_posting','Repeat upheld spam pattern; posting restricted for seven days.',v_case.policy_version,0.9700,now()+interval '7 days');
    end if;
    update public.wf_community_moderation_cases set severity='medium',priority_score=35,automation_state='actioned',status='resolved',
      outcome='content_quarantined',decision_summary='Policy automation quarantined objective spam.',closed_at=now(),updated_at=now() where case_id=p_case_id;
    insert into public.platform_audit_events(action,entity_type,entity_id,source,after_json,metadata)
      values('COMMUNITY_MODERATION_ACTIONED','community_moderation_case',p_case_id,'workforce-domain-event',jsonb_build_object('status','resolved'),
        jsonb_build_object('actorType','system_policy','action','hide_content','policyVersion',v_case.policy_version,'confidence',0.97));
  else
    update public.wf_community_moderation_cases set severity=case when v_reason='misinformation' then 'medium' else 'low' end,
      priority_score=case when v_reason='misinformation' then 30 else 15 end,automation_state='monitoring',status='submitted',updated_at=now() where case_id=p_case_id;
  end if;
end;
$$;

create or replace function public.community_report_submit(p_target_type text,p_target_id text,p_reason text,p_details text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_actor(); v_type text:=lower(btrim(p_target_type)); v_reason text:=lower(btrim(p_reason));
  v_owner text; v_snapshot jsonb; v_case text; v_report text; v_count int;
begin
  if v_type not in ('post','comment','user') then raise exception 'UNSUPPORTED_REPORT_TARGET' using errcode='22023'; end if;
  if v_reason not in ('spam','scam','harassment','hate','threat','privacy','impersonation','misinformation','unsafe','illegal','other')
    then raise exception 'INVALID_REPORT_REASON' using errcode='22023'; end if;
  if char_length(coalesce(p_details,''))>2000 then raise exception 'REPORT_DETAILS_TOO_LONG' using errcode='22023'; end if;
  if v_type='post' then select author_user_id,jsonb_build_object('title',title,'body',body,'media',media,'status',status) into v_owner,v_snapshot from public.wf_profile_posts where profile_post_id=p_target_id;
  elsif v_type='comment' then select author_user_id,jsonb_build_object('body',body,'status',status) into v_owner,v_snapshot from public.wf_profile_post_comments where profile_post_comment_id=p_target_id;
  else select user_id,jsonb_build_object('status',status,'createdAt',created_at) into v_owner,v_snapshot from public.users where user_id=p_target_id; end if;
  if v_owner is null then raise exception 'MODERATION_TARGET_NOT_FOUND' using errcode='22023'; end if;
  if v_owner=v_actor then raise exception 'SELF_REPORT_NOT_ALLOWED' using errcode='22023'; end if;
  insert into public.wf_community_moderation_cases(target_type,target_id,target_user_id) values(v_type,p_target_id,v_owner)
    on conflict(target_type,target_id) do update set last_reported_at=now(),updated_at=now(),closed_at=null,
      status=case when public.wf_community_moderation_cases.status in ('resolved','dismissed') then 'submitted' else public.wf_community_moderation_cases.status end
    returning case_id into v_case;
  insert into security.wf_community_moderation_evidence(case_id,content_type,content_snapshot,content_hash)
    values(v_case,v_type,v_snapshot,md5(v_snapshot::text))
    on conflict(case_id) do update set content_snapshot=excluded.content_snapshot,content_hash=excluded.content_hash,captured_at=now();
  insert into public.wf_community_reports(reporter_user_id,profile_post_id,reason,case_id,details,target_type,target_id)
    values(v_actor,case when v_type='post' then p_target_id else null end,v_reason,v_case,nullif(btrim(p_details),''),v_type,p_target_id)
    on conflict(reporter_user_id,case_id) where case_id is not null do update set reason=excluded.reason,details=excluded.details,target_type=excluded.target_type,target_id=excluded.target_id,status='submitted',updated_at=now()
    returning report_id into v_report;
  select count(*) into v_count from public.wf_community_reports where case_id=v_case;
  update public.wf_community_moderation_cases set report_count=v_count,last_reported_at=now(),updated_at=now() where case_id=v_case;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_REPORT_SUBMITTED','community_moderation_case',v_case,'workforce-domain-event',
      jsonb_build_object('reportId',v_report,'targetType',v_type,'targetId',p_target_id,'reason',v_reason));
  perform security.community_moderation_triage(v_case);
  return jsonb_build_object('reported',true,'reportId',v_report,'caseId',v_case);
end;
$$;

create or replace function public.community_report_post(p_post_id text,p_reason text)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.community_report_submit('post',p_post_id,p_reason,null);
$$;

create or replace function public.community_moderation_queue(p_status text default null,p_severity text default null,p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.community_moderation_admin(false); v_items jsonb; v_stats jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('caseId',c.case_id,'targetType',c.target_type,'targetId',c.target_id,'targetUserId',c.target_user_id,
    'targetName',coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Unknown member'),'status',c.status,'severity',c.severity,
    'automationState',c.automation_state,'priorityScore',c.priority_score,'reportCount',c.report_count,'outcome',c.outcome,
    'decisionSummary',c.decision_summary,'lastReportedAt',c.last_reported_at,
    'evidenceExcerpt',left(coalesce(e.content_snapshot->>'body',e.content_snapshot->>'title','Account report'),280))
    order by c.priority_score desc,c.last_reported_at desc),'[]'::jsonb) into v_items
  from (select * from public.wf_community_moderation_cases where (p_status is null or status=p_status) and (p_severity is null or severity=p_severity)
    order by priority_score desc,last_reported_at desc limit least(greatest(coalesce(p_limit,50),1),100)) c
  left join public.users u on u.user_id=c.target_user_id left join security.wf_community_moderation_evidence e on e.case_id=c.case_id;
  select jsonb_build_object('needsReview',count(*) filter(where automation_state='needs_review'),'automated',count(*) filter(where automation_state='actioned'),
    'open',count(*) filter(where status in ('submitted','reviewing')),'critical',count(*) filter(where severity='critical' and status in ('submitted','reviewing')))
    into v_stats from public.wf_community_moderation_cases;
  return jsonb_build_object('items',v_items,'stats',v_stats,'viewer',v_actor);
end;
$$;

create or replace function public.community_moderation_decide(p_case_id text,p_action text,p_rationale text,p_duration_hours int default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text; v_case public.wf_community_moderation_cases%rowtype; v_action text:=lower(btrim(p_action)); v_exp timestamptz;
begin
  v_actor:=security.community_moderation_admin(v_action='suspend_user' and p_duration_hours is null);
  if char_length(btrim(coalesce(p_rationale,''))) not between 8 and 2000 then raise exception 'RATIONALE_REQUIRED' using errcode='22023'; end if;
  if v_action not in ('no_action','warn','hide_content','remove_content','restore_content','restrict_posting','restrict_interactions','suspend_user','restore_user','escalate')
    then raise exception 'INVALID_MODERATION_ACTION' using errcode='22023'; end if;
  if p_duration_hours is not null and p_duration_hours not between 1 and 2160 then raise exception 'INVALID_ACTION_DURATION' using errcode='22023'; end if;
  select * into v_case from public.wf_community_moderation_cases where case_id=p_case_id for update;
  if v_case.case_id is null then raise exception 'MODERATION_CASE_NOT_FOUND' using errcode='22023'; end if;
  v_exp:=case when p_duration_hours is null then null else now()+make_interval(hours=>p_duration_hours) end;
  if v_action in ('hide_content','remove_content','restore_content') then perform security.community_moderation_apply_state(v_case.target_type,v_case.target_id,
    case v_action when 'hide_content' then 'hidden' when 'remove_content' then 'removed' else 'published' end);
  elsif v_action in ('restrict_posting','restrict_interactions') then
    if v_case.target_user_id is null or v_exp is null then raise exception 'TIMED_RESTRICTION_REQUIRED' using errcode='22023'; end if;
    insert into public.wf_community_user_restrictions(user_id,case_id,restriction_type,expires_at)
      values(v_case.target_user_id,p_case_id,case when v_action='restrict_posting' then 'posting' else 'interactions' end,v_exp);
  elsif v_action='suspend_user' then update public.users set status='suspended',updated_at=now() where user_id=v_case.target_user_id;
  elsif v_action='restore_user' then
    update public.users set status='active',updated_at=now() where user_id=v_case.target_user_id and status='suspended';
    update public.wf_community_user_restrictions set status='revoked',updated_at=now() where user_id=v_case.target_user_id and status='active';
  end if;
  if v_action in ('restore_content','restore_user') then
    update public.wf_community_moderation_actions set reversed_at=now(),reversed_by_user_id=v_actor,reversal_reason=btrim(p_rationale)
      where case_id=p_case_id and reversed_at is null and action in ('hide_content','remove_content','restrict_posting','restrict_interactions','suspend_user');
  end if;
  insert into public.wf_community_moderation_actions(case_id,actor_type,actor_user_id,action,rationale,policy_version,expires_at)
    values(p_case_id,'platform_admin',v_actor,v_action,btrim(p_rationale),v_case.policy_version,v_exp);
  update public.wf_community_moderation_cases set status=case when v_action='no_action' then 'dismissed' when v_action='escalate' then 'reviewing' else 'resolved' end,
    automation_state='overridden',outcome=v_action,decision_summary=btrim(p_rationale),closed_at=case when v_action='escalate' then null else now() end,updated_at=now()
    where case_id=p_case_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
    values(auth.uid(),v_actor,'COMMUNITY_MODERATION_ACTIONED','community_moderation_case',p_case_id,'workforce-domain-event',
      jsonb_build_object('action',v_action,'policyVersion',v_case.policy_version,'expiresAt',v_exp));
  if exists(select 1 from public.wf_community_moderation_appeals where case_id=p_case_id and status in ('submitted','reviewing')) then
    update public.wf_community_moderation_appeals set status=case when v_action in ('restore_content','restore_user') then 'reversed' else 'upheld' end,
      decision_reason=btrim(p_rationale),decided_by_user_id=v_actor,decided_at=now(),updated_at=now()
      where case_id=p_case_id and status in ('submitted','reviewing');
    insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,metadata)
      values(auth.uid(),v_actor,'COMMUNITY_MODERATION_APPEAL_RESOLVED','community_moderation_case',p_case_id,'workforce-domain-event',
        jsonb_build_object('decision',case when v_action in ('restore_content','restore_user') then 'reversed' else 'upheld' end));
  end if;
  return jsonb_build_object('ok',true,'caseId',p_case_id,'action',v_action);
end;
$$;

create or replace function public.community_moderation_appeal(p_case_id text,p_statement text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor text:=security.community_moderation_subject(); v_id text;
begin
  if not exists(select 1 from public.wf_community_moderation_cases where case_id=p_case_id and target_user_id=v_actor and outcome is not null)
    then raise exception 'APPEAL_NOT_AVAILABLE' using errcode='42501'; end if;
  insert into public.wf_community_moderation_appeals(case_id,appellant_user_id,statement) values(p_case_id,v_actor,btrim(p_statement))
    on conflict(case_id,appellant_user_id) do update set statement=excluded.statement,status='submitted',decision_reason=null,decided_at=null,updated_at=now()
    returning appeal_id into v_id;
  update public.wf_community_moderation_cases set status='reviewing',automation_state='needs_review',priority_score=greatest(priority_score,85),closed_at=null,updated_at=now() where case_id=p_case_id;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source)
    values(auth.uid(),v_actor,'COMMUNITY_MODERATION_APPEALED','community_moderation_case',p_case_id,'workforce-domain-event');
  return jsonb_build_object('appealId',v_id,'status','submitted');
end;
$$;

create or replace function public.community_moderation_self()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=security.community_moderation_subject();v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('caseId',c.case_id,'targetType',c.target_type,'targetId',c.target_id,
    'status',c.status,'severity',c.severity,'outcome',c.outcome,'decisionSummary',c.decision_summary,'closedAt',c.closed_at,
    'actionExpiresAt',(select max(a.expires_at) from public.wf_community_moderation_actions a where a.case_id=c.case_id and a.reversed_at is null),
    'appealStatus',(select a.status from public.wf_community_moderation_appeals a where a.case_id=c.case_id and a.appellant_user_id=v_actor))
    order by c.updated_at desc),'[]'::jsonb) into v_items
  from public.wf_community_moderation_cases c where c.target_user_id=v_actor and c.outcome is not null;
  return v_items;
end;
$$;

revoke all on function security.community_relationship_allowed(text,text),security.community_content_visible(text,text),security.community_restricted(text,text),
  security.community_moderation_admin(boolean),security.community_moderation_subject(),security.community_moderation_apply_state(text,text,text),security.community_moderation_triage(text) from public,anon,authenticated,service_role;
revoke all on function public.community_block_set(text,text),public.community_report_submit(text,text,text,text),public.community_moderation_queue(text,text,int),
  public.community_moderation_decide(text,text,text,int),public.community_moderation_appeal(text,text),public.community_moderation_self() from public,anon;
grant execute on function public.community_block_set(text,text),public.community_report_submit(text,text,text,text),public.community_moderation_appeal(text,text),public.community_moderation_self() to authenticated;
grant execute on function public.community_moderation_queue(text,text,int),public.community_moderation_decide(text,text,text,int) to authenticated,service_role;

comment on table public.wf_community_moderation_cases is 'COMM-04 canonical moderation case. Report state uses submitted/reviewing/resolved/dismissed; automation and appeal state remain separate.';
comment on table security.wf_community_moderation_evidence is 'Restricted report evidence. Never send content, identities or message evidence to Mixpanel/analytics.';
