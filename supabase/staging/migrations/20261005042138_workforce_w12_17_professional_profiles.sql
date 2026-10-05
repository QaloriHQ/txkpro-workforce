-- W12-17: curated professional publication over the existing public identity foundation.
-- No new access to Workforce tables. Identity and affiliation always come from current memberships.
create function security.professional_affiliations(p_user text, p_kind text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x.affiliation order by x.name),'[]'::jsonb) from (
 select distinct i.name, jsonb_build_object('name',i.name,'programs',coalesce((
  select jsonb_agg(distinct c.program_name) from public.wf_cohorts c
  where c.institution_id=i.institution_id and nullif(c.program_name,'') is not null
   and ((lower(m.scope_type)='cohort' and m.scope_id=c.cohort_id)
     or (lower(m.scope_type)='program' and m.scope_id=c.program_name))
 ),'[]'::jsonb),'verified',true) affiliation
 from public.users u join public.app_role_memberships m on m.user_id=u.user_id and m.auth_user_id=u.auth_user_id
 join public.wf_institutions i on i.active and security.retention_membership_matches(m.id,i.institution_id,null)
 where p_kind='educator' and u.user_id=p_user and lower(u.status)='active' and lower(m.status)='active'
 and security.institution_role_scope_valid(security.canonical_institution_role(m.role),lower(m.scope_type))
 union all
 select 'TXKPRO',jsonb_build_object('name','TXKPRO','programs','[]'::jsonb,'verified',true)
 where p_kind='staff' and exists(select 1 from public.users u join public.app_role_memberships m
 on m.user_id=u.user_id and m.auth_user_id=u.auth_user_id where u.user_id=p_user and lower(u.status)='active'
 and lower(m.status)='active' and lower(m.scope_type)='platform'
 and lower(m.role) in ('super_admin','admin','platform_admin','support','read_only_analyst'))
 ) x;
$$;
revoke all on function security.professional_affiliations(text,text) from public,anon,authenticated,service_role;

create function security.professional_actor(p_kind text) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_user text;
begin
 select user_id into v_user from public.users where auth_user_id=(select auth.uid()) and lower(status)='active';
 if p_kind is null or p_kind not in ('educator','staff') or v_user is null
 or jsonb_array_length(security.professional_affiliations(v_user,p_kind))=0 then
 raise exception using errcode='42501',message='Active professional membership required'; end if;
 return v_user;
end; $$;
revoke all on function security.professional_actor(text) from public,anon,authenticated,service_role;

create function security.professional_profile_settings(p_kind text, p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user text; old public.wf_public_pages%rowtype; page public.wf_public_pages%rowtype;
 v_slug text; v_path text; v_name text; v_visibility text; v_key text; v_value text; v_changed boolean:=false;
 v_preferences jsonb; v_old_preferences jsonb; v_old_sections jsonb;
begin
 v_user:=security.professional_actor(p_kind);
 perform 1 from public.users where user_id=v_user for update;
 select * into old from public.wf_public_pages where entity_type=p_kind and entity_id=v_user;
 if old.public_page_id is not null and old.owner_user_id is distinct from v_user then raise exception using errcode='42501',message='Profile ownership required'; end if;
 if p_input is null then
  select jsonb_build_object('reviews',show_reviews,'ratings',show_rating_summary,'posts',show_posts,
   'activity',show_activity_history,'likes',show_like_history,'comments',show_comment_history,
   'shares',show_share_history,'reposts',show_repost_history) into v_preferences
  from public.wf_public_profile_preferences where public_page_id=old.public_page_id;
  return jsonb_build_object('kind',p_kind,'chosen',old.public_page_id is not null,'visibility',coalesce(old.visibility,'private'),
   'slug',coalesce(old.slug,''),'displayName',coalesce(old.display_name,''),'headline',coalesce(old.headline,''),'bio',coalesce(old.summary,''),
   'path',old.canonical_path,'affiliations',security.professional_affiliations(v_user,p_kind),
   'specialties',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=old.public_page_id and section_key='specialties'),''),
   'credentials',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=old.public_page_id and section_key='credentials'),''),
   'preferences',coalesce(v_preferences,'{"reviews":true,"ratings":true,"posts":true,"activity":false,"likes":false,"comments":false,"shares":false,"reposts":false}'::jsonb),
   'posts',coalesce((select jsonb_agg(jsonb_build_object('id',profile_post_id,'title',title,'body',body,'status',status,'publishedAt',published_at) order by created_at desc)
    from (select * from public.wf_profile_posts where author_public_page_id=old.public_page_id and author_user_id=v_user and status<>'removed' order by created_at desc limit 50) po),'[]'::jsonb));
 end if;
 if jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16000 then raise exception using errcode='22023',message='Invalid profile settings'; end if;
 -- Reject ownership, affiliation, verification, arbitrary JSON/SEO and workflow fields.
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('slug','displayName','headline','bio','visibility','specialties','credentials','preferences')) then
 raise exception using errcode='22023',message='Unsupported profile field'; end if;
 v_slug:=lower(btrim(p_input->>'slug')); v_name:=btrim(p_input->>'displayName'); v_visibility:=p_input->>'visibility';
 if v_slug is null or length(v_slug) not between 3 and 64 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
 raise exception using errcode='22023',message='Use a URL of 3–64 lowercase letters, numbers and single hyphens'; end if;
 if v_name is null or length(v_name) not between 1 and 100 or coalesce(length(p_input->>'headline'),0)>160 or coalesce(length(p_input->>'bio'),0)>2000
 or coalesce(length(p_input->>'specialties'),0)>1000 or coalesce(length(p_input->>'credentials'),0)>2000 then
 raise exception using errcode='22023',message='Check the profile field lengths'; end if;
 if v_visibility is null or v_visibility not in ('public','private') then raise exception using errcode='22023',message='Choose Public or Private'; end if;
 v_preferences:=p_input->'preferences';
 if jsonb_typeof(v_preferences) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_preferences))<>8
 or exists(select 1 from jsonb_each(v_preferences) e where e.key not in ('reviews','ratings','posts','activity','likes','comments','shares','reposts') or jsonb_typeof(e.value)<>'boolean') then
 raise exception using errcode='22023',message='Choose each visibility preference explicitly'; end if;
 v_path:=case p_kind when 'educator' then '/educators/' else '/staff/' end||v_slug;
 -- Root slugs are globally unique in the existing foundation; serialize all profile writers by slug.
 perform pg_advisory_xact_lock(hashtextextended(v_slug,56));
 if exists(select 1 from public.wf_public_page_redirects r where r.from_path=v_path and r.public_page_id is distinct from old.public_page_id)
 or exists(select 1 from public.wf_public_pages p where (p.canonical_path=v_path or (p.parent_public_page_id is null and p.slug=v_slug)) and p.public_page_id is distinct from old.public_page_id) then
 raise exception using errcode='23505',message='That profile URL is reserved'; end if;
 select to_jsonb(pr)-'id'-'updated_at' into v_old_preferences from public.wf_public_profile_preferences pr where public_page_id=old.public_page_id;
 select jsonb_object_agg(section_key,content->>'text') into v_old_sections from public.wf_public_profile_sections where public_page_id=old.public_page_id and section_key in ('specialties','credentials');
 insert into public.wf_public_pages(entity_type,entity_id,owner_user_id,slug,canonical_path,visibility,publication_status,robots_index,robots_follow,display_name,headline,summary,published_at)
 values(p_kind,v_user,v_user,v_slug,v_path,v_visibility,case when v_visibility='public' then 'published' else 'unpublished' end,
  v_visibility='public',v_visibility='public',v_name,nullif(btrim(p_input->>'headline'),''),nullif(btrim(p_input->>'bio'),''),case when v_visibility='public' then now() else null end)
 on conflict(entity_type,entity_id) do update set slug=excluded.slug,canonical_path=excluded.canonical_path,visibility=excluded.visibility,
 publication_status=excluded.publication_status,robots_index=excluded.robots_index,robots_follow=excluded.robots_follow,display_name=excluded.display_name,headline=excluded.headline,summary=excluded.summary,
 published_at=case when excluded.visibility='public' then coalesce(wf_public_pages.published_at,now()) else null end
 returning * into page;
 insert into public.wf_public_profile_preferences(public_page_id,show_reviews,show_rating_summary,show_posts,show_activity_history,show_like_history,show_comment_history,show_share_history,show_repost_history,show_contact_actions)
 values(page.public_page_id,(v_preferences->>'reviews')::boolean,(v_preferences->>'ratings')::boolean,(v_preferences->>'posts')::boolean,
 (v_preferences->>'activity')::boolean,(v_preferences->>'likes')::boolean,(v_preferences->>'comments')::boolean,(v_preferences->>'shares')::boolean,(v_preferences->>'reposts')::boolean,false)
 on conflict(public_page_id) do update set show_reviews=excluded.show_reviews,show_rating_summary=excluded.show_rating_summary,show_posts=excluded.show_posts,
 show_activity_history=excluded.show_activity_history,show_like_history=excluded.show_like_history,show_comment_history=excluded.show_comment_history,show_share_history=excluded.show_share_history,show_repost_history=excluded.show_repost_history,show_contact_actions=false;
 foreach v_key in array array['specialties','credentials'] loop
 v_value:=coalesce(btrim(p_input->>v_key),'');
 insert into public.wf_public_profile_sections(public_page_id,section_key,section_type,content) values(page.public_page_id,v_key,v_key,jsonb_build_object('text',v_value))
 on conflict(public_page_id,section_key) do update set content=excluded.content;
 end loop;
 v_changed:=old.public_page_id is null or (old.slug,old.visibility,old.display_name,old.headline,old.summary) is distinct from (page.slug,page.visibility,page.display_name,page.headline,page.summary)
 or v_old_preferences is distinct from (select to_jsonb(pr)-'id'-'updated_at' from public.wf_public_profile_preferences pr where public_page_id=page.public_page_id)
 or v_old_sections is distinct from jsonb_build_object('specialties',coalesce(btrim(p_input->>'specialties'),''),'credentials',coalesce(btrim(p_input->>'credentials'),''));
 if v_changed then
 update public.wf_public_pages set updated_at=clock_timestamp() where public_page_id=page.public_page_id;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
 values((select auth.uid()),v_user,'PROFESSIONAL_PUBLIC_PROFILE_CHANGED','public_page',page.public_page_id,'professional',
 jsonb_build_object('visibility',old.visibility,'path',old.canonical_path),jsonb_build_object('visibility',page.visibility,'path',page.canonical_path,'preferences',v_preferences));
 end if;
 update public.wf_public_page_redirects set active=false where public_page_id=page.public_page_id and from_path=v_path;
 update public.wf_public_page_redirects set to_path=v_path where public_page_id=page.public_page_id and active;
 if old.public_page_id is not null and old.canonical_path<>v_path then
 insert into public.wf_public_page_redirects(public_page_id,from_path,to_path,status_code) values(page.public_page_id,old.canonical_path,v_path,308)
 on conflict(from_path) do update set to_path=excluded.to_path,active=true,status_code=308;
 end if;
 return security.professional_profile_settings(p_kind,null);
end; $$;
revoke all on function security.professional_profile_settings(text,jsonb) from public,anon,service_role;
grant execute on function security.professional_profile_settings(text,jsonb) to authenticated;
create function public.professional_profile_settings(p_kind text,p_input jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_profile_settings(p_kind,p_input); $$;
revoke all on function public.professional_profile_settings(text,jsonb) from public,anon,service_role;
grant execute on function public.professional_profile_settings(text,jsonb) to authenticated;

create function security.professional_post_save(p_kind text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user text; v_page text; old public.wf_profile_posts%rowtype; po public.wf_profile_posts%rowtype; v_id text; v_status text;
begin
 v_user:=security.professional_actor(p_kind);
 perform 1 from public.users where user_id=v_user for update;
 select public_page_id into v_page from public.wf_public_pages where entity_type=p_kind and entity_id=v_user and owner_user_id=v_user;
 if v_page is null then raise exception using errcode='22023',message='Save your profile before creating a post'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','title','body','status')) then raise exception using errcode='22023',message='Invalid post'; end if;
 v_id:=p_input->>'id'; v_status:=p_input->>'status';
 if v_id is null or v_id !~ '^POST-[a-zA-Z0-9-]{8,64}$' or v_status is null or v_status not in ('draft','published','hidden','removed')
 or coalesce(length(btrim(p_input->>'body')),0) not between 1 and 8000 or coalesce(length(p_input->>'title'),0)>160 then
 raise exception using errcode='22023',message='Add a post body (maximum 8000 characters) and a valid status'; end if;
 select * into old from public.wf_profile_posts where profile_post_id=v_id;
 if old.profile_post_id is not null and (old.author_user_id<>v_user or old.author_public_page_id<>v_page) then raise exception using errcode='42501',message='Post ownership required'; end if;
 if old.status='removed' and v_status<>'removed' then raise exception using errcode='22023',message='Removed posts cannot be restored'; end if;
 insert into public.wf_profile_posts(profile_post_id,author_public_page_id,author_user_id,title,body,status,visibility,published_at)
 values(v_id,v_page,v_user,nullif(btrim(p_input->>'title'),''),btrim(p_input->>'body'),v_status,'public',case when v_status='published' then now() else null end)
 on conflict(profile_post_id) do update set title=excluded.title,body=excluded.body,status=excluded.status,
 published_at=case when excluded.status='published' then coalesce(wf_profile_posts.published_at,now()) else wf_profile_posts.published_at end
 where wf_profile_posts.author_user_id=v_user and wf_profile_posts.author_public_page_id=v_page returning * into po;
 if po.profile_post_id is null then raise exception using errcode='42501',message='Post ownership required'; end if;
 if old.profile_post_id is null or (old.title,old.body,old.status) is distinct from (po.title,po.body,po.status) then
 update public.wf_profile_posts set updated_at=clock_timestamp() where profile_post_id=v_id;
 update public.wf_public_pages set updated_at=clock_timestamp() where public_page_id=v_page;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
 values((select auth.uid()),v_user,'PROFESSIONAL_POST_CHANGED','profile_post',v_id,'professional',jsonb_build_object('status',old.status),jsonb_build_object('status',po.status));
 end if;
 return security.professional_profile_settings(p_kind,null);
end; $$;
revoke all on function security.professional_post_save(text,jsonb) from public,anon,service_role;
grant execute on function security.professional_post_save(text,jsonb) to authenticated;
create function public.professional_post_save(p_kind text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_post_save(p_kind,p_input); $$;
revoke all on function public.professional_post_save(text,jsonb) from public,anon,service_role;
grant execute on function public.professional_post_save(text,jsonb) to authenticated;

-- Fail closed for public social sources without an implemented canonical eligibility contract.
create function security.professional_page_publishable(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wf_public_pages p where p.public_page_id=p_id and p.visibility='public' and p.publication_status='published'
 and p.entity_type in ('educator','staff') and p.entity_id=p.owner_user_id
 and jsonb_array_length(security.professional_affiliations(p.owner_user_id,p.entity_type))>0);
$$;
revoke all on function security.professional_page_publishable(text) from public,anon,authenticated,service_role;

create function security.professional_public_read(p_path text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page public.wf_public_pages%rowtype; pref public.wf_public_profile_preferences%rowtype; v_redirect boolean:=false;
 v_reviews jsonb:='[]'; v_posts jsonb:='[]'; v_activity jsonb:='[]'; v_rating jsonb:=null;
begin
 if p_path is null or p_path !~ '^/(educators|staff)/[a-z0-9]+(-[a-z0-9]+)*$' or length(p_path)>75 then return jsonb_build_object('found',false); end if;
 select p.* into page from public.wf_public_pages p where p.canonical_path=p_path and security.professional_page_publishable(p.public_page_id);
 if not found then
 select p.* into page from public.wf_public_page_redirects r join public.wf_public_pages p on p.public_page_id=r.public_page_id
 where r.from_path=p_path and r.active and security.professional_page_publishable(p.public_page_id);
 if not found then return jsonb_build_object('found',false); end if; v_redirect:=true;
 end if;
 select * into pref from public.wf_public_profile_preferences where public_page_id=page.public_page_id;
 if coalesce(pref.show_reviews,false) then
 select coalesce(jsonb_agg(jsonb_build_object('id',r.profile_review_id,'rating',r.rating,'title',r.review_title,'body',r.review_body,
 'verifiedRelationship',r.verified_relationship,'reviewer',case when security.professional_page_publishable(r.reviewer_public_page_id) and rp.owner_user_id=r.reviewer_user_id then rp.display_name else 'Reviewer' end,
 'createdAt',r.created_at) order by r.created_at desc),'[]') into v_reviews from (
 select * from public.wf_profile_reviews where target_public_page_id=page.public_page_id and status='published' order by created_at desc limit 50) r
 left join public.wf_public_pages rp on rp.public_page_id=r.reviewer_public_page_id;
 end if;
 if coalesce(pref.show_rating_summary,false) then
 select case when count(*)>0 then jsonb_build_object('average',round(avg(rating),1),'count',count(*)) else null end into v_rating
 from public.wf_profile_reviews where target_public_page_id=page.public_page_id and status='published'; end if;
 if coalesce(pref.show_posts,false) then
 select coalesce(jsonb_agg(jsonb_build_object('id',profile_post_id,'title',title,'body',body,'publishedAt',published_at) order by published_at desc),'[]') into v_posts
 from (select * from public.wf_profile_posts where author_public_page_id=page.public_page_id and author_user_id=page.owner_user_id and status='published' and visibility='public' order by published_at desc limit 50) po;
 end if;
 if coalesce(pref.show_activity_history,false) then
 select coalesce(jsonb_agg(jsonb_build_object('type',a.kind,'body',a.body,'title',po.title,'author',src.display_name,'path',src.canonical_path||'#'||po.profile_post_id,'createdAt',a.created_at) order by a.created_at desc),'[]') into v_activity
 from (select * from (
 select 'like' kind,r.profile_post_id,null::text body,r.created_at from public.wf_profile_post_reactions r
 where pref.show_like_history and r.actor_user_id=page.owner_user_id and r.actor_public_page_id=page.public_page_id
 union all select 'comment',c.profile_post_id,c.body,c.created_at from public.wf_profile_post_comments c
 where pref.show_comment_history and c.status='published' and c.author_user_id=page.owner_user_id and c.author_public_page_id=page.public_page_id
 union all select s.share_type,s.profile_post_id,s.commentary,s.created_at from public.wf_profile_post_shares s
 where ((s.share_type='share' and pref.show_share_history) or (s.share_type='repost' and pref.show_repost_history))
 and s.actor_user_id=page.owner_user_id and s.actor_public_page_id=page.public_page_id) acts
 where exists(select 1 from public.wf_profile_posts p join public.wf_public_pages src on src.public_page_id=p.author_public_page_id
 where p.profile_post_id=acts.profile_post_id and p.status='published' and p.visibility='public' and p.author_user_id=src.owner_user_id
 and security.professional_page_publishable(src.public_page_id)
 and exists(select 1 from public.wf_public_profile_preferences sp where sp.public_page_id=src.public_page_id and sp.show_posts))
 order by created_at desc limit 50) a join public.wf_profile_posts po on po.profile_post_id=a.profile_post_id join public.wf_public_pages src on src.public_page_id=po.author_public_page_id;
 end if;
 return jsonb_build_object('found',true,'redirect',v_redirect,'kind',page.entity_type,'path',page.canonical_path,'displayName',page.display_name,'headline',page.headline,'bio',page.summary,
 'robotsIndex',page.robots_index,'robotsFollow',page.robots_follow,'affiliations',security.professional_affiliations(page.owner_user_id,page.entity_type),
 'specialties',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=page.public_page_id and section_key='specialties' and visible),''),
 'credentials',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=page.public_page_id and section_key='credentials' and visible),''),
 'reviews',v_reviews,'rating',v_rating,'posts',v_posts,'activity',v_activity);
end; $$;
revoke all on function security.professional_public_read(text) from public,anon,authenticated;
grant execute on function security.professional_public_read(text) to service_role;
create function public.professional_public_read(p_path text) returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_public_read(p_path); $$;
revoke all on function public.professional_public_read(text) from public,anon,authenticated;
grant execute on function public.professional_public_read(text) to service_role;
create function security.professional_public_sitemap() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',p.canonical_path,'updatedAt',p.updated_at) order by p.canonical_path),'[]')
 from public.wf_public_pages p where p.entity_type in ('educator','staff') and p.robots_index and security.professional_page_publishable(p.public_page_id);
$$;
revoke all on function security.professional_public_sitemap() from public,anon,authenticated;
grant execute on function security.professional_public_sitemap() to service_role;
create function public.professional_public_sitemap() returns jsonb
language sql security invoker set search_path='' as $$ select security.professional_public_sitemap(); $$;
revoke all on function public.professional_public_sitemap() from public,anon,authenticated;
grant execute on function public.professional_public_sitemap() to service_role;
