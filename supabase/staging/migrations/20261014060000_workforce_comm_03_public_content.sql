-- COMM-03 / #267: curated anonymous post/article projection and sitemap.
-- Participation remains authenticated-only; service-side reads expose only
-- explicitly public, published content owned by an active Workforce account.

alter table public.wf_profile_posts
  add column if not exists robots_index boolean not null default true;

create index if not exists wf_profile_posts_public_discovery_idx
  on public.wf_profile_posts(published_at desc,profile_post_id)
  where status='published' and visibility='public' and robots_index=true;

create or replace function public.community_public_post(p_post_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'found',true,'id',p.profile_post_id,'postType',p.post_type,'title',p.title,'body',p.body,
    'media',p.media,'topic',p.topic,'location',p.location_label,'publishedAt',p.published_at,'updatedAt',p.updated_at,
    'canonicalPath','/community/posts/'||p.profile_post_id,
    'robotsIndex',p.robots_index and page.visibility='public' and page.publication_status='published' and page.robots_index,
    'robotsFollow',page.robots_follow,
    'authorName',page.display_name,'authorImageUrl',page.profile_image_url,
    'authorProfilePath',case when page.visibility='public' and page.publication_status='published' then page.canonical_path end,
    'authorHeadline',case when page.visibility='public' and page.publication_status='published' then page.headline end,
    'likeCount',(select count(*) from public.wf_profile_post_reactions r where r.profile_post_id=p.profile_post_id and r.reaction_type='like'),
    'shareCount',(select count(*) from public.wf_profile_post_shares s where s.profile_post_id=p.profile_post_id),
    'comments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.profile_post_comment_id,'parentId',c.parent_comment_id,'body',c.body,'createdAt',c.created_at,
      'authorName',cp.display_name,'authorImageUrl',cp.profile_image_url,
      'authorProfilePath',case when cp.visibility='public' and cp.publication_status='published' then cp.canonical_path end
    ) order by c.created_at,c.profile_post_comment_id)
    from public.wf_profile_post_comments c
    join public.users cu on cu.user_id=c.author_user_id and lower(cu.status)='active'
    join public.wf_public_pages cp on cp.public_page_id=c.author_public_page_id and cp.owner_user_id=c.author_user_id
    where c.profile_post_id=p.profile_post_id and c.status='published'),'[]'::jsonb)
  ) into v_result
  from public.wf_profile_posts p
  join public.users u on u.user_id=p.author_user_id and lower(u.status)='active'
  join public.wf_public_pages page on page.public_page_id=p.author_public_page_id and page.owner_user_id=p.author_user_id
  where p.profile_post_id=p_post_id and p.status='published' and p.visibility='public' and p.published_at is not null;
  return coalesce(v_result,jsonb_build_object('found',false));
end;
$$;

create or replace function public.community_public_sitemap()
returns table(path text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select '/community/posts/'||p.profile_post_id,p.updated_at
  from public.wf_profile_posts p
  join public.users u on u.user_id=p.author_user_id and lower(u.status)='active'
  join public.wf_public_pages page on page.public_page_id=p.author_public_page_id and page.owner_user_id=p.author_user_id
  where p.status='published' and p.visibility='public' and p.published_at is not null and p.robots_index
    and page.visibility='public' and page.publication_status='published' and page.robots_index
  order by p.published_at desc,p.profile_post_id desc;
$$;

revoke all on function public.community_public_post(text),public.community_public_sitemap() from public,anon,authenticated;
grant execute on function public.community_public_post(text),public.community_public_sitemap() to service_role;

comment on function public.community_public_post(text) is 'COMM-03 curated anonymous projection. Private, unpublished, removed, hidden and inactive-author content fails closed.';
