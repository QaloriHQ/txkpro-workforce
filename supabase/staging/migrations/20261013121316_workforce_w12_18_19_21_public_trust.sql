-- W12-18 / W12-19 / W12-21
-- Curated organization publication, professional reviews, and cross-app SEO.
-- Public tables remain deny-by-default; all reads and writes use bounded RPCs.

create table if not exists public.wf_profile_review_reports (
  id uuid primary key default gen_random_uuid(),
  report_id text not null unique default security.new_legacy_id('RVR'),
  profile_review_id text not null
    references public.wf_profile_reviews(profile_review_id) on delete cascade,
  reporter_user_id text not null references public.users(user_id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','false_information','privacy','other')),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_review_id, reporter_user_id)
);

create index if not exists wf_profile_review_reports_status_idx
  on public.wf_profile_review_reports(status, created_at);

alter table public.wf_profile_review_reports enable row level security;
revoke all on table public.wf_profile_review_reports from public, anon, authenticated;
grant all on table public.wf_profile_review_reports to service_role;

comment on table public.wf_profile_review_reports is
  'Private abuse-report queue for professional reviews. Public review projections never expose reporter identity or moderation metadata.';

create or replace function security.organization_manage_allowed(
  p_kind text,
  p_entity_id text,
  p_user_id text
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.users u
    where u.user_id=p_user_id and lower(u.status)='active'
  ) and case p_kind
    when 'employer' then
      exists(select 1 from public.contractors c
        where c.contractor_id=p_entity_id
          and lower(c.approval_status)='approved'
          and lower(c.account_status)='active')
      and exists(select 1 from public.app_role_memberships m
        where m.user_id=p_user_id and lower(m.status)='active'
          and lower(m.scope_type) in ('employer','contractor')
          and m.scope_id=p_entity_id
          and lower(m.role) in ('employer_owner','employer_admin'))
    when 'institution' then
      exists(select 1 from public.wf_institutions i
        where i.institution_id=p_entity_id and i.active)
      and exists(select 1 from public.app_role_memberships m
        where m.user_id=p_user_id and lower(m.status)='active'
          and lower(m.scope_type)='institution' and m.scope_id=p_entity_id
          and security.canonical_institution_role(m.role) in
            ('institution_super_admin','institution_admin'))
    else false
  end;
$$;
revoke all on function security.organization_manage_allowed(text,text,text)
  from public,anon,authenticated,service_role;

create or replace function security.organization_public_page_visible(p_page_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.wf_public_pages p
    where p.public_page_id=p_page_id
      and p.entity_type in ('employer','institution')
      and p.visibility='public'
      and p.publication_status='published'
      and p.canonical_path=case p.entity_type
        when 'employer' then '/employers/'||p.slug
        else '/institutions/'||p.slug end
      and case p.entity_type
        when 'employer' then exists(select 1 from public.contractors c
          where c.contractor_id=p.entity_id
            and lower(c.approval_status)='approved'
            and lower(c.account_status)='active')
        when 'institution' then exists(select 1 from public.wf_institutions i
          where i.institution_id=p.entity_id and i.active)
        else false end
  );
$$;
revoke all on function security.organization_public_page_visible(text)
  from public,anon,authenticated,service_role;

create or replace function security.organization_public_profile_settings(
  p_kind text,
  p_entity_id text,
  p_input jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor text;
  v_page public.wf_public_pages%rowtype;
  v_old public.wf_public_pages%rowtype;
  v_slug text;
  v_path text;
  v_name text;
  v_visibility text;
  v_location jsonb;
  v_service jsonb;
  v_focus jsonb;
  v_contact jsonb;
  v_website jsonb;
  v_logo text;
  v_share text;
begin
  if p_kind not in ('employer','institution') or nullif(btrim(coalesce(p_entity_id,'')),'') is null then
    raise exception using errcode='22023',message='Choose a valid organization';
  end if;
  select user_id into v_actor from public.users
    where auth_user_id=(select auth.uid()) and lower(status)='active';
  if v_actor is null or not security.organization_manage_allowed(p_kind,p_entity_id,v_actor) then
    raise exception using errcode='42501',message='Organization profile management denied';
  end if;

  if p_kind='employer' then
    perform 1 from public.contractors where contractor_id=p_entity_id for update;
  else
    perform 1 from public.wf_institutions where institution_id=p_entity_id for update;
  end if;
  select * into v_page from public.wf_public_pages
    where entity_type=p_kind and entity_id=p_entity_id;

  if p_input is null then
    return jsonb_build_object(
      'kind',p_kind,'entityId',p_entity_id,'chosen',v_page.public_page_id is not null,
      'slug',coalesce(v_page.slug,''),'path',v_page.canonical_path,
      'displayName',coalesce(v_page.display_name,case when p_kind='employer'
        then (select business_name from public.contractors where contractor_id=p_entity_id)
        else (select name from public.wf_institutions where institution_id=p_entity_id) end,''),
      'summary',coalesce(v_page.summary,''),'visibility',coalesce(v_page.visibility,'private'),
      'robotsIndex',coalesce(v_page.robots_index,false),
      'logoUrl',v_page.profile_image_url,'shareImageUrl',v_page.share_image_url,
      'website',coalesce((select content->>'url' from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='website'),''),
      'city',coalesce((select content->>'city' from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='location'),''),
      'state',coalesce((select content->>'state' from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='location'),''),
      'serviceArea',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='service_area'),''),
      'focusItems',coalesce((select content->'items' from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='focus'),'[]'::jsonb),
      'contactAction',coalesce((select content from public.wf_public_profile_sections where public_page_id=v_page.public_page_id and section_key='contact'),'{}'::jsonb)
    );
  end if;

  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>24000
    or exists(select 1 from jsonb_object_keys(p_input) k where k not in
      ('slug','displayName','summary','visibility','robotsIndex','logoUrl','shareImageUrl','website','city','state','serviceArea','focusItems','contactAction')) then
    raise exception using errcode='22023',message='Invalid organization profile';
  end if;
  v_slug:=lower(btrim(p_input->>'slug'));
  v_name:=btrim(p_input->>'displayName');
  v_visibility:=p_input->>'visibility';
  if v_slug is null or length(v_slug) not between 3 and 80 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode='22023',message='Use a URL of 3–80 lowercase letters, numbers and single hyphens';
  end if;
  if v_name is null or length(v_name) not between 1 and 160
    or coalesce(length(p_input->>'summary'),0)>3000
    or coalesce(length(p_input->>'website'),0)>500
    or coalesce(length(p_input->>'city'),0)>120
    or coalesce(length(p_input->>'state'),0)>80
    or coalesce(length(p_input->>'serviceArea'),0)>1000 then
    raise exception using errcode='22023',message='Check organization profile field lengths';
  end if;
  if v_visibility not in ('public','private') then
    raise exception using errcode='22023',message='Choose Public or Private';
  end if;
  if jsonb_typeof(coalesce(p_input->'focusItems','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_input->'focusItems','[]'::jsonb))>20
    or exists(select 1 from jsonb_array_elements_text(coalesce(p_input->'focusItems','[]'::jsonb)) x where length(btrim(x)) not between 1 and 120) then
    raise exception using errcode='22023',message='Add up to 20 focus items';
  end if;
  if jsonb_typeof(coalesce(p_input->'contactAction','{}'::jsonb))<>'object'
    or exists(select 1 from jsonb_object_keys(coalesce(p_input->'contactAction','{}'::jsonb)) k where k not in ('label','href'))
    or coalesce(length(p_input->'contactAction'->>'label'),0)>80
    or coalesce(length(p_input->'contactAction'->>'href'),0)>500 then
    raise exception using errcode='22023',message='Invalid public contact action';
  end if;
  if nullif(btrim(coalesce(p_input->>'website','')),'') is not null
    and p_input->>'website' !~ '^https://[^[:space:]]+$' then
    raise exception using errcode='22023',message='Website must use HTTPS';
  end if;
  if nullif(btrim(coalesce(p_input->'contactAction'->>'href','')),'') is not null
    and p_input->'contactAction'->>'href' !~ '^(https://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+)$' then
    raise exception using errcode='22023',message='Contact action must use HTTPS or a public email link';
  end if;
  v_logo:=nullif(btrim(p_input->>'logoUrl'),'');
  v_share:=nullif(btrim(p_input->>'shareImageUrl'),'');
  if (v_logo is not null and v_logo !~ '^https://[^[:space:]]+$')
    or (v_share is not null and v_share !~ '^https://[^[:space:]]+$') then
    raise exception using errcode='22023',message='Public images must use HTTPS';
  end if;

  v_path:=case p_kind when 'employer' then '/employers/' else '/institutions/' end||v_slug;
  perform pg_advisory_xact_lock(hashtextextended(v_path,57));
  if exists(select 1 from public.wf_public_page_redirects r
      where r.from_path=v_path and r.public_page_id is distinct from v_page.public_page_id)
    or exists(select 1 from public.wf_public_pages p
      where p.canonical_path=v_path and p.public_page_id is distinct from v_page.public_page_id) then
    raise exception using errcode='23505',message='That public URL is already in use';
  end if;
  v_old:=v_page;
  insert into public.wf_public_pages(
    entity_type,entity_id,slug,canonical_path,visibility,publication_status,
    robots_index,robots_follow,display_name,summary,profile_image_url,
    share_image_url,seo_title,meta_description,published_at
  ) values(
    p_kind,p_entity_id,v_slug,v_path,v_visibility,
    case when v_visibility='public' then 'published' else 'unpublished' end,
    v_visibility='public' and coalesce((p_input->>'robotsIndex')::boolean,false),
    v_visibility='public',v_name,nullif(btrim(p_input->>'summary'),''),v_logo,v_share,
    v_name,nullif(left(btrim(p_input->>'summary'),300),''),
    case when v_visibility='public' then now() else null end
  ) on conflict(entity_type,entity_id) do update set
    slug=excluded.slug,canonical_path=excluded.canonical_path,
    visibility=excluded.visibility,publication_status=excluded.publication_status,
    robots_index=excluded.robots_index,robots_follow=excluded.robots_follow,
    display_name=excluded.display_name,summary=excluded.summary,
    profile_image_url=excluded.profile_image_url,share_image_url=excluded.share_image_url,
    seo_title=excluded.seo_title,meta_description=excluded.meta_description,
    published_at=case when excluded.visibility='public' then coalesce(wf_public_pages.published_at,now()) else null end,
    updated_at=clock_timestamp()
  returning * into v_page;

  v_location:=jsonb_build_object('city',nullif(btrim(p_input->>'city'),''),'state',nullif(btrim(p_input->>'state'),''));
  v_service:=jsonb_build_object('text',nullif(btrim(p_input->>'serviceArea'),''));
  v_focus:=jsonb_build_object('items',coalesce(p_input->'focusItems','[]'::jsonb));
  v_contact:=coalesce(p_input->'contactAction','{}'::jsonb);
  v_website:=jsonb_build_object('url',nullif(btrim(p_input->>'website'),''));
  insert into public.wf_public_profile_sections(public_page_id,section_key,section_type,title,content,sequence_no,visible)
  values
    (v_page.public_page_id,'location','custom','Location',v_location,1,true),
    (v_page.public_page_id,'service_area','custom','Service area',v_service,2,true),
    (v_page.public_page_id,'focus','programs',case when p_kind='employer' then 'Hiring focus' else 'Programs' end,v_focus,3,true),
    (v_page.public_page_id,'website','contact','Website',v_website,4,true),
    (v_page.public_page_id,'contact','contact','Contact',v_contact,5,true)
  on conflict(public_page_id,section_key) do update set
    section_type=excluded.section_type,title=excluded.title,content=excluded.content,
    sequence_no=excluded.sequence_no,visible=excluded.visible,updated_at=clock_timestamp();

  update public.wf_public_page_redirects set active=false
    where public_page_id=v_page.public_page_id and from_path=v_path;
  update public.wf_public_page_redirects set to_path=v_path
    where public_page_id=v_page.public_page_id and active;
  if v_old.public_page_id is not null and v_old.canonical_path<>v_path then
    insert into public.wf_public_page_redirects(public_page_id,from_path,to_path,status_code)
    values(v_page.public_page_id,v_old.canonical_path,v_path,308)
    on conflict(from_path) do update set to_path=excluded.to_path,active=true,status_code=308;
  end if;
  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json
  ) values(
    (select auth.uid()),v_actor,'ORGANIZATION_PUBLIC_PROFILE_CHANGED',p_kind,p_entity_id,'organization_public_profile',
    jsonb_build_object('visibility',v_old.visibility,'path',v_old.canonical_path),
    jsonb_build_object('visibility',v_page.visibility,'path',v_page.canonical_path,'robotsIndex',v_page.robots_index)
  );
  return security.organization_public_profile_settings(p_kind,p_entity_id,null);
end;
$$;
revoke all on function security.organization_public_profile_settings(text,text,jsonb)
  from public,anon,service_role;
grant execute on function security.organization_public_profile_settings(text,text,jsonb)
  to authenticated;

create or replace function public.organization_public_profile_settings(
  p_kind text,p_entity_id text,p_input jsonb default null
) returns jsonb
language sql
security invoker
set search_path=''
as $$ select security.organization_public_profile_settings(p_kind,p_entity_id,p_input); $$;
revoke all on function public.organization_public_profile_settings(text,text,jsonb)
  from public,anon,service_role;
grant execute on function public.organization_public_profile_settings(text,text,jsonb)
  to authenticated;

create or replace function security.organization_public_read(p_path text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p public.wf_public_pages%rowtype;
  v_redirect boolean:=false;
begin
  if p_path is null or p_path !~ '^/(employers|institutions)/[a-z0-9]+(-[a-z0-9]+)*$' or length(p_path)>100 then
    return jsonb_build_object('found',false);
  end if;
  select * into p from public.wf_public_pages page
    where page.canonical_path=p_path and security.organization_public_page_visible(page.public_page_id);
  if not found then
    select page.* into p from public.wf_public_page_redirects r
      join public.wf_public_pages page on page.public_page_id=r.public_page_id
      where r.from_path=p_path and r.active
        and security.organization_public_page_visible(page.public_page_id);
    if not found then return jsonb_build_object('found',false); end if;
    v_redirect:=true;
  end if;
  if v_redirect then
    return jsonb_build_object('found',true,'redirectPath',p.canonical_path);
  end if;
  return jsonb_build_object(
    'found',true,'kind',p.entity_type,'entityId',p.entity_id,
    'canonicalPath',p.canonical_path,'displayName',p.display_name,
    'summary',p.summary,'logoUrl',p.profile_image_url,'shareImageUrl',p.share_image_url,
    'robotsIndex',p.robots_index,'robotsFollow',p.robots_follow,
    'seoTitle',p.seo_title,'metaDescription',p.meta_description,'updatedAt',p.updated_at,
    'website',coalesce((select content->>'url' from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='website' and visible),''),
    'city',coalesce((select content->>'city' from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='location' and visible),''),
    'state',coalesce((select content->>'state' from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='location' and visible),''),
    'serviceArea',coalesce((select content->>'text' from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='service_area' and visible),''),
    'focusItems',coalesce((select content->'items' from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='focus' and visible),'[]'::jsonb),
    'contactAction',coalesce((select content from public.wf_public_profile_sections where public_page_id=p.public_page_id and section_key='contact' and visible),'{}'::jsonb),
    'courses',case when p.entity_type='employer' then coalesce((
      select jsonb_agg(jsonb_build_object('title',c.display_name,'path',c.canonical_path,'description',c.summary) order by c.display_name)
      from public.wf_public_pages c where c.parent_public_page_id=p.public_page_id and c.entity_type='course'
        and security.learning_public_page_visible(c.public_page_id)
    ),'[]'::jsonb) else '[]'::jsonb end,
    'credentials',case when p.entity_type='employer' then coalesce((
      select jsonb_agg(jsonb_build_object('title',c.display_name,'path',c.canonical_path) order by c.updated_at desc)
      from public.wf_public_pages c
      join public.wf_employer_certification_awards a on a.certification_award_id=c.entity_id
      where c.entity_type='credential' and a.employer_id=p.entity_id
        and c.visibility='public' and c.publication_status='published'
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function security.organization_public_read(text)
  from public,anon,authenticated;
grant execute on function security.organization_public_read(text) to service_role;

create or replace function public.organization_public_read(p_path text)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select security.organization_public_read(p_path); $$;
revoke all on function public.organization_public_read(text)
  from public,anon,authenticated;
grant execute on function public.organization_public_read(text) to service_role;

create or replace function public.organization_public_sitemap()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('path',p.canonical_path,'updatedAt',p.updated_at) order by p.canonical_path),'[]'::jsonb)
  from public.wf_public_pages p
  where p.entity_type in ('employer','institution') and p.robots_index
    and security.organization_public_page_visible(p.public_page_id);
$$;
revoke all on function public.organization_public_sitemap()
  from public,anon,authenticated;
grant execute on function public.organization_public_sitemap() to service_role;

create or replace function public.credential_public_sitemap()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('path',p.canonical_path,'updatedAt',p.updated_at) order by p.canonical_path),'[]'::jsonb)
  from public.wf_public_pages p
  join public.wf_employer_certification_awards a on a.certification_award_id=p.entity_id
  where p.entity_type='credential' and p.visibility='public'
    and p.publication_status='published' and p.robots_index
    and lower(a.status) in ('active','expired','revoked');
$$;
revoke all on function public.credential_public_sitemap()
  from public,anon,authenticated;
grant execute on function public.credential_public_sitemap() to service_role;

create or replace function security.professional_review_eligibility(
  p_target_path text,
  p_actor_user_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_target public.wf_public_pages%rowtype;
  v_role text;
  v_verified boolean:=false;
  v_target_institution text;
begin
  select * into v_target from public.wf_public_pages p
    where p.canonical_path=p_target_path and p.entity_type='educator'
      and security.professional_page_publishable(p.public_page_id);
  if not found then return jsonb_build_object('eligible',false,'reason','Profile is unavailable'); end if;
  if p_actor_user_id is null or not exists(select 1 from public.users where user_id=p_actor_user_id and lower(status)='active') then
    return jsonb_build_object('eligible',false,'reason','Active account required');
  end if;
  if p_actor_user_id=v_target.owner_user_id then
    return jsonb_build_object('eligible',false,'reason','You cannot review your own profile');
  end if;

  select i.institution_id into v_target_institution
  from public.wf_institutions i
  where i.active and exists(
    select 1 from public.app_role_memberships tm
    where tm.user_id=v_target.owner_user_id and lower(tm.status)='active'
      and security.retention_membership_matches(tm.id,i.institution_id,null)
  ) order by i.institution_id limit 1;

  if exists(select 1 from public.app_role_memberships m
      where m.user_id=p_actor_user_id and lower(m.status)='active' and lower(m.role)='student') then
    v_role:='student';
    v_verified:=v_target_institution is not null and exists(
      select 1 from public.wf_student_profiles s
      where s.user_id=p_actor_user_id and s.school_id=v_target_institution
    );
  elsif exists(select 1 from public.app_role_memberships m
      where m.user_id=p_actor_user_id and lower(m.status)='active'
        and security.canonical_institution_role(m.role) in ('instructor','assistant_instructor')) then
    v_role:='educator';
    v_verified:=v_target_institution is not null and exists(
      select 1 from public.app_role_memberships m
      where m.user_id=p_actor_user_id and lower(m.status)='active'
        and security.retention_membership_matches(m.id,v_target_institution,null)
    );
  elsif v_target_institution is not null and exists(
      select 1 from public.app_role_memberships m
      where m.user_id=p_actor_user_id and lower(m.status)='active'
        and security.canonical_institution_role(m.role) in
          ('institution_super_admin','institution_admin','department_head','program_coordinator')
        and security.retention_membership_matches(m.id,v_target_institution,null)
    ) then
    v_role:='institution_leadership';
    v_verified:=true;
  else
    return jsonb_build_object('eligible',false,'reason','Reviewer role or relationship is not eligible');
  end if;
  return jsonb_build_object(
    'eligible',true,'relationshipContext',v_role,
    'verifiedRelationship',v_verified,'targetPageId',v_target.public_page_id
  );
end;
$$;
revoke all on function security.professional_review_eligibility(text,text)
  from public,anon,authenticated,service_role;

create or replace function security.professional_review_context(p_target_path text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor text;
  v_eligibility jsonb;
  v_review public.wf_profile_reviews%rowtype;
begin
  select user_id into v_actor from public.users
    where auth_user_id=(select auth.uid()) and lower(status)='active';
  if v_actor is null then raise exception using errcode='42501',message='Sign in required'; end if;
  v_eligibility:=security.professional_review_eligibility(p_target_path,v_actor);
  if coalesce((v_eligibility->>'eligible')::boolean,false) then
    select * into v_review from public.wf_profile_reviews
      where target_public_page_id=v_eligibility->>'targetPageId' and reviewer_user_id=v_actor;
  end if;
  return v_eligibility||jsonb_build_object('review',case when v_review.profile_review_id is null then null else
    jsonb_build_object('id',v_review.profile_review_id,'rating',v_review.rating,'title',v_review.review_title,
      'body',v_review.review_body,'status',v_review.status,'updatedAt',v_review.updated_at) end);
end;
$$;
revoke all on function security.professional_review_context(text)
  from public,anon,service_role;
grant execute on function security.professional_review_context(text) to authenticated;

create or replace function public.professional_review_context(p_target_path text)
returns jsonb language sql security invoker set search_path=''
as $$ select security.professional_review_context(p_target_path); $$;
revoke all on function public.professional_review_context(text) from public,anon,service_role;
grant execute on function public.professional_review_context(text) to authenticated;

create or replace function security.professional_review_save(p_target_path text,p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor text;
  v_eligibility jsonb;
  v_old public.wf_profile_reviews%rowtype;
  v_review public.wf_profile_reviews%rowtype;
  v_reviewer_page text;
  v_rating integer;
  v_title text;
  v_body text;
begin
  select user_id into v_actor from public.users
    where auth_user_id=(select auth.uid()) and lower(status)='active';
  if v_actor is null then raise exception using errcode='42501',message='Sign in required'; end if;
  v_eligibility:=security.professional_review_eligibility(p_target_path,v_actor);
  if not coalesce((v_eligibility->>'eligible')::boolean,false) then
    raise exception using errcode='42501',message=coalesce(v_eligibility->>'reason','Review access denied');
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('rating','title','body')) then
    raise exception using errcode='22023',message='Invalid review';
  end if;
  v_rating:=(p_input->>'rating')::integer;
  v_title:=nullif(btrim(p_input->>'title'),'');
  v_body:=nullif(btrim(p_input->>'body'),'');
  if v_rating not between 1 and 5 or coalesce(length(v_title),0)>120
    or v_body is null or length(v_body) not between 20 and 3000 then
    raise exception using errcode='22023',message='Choose 1–5 stars and write 20–3000 characters';
  end if;
  select * into v_old from public.wf_profile_reviews
    where target_public_page_id=v_eligibility->>'targetPageId' and reviewer_user_id=v_actor for update;
  if v_old.status='removed' then
    raise exception using errcode='42501',message='A removed review cannot be restored';
  end if;
  select public_page_id into v_reviewer_page from public.wf_public_pages p
    where p.owner_user_id=v_actor and p.entity_type in ('educator','staff')
      and security.professional_page_publishable(p.public_page_id)
    order by case p.entity_type when 'educator' then 0 else 1 end limit 1;
  insert into public.wf_profile_reviews(
    target_public_page_id,reviewer_user_id,reviewer_public_page_id,rating,
    review_title,review_body,relationship_context,verified_relationship,status
  ) values(
    v_eligibility->>'targetPageId',v_actor,v_reviewer_page,v_rating,v_title,v_body,
    v_eligibility->>'relationshipContext',coalesce((v_eligibility->>'verifiedRelationship')::boolean,false),'pending'
  ) on conflict(target_public_page_id,reviewer_user_id) do update set
    reviewer_public_page_id=excluded.reviewer_public_page_id,rating=excluded.rating,
    review_title=excluded.review_title,review_body=excluded.review_body,
    relationship_context=excluded.relationship_context,
    verified_relationship=excluded.verified_relationship,status='pending',
    moderation_metadata='{}'::jsonb,updated_at=clock_timestamp()
  returning * into v_review;
  insert into public.platform_audit_events(
    actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json
  ) values(
    (select auth.uid()),v_actor,'PROFESSIONAL_REVIEW_SUBMITTED','profile_review',v_review.profile_review_id,'professional_review',
    jsonb_build_object('status',v_old.status),
    jsonb_build_object('status',v_review.status,'rating',v_review.rating,'verifiedRelationship',v_review.verified_relationship)
  );
  return security.professional_review_context(p_target_path);
exception when invalid_text_representation then
  raise exception using errcode='22023',message='Choose a rating from 1 to 5';
end;
$$;
revoke all on function security.professional_review_save(text,jsonb)
  from public,anon,service_role;
grant execute on function security.professional_review_save(text,jsonb) to authenticated;

create or replace function public.professional_review_save(p_target_path text,p_input jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select security.professional_review_save(p_target_path,p_input); $$;
revoke all on function public.professional_review_save(text,jsonb) from public,anon,service_role;
grant execute on function public.professional_review_save(text,jsonb) to authenticated;

create or replace function security.professional_review_report(p_review_id text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor text; v_review public.wf_profile_reviews%rowtype; v_report public.wf_profile_review_reports%rowtype;
begin
  select user_id into v_actor from public.users
    where auth_user_id=(select auth.uid()) and lower(status)='active';
  if v_actor is null then raise exception using errcode='42501',message='Sign in required'; end if;
  if p_reason not in ('spam','harassment','false_information','privacy','other') then
    raise exception using errcode='22023',message='Choose a report reason';
  end if;
  select * into v_review from public.wf_profile_reviews
    where profile_review_id=p_review_id and status='published';
  if not found or v_review.reviewer_user_id=v_actor then
    raise exception using errcode='42501',message='Review report denied';
  end if;
  insert into public.wf_profile_review_reports(profile_review_id,reporter_user_id,reason)
  values(p_review_id,v_actor,p_reason)
  on conflict(profile_review_id,reporter_user_id) do update set
    reason=excluded.reason,status='open',updated_at=clock_timestamp()
  returning * into v_report;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,after_json)
  values((select auth.uid()),v_actor,'PROFESSIONAL_REVIEW_REPORTED','profile_review',p_review_id,'professional_review',
    jsonb_build_object('reportId',v_report.report_id,'reason',v_report.reason));
  return jsonb_build_object('ok',true,'reportId',v_report.report_id);
end;
$$;
revoke all on function security.professional_review_report(text,text)
  from public,anon,service_role;
grant execute on function security.professional_review_report(text,text) to authenticated;

create or replace function public.professional_review_report(p_review_id text,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select security.professional_review_report(p_review_id,p_reason); $$;
revoke all on function public.professional_review_report(text,text) from public,anon,service_role;
grant execute on function public.professional_review_report(text,text) to authenticated;

create or replace function security.professional_review_moderate(
  p_review_id text,p_status text,p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor text; v_old public.wf_profile_reviews%rowtype; v_review public.wf_profile_reviews%rowtype;
begin
  select user_id into v_actor from public.users
    where auth_user_id=(select auth.uid()) and lower(status)='active';
  if v_actor is null or not security.is_admin() then
    raise exception using errcode='42501',message='Review moderation denied';
  end if;
  if p_status not in ('published','hidden','removed') or coalesce(length(p_note),0)>1000 then
    raise exception using errcode='22023',message='Invalid moderation decision';
  end if;
  select * into v_old from public.wf_profile_reviews where profile_review_id=p_review_id for update;
  if not found then raise exception using errcode='22023',message='Review not found'; end if;
  update public.wf_profile_reviews set status=p_status,
    moderation_metadata=jsonb_build_object('moderatedBy',v_actor,'moderatedAt',clock_timestamp(),'note',nullif(btrim(p_note),'')),
    updated_at=clock_timestamp()
    where profile_review_id=p_review_id returning * into v_review;
  insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,source,before_json,after_json)
  values((select auth.uid()),v_actor,'PROFESSIONAL_REVIEW_MODERATED','profile_review',p_review_id,'professional_review',
    jsonb_build_object('status',v_old.status),jsonb_build_object('status',v_review.status));
  return jsonb_build_object('id',v_review.profile_review_id,'status',v_review.status);
end;
$$;
revoke all on function security.professional_review_moderate(text,text,text)
  from public,anon,service_role;
grant execute on function security.professional_review_moderate(text,text,text) to authenticated;

create or replace function public.professional_review_moderate(
  p_review_id text,p_status text,p_note text default null
) returns jsonb language sql security invoker set search_path=''
as $$ select security.professional_review_moderate(p_review_id,p_status,p_note); $$;
revoke all on function public.professional_review_moderate(text,text,text) from public,anon,service_role;
grant execute on function public.professional_review_moderate(text,text,text) to authenticated;

comment on function public.organization_public_profile_settings(text,text,jsonb) is
  'Owner/admin-only organization publication settings. Publication never exposes private tenant records.';
comment on function public.professional_review_save(text,jsonb) is
  'Eligibility-checked one-review-per-reviewer upsert. Revised reviews return to pending moderation.';
