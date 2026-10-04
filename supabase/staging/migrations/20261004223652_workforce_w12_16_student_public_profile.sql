-- W12-16: Student-owned curated publication; never grants access to Workforce data.
-- Approved public allowlist: display_name, headline, summary (bio), canonical_path.
create function security.student_public_profile_actor() returns text
language plpgsql stable security definer set search_path='' as $$
declare v_user text; v_student text;
begin
 select u.user_id,s.student_id into v_user,v_student from public.users u
 join public.wf_student_profiles s on s.user_id=u.user_id
 where u.auth_user_id=(select auth.uid()) and lower(u.status)='active'
 and exists(select 1 from public.app_role_memberships m where m.auth_user_id=u.auth_user_id
  and lower(m.status)='active' and lower(m.role)='student' and lower(m.scope_type)='self' and m.scope_id=s.student_id);
 if v_student is null then raise exception using errcode='42501',message='Active Student self membership required'; end if;
 return v_student;
end;
$$;
revoke all on function security.student_public_profile_actor() from public,anon,authenticated,service_role;

create function security.student_public_profile_settings(p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_student text; v_user text; old public.wf_public_pages%rowtype; page public.wf_public_pages%rowtype;
 v_slug text; v_path text; v_visibility text; v_name text; v_headline text; v_bio text;
begin
 v_student:=security.student_public_profile_actor();
 select user_id into v_user from public.wf_student_profiles where student_id=v_student;
 -- Serialize a Student's settings and onboarding, including first publication.
 perform 1 from public.users where user_id=v_user for update;
 select * into old from public.wf_public_pages where entity_type='student' and entity_id=v_student;
 if p_input is null then
  return jsonb_build_object('chosen',old.public_page_id is not null,'visibility',old.visibility,'slug',coalesce(old.slug,''),
   'displayName',coalesce(old.display_name,''),'headline',coalesce(old.headline,''),'bio',coalesce(old.summary,''),'path',old.canonical_path);
 end if;
 if jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='Invalid profile settings'; end if;
 v_visibility:=p_input->>'visibility'; v_slug:=lower(btrim(p_input->>'slug')); v_name:=btrim(p_input->>'displayName');
 v_headline:=nullif(btrim(p_input->>'headline'),''); v_bio:=nullif(btrim(p_input->>'bio'),'');
 if v_visibility is null or v_visibility not in ('public','private') then
  raise exception using errcode='22023',message='Choose Public or Private explicitly'; end if;
 if v_slug is null or length(v_slug) not between 3 and 64 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
  raise exception using errcode='22023',message='Use a profile URL of 3–64 lowercase letters, numbers, and single hyphens'; end if;
 if v_name is null or length(v_name) not between 1 and 100 or coalesce(length(v_headline),0)>160 or coalesce(length(v_bio),0)>1000 then
  raise exception using errcode='22023',message='Add a display name (100 characters maximum), headline (160), and bio (1000)'; end if;
 v_path:='/students/'||v_slug;
 perform pg_advisory_xact_lock(hashtextextended(v_path,55));
 if exists(select 1 from public.wf_public_page_redirects r where r.from_path=v_path and r.public_page_id is distinct from old.public_page_id)
 or exists(select 1 from public.wf_public_pages p where (p.canonical_path=v_path or (p.parent_public_page_id is null and p.slug=v_slug))
  and p.public_page_id is distinct from old.public_page_id) then
  raise exception using errcode='23505',message='That profile URL is reserved. Choose another'; end if;
 insert into public.wf_public_pages(entity_type,entity_id,owner_user_id,slug,canonical_path,visibility,publication_status,
  robots_index,robots_follow,display_name,headline,summary,published_at)
 values('student',v_student,v_user,v_slug,v_path,v_visibility,case when v_visibility='public' then 'published' else 'unpublished' end,
  v_visibility='public',v_visibility='public',v_name,v_headline,v_bio,case when v_visibility='public' then now() else null end)
 on conflict(entity_type,entity_id) do update set slug=excluded.slug,canonical_path=excluded.canonical_path,visibility=excluded.visibility,
  publication_status=excluded.publication_status,robots_index=excluded.robots_index,robots_follow=excluded.robots_follow,
  display_name=excluded.display_name,headline=excluded.headline,summary=excluded.summary,
  updated_at=case when (wf_public_pages.slug,wf_public_pages.visibility,wf_public_pages.display_name,wf_public_pages.headline,wf_public_pages.summary)
   is distinct from (excluded.slug,excluded.visibility,excluded.display_name,excluded.headline,excluded.summary) then clock_timestamp() else wf_public_pages.updated_at end,
  published_at=case when excluded.visibility='public' then coalesce(wf_public_pages.published_at,now()) else null end
 returning * into page;
 update public.wf_public_page_redirects set active=false where public_page_id=page.public_page_id and from_path=v_path;
 update public.wf_public_page_redirects set to_path=v_path where public_page_id=page.public_page_id and active;
 if old.public_page_id is not null and old.canonical_path<>v_path then
  insert into public.wf_public_page_redirects(public_page_id,from_path,to_path,status_code) values(page.public_page_id,old.canonical_path,v_path,308)
  on conflict(from_path) do update set to_path=excluded.to_path,active=true,status_code=308;
 end if;
 -- Dedicated publication audit vocabulary; no competing domain lifecycle or private snapshot.
 if old.public_page_id is null or page.updated_at is distinct from old.updated_at then
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,student_id,source,before_json,after_json)
  values((select auth.uid()),v_user,'STUDENT_PUBLIC_PROFILE_CHANGED','public_page',page.public_page_id,v_student,'student',
   jsonb_build_object('visibility',old.visibility,'path',old.canonical_path),jsonb_build_object('visibility',page.visibility,'path',page.canonical_path));
 end if;
 return jsonb_build_object('chosen',true,'visibility',page.visibility,'slug',page.slug,'displayName',page.display_name,
  'headline',coalesce(page.headline,''),'bio',coalesce(page.summary,''),'path',page.canonical_path);
end;
$$;
revoke all on function security.student_public_profile_settings(jsonb) from public,anon;
grant execute on function security.student_public_profile_settings(jsonb) to authenticated;
create function public.student_public_profile_settings(p_input jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select security.student_public_profile_settings(p_input); $$;
revoke all on function public.student_public_profile_settings(jsonb) from public,anon,service_role;
grant execute on function public.student_public_profile_settings(jsonb) to authenticated;

-- Retain invitation-affiliation behavior and fence the legacy completion implementation.
alter function security.complete_student_onboarding(jsonb) rename to complete_student_onboarding_before_public_profile;
revoke all on function security.complete_student_onboarding_before_public_profile(jsonb) from public,anon,authenticated,service_role;
create function security.complete_student_onboarding(p_profile_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_result jsonb; v_user text;
begin
 select user_id into v_user from public.users where auth_user_id=(select auth.uid()) and lower(status)='active' for update;
 if v_user is null then raise exception using errcode='42501',message='Active authenticated account required'; end if;
 if exists(select 1 from public.app_role_memberships where user_id=v_user and lower(status)='active' and lower(role)<>'student')
 and not exists(select 1 from public.app_role_memberships where user_id=v_user and lower(status)='active' and lower(role)='student') then
  raise exception using errcode='42501',message='Student onboarding cannot change your provisioned role'; end if;
 select coalesce(profile_data,'{}'::jsonb) into v_input from public.wf_onboarding_accounts where auth_user_id=(select auth.uid());
 v_input:=coalesce(v_input,'{}'::jsonb)||coalesce(p_profile_data,'{}'::jsonb);
 if v_input->>'publicProfileVisibility' is null or v_input->>'publicProfileVisibility' not in ('public','private') then
  raise exception using errcode='22023',message='Choose Public or Private before completing onboarding'; end if;
 v_result:=security.complete_student_onboarding_before_public_profile(v_input);
 perform security.student_public_profile_settings(jsonb_build_object('visibility',v_input->>'publicProfileVisibility',
  'slug',v_input->>'publicProfileSlug','displayName',v_input->>'publicDisplayName','headline',v_input->>'publicHeadline','bio',v_input->>'publicBio'));
 return v_result;
end;
$$;
revoke all on function security.complete_student_onboarding(jsonb) from public,anon,service_role;
grant execute on function security.complete_student_onboarding(jsonb) to authenticated;
-- Rebind invoker explicitly after renaming the internal implementation.
create or replace function public.complete_student_onboarding(p_profile_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select security.complete_student_onboarding(p_profile_data); $$;
revoke all on function public.complete_student_onboarding(jsonb) from public,anon,service_role;
grant execute on function public.complete_student_onboarding(jsonb) to authenticated;

-- Public reads are service-only and project only approved curated fields. No raw row or JSON snapshot is returned.
create function public.student_public_profile_read(p_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare page public.wf_public_pages%rowtype; v_redirect boolean:=false;
begin
 if p_path !~ '^/students/[a-z0-9]+(-[a-z0-9]+)*$' or length(p_path)>74 then return jsonb_build_object('found',false); end if;
 select p.* into page from public.wf_public_pages p join public.wf_student_profiles s on s.student_id=p.entity_id
 join public.users u on u.user_id=s.user_id
 where p.entity_type='student' and p.canonical_path=p_path and p.visibility='public' and p.publication_status='published'
 and lower(u.status)='active' and lower(s.profile_status)='active';
 if not found then
  select p.* into page from public.wf_public_page_redirects r join public.wf_public_pages p on p.public_page_id=r.public_page_id
  join public.wf_student_profiles s on s.student_id=p.entity_id join public.users u on u.user_id=s.user_id
  where r.from_path=p_path and r.active and p.entity_type='student' and p.visibility='public' and p.publication_status='published'
   and lower(u.status)='active' and lower(s.profile_status)='active';
  if not found then return jsonb_build_object('found',false); end if;
  v_redirect:=true;
 end if;
 return jsonb_build_object('found',true,'redirect',v_redirect,'path',page.canonical_path,'displayName',page.display_name,
  'headline',page.headline,'bio',page.summary,'robotsIndex',page.robots_index,'robotsFollow',page.robots_follow);
end;
$$;
create function public.student_public_profile_sitemap() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',p.canonical_path,'updatedAt',p.updated_at) order by p.canonical_path),'[]'::jsonb)
 from public.wf_public_pages p join public.wf_student_profiles s on s.student_id=p.entity_id join public.users u on u.user_id=s.user_id
 where p.entity_type='student' and p.visibility='public' and p.publication_status='published' and p.robots_index
  and lower(u.status)='active' and lower(s.profile_status)='active';
$$;
revoke all on function public.student_public_profile_read(text),public.student_public_profile_sitemap() from public,anon,authenticated;
grant execute on function public.student_public_profile_read(text),public.student_public_profile_sitemap() to service_role;
