-- W11-04B. Public output is explicitly projected; no private-table grants.
create or replace function security.learning_public_page_visible(p_page_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.wf_public_pages p
    where p.public_page_id=p_page_id and p.visibility='public' and p.publication_status='published'
    and (
      (p.entity_type='employer' and exists (
        select 1 from public.contractors e where e.contractor_id=p.entity_id
        and lower(e.approval_status)='approved' and lower(e.account_status)='active'
        and p.canonical_path='/employers/'||p.slug
      ))
      or (p.entity_type='course' and exists (
        select 1 from public.wf_employer_micro_certs c
        join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id=c.current_version_id and v.micro_cert_id=c.micro_cert_id
        join public.wf_public_pages e on e.public_page_id=p.parent_public_page_id and e.entity_type='employer' and e.entity_id=c.employer_id
        where c.micro_cert_id=p.entity_id and c.active and v.status='live'
        and p.canonical_path=e.canonical_path||'/courses/'||p.slug
        and security.learning_public_page_visible(e.public_page_id)
      ))
      or (p.entity_type='lesson' and exists (
        select 1 from public.wf_employer_micro_cert_lessons l
        join public.wf_employer_micro_certs c on c.current_version_id=l.micro_cert_version_id
        join public.wf_public_pages cp on cp.public_page_id=p.parent_public_page_id and cp.entity_type='course' and cp.entity_id=c.micro_cert_id
        where l.lesson_id=p.entity_id and l.status in ('ready','published')
        and p.canonical_path=cp.canonical_path||'/lessons/'||p.slug
        and security.learning_public_page_visible(cp.public_page_id)
      ))
    )
  );
$$;
revoke all on function security.learning_public_page_visible(text) from public,anon,authenticated;
grant execute on function security.learning_public_page_visible(text) to service_role;

-- Shared internal write: caller must hold the course lock and have publication authority.
create or replace function security.learning_public_page_save(
  p_type text,p_entity text,p_parent text,p_slug text,p_path text,p_name text,p_input jsonb,p_employer text
) returns public.wf_public_pages language plpgsql security definer set search_path='' as $$
declare
  old public.wf_public_pages%rowtype;
  result public.wf_public_pages%rowtype;
  visibility text:=coalesce(p_input->>'visibility','private');
  state text:=coalesce(p_input->>'publicationStatus','draft');
begin
  if visibility not in ('public','private') or state not in ('draft','published','unpublished') then
    raise exception 'Invalid public publication settings';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>100 then raise exception 'Invalid public URL slug'; end if;
  if exists(select 1 from public.wf_public_page_redirects where from_path=p_path and active and public_page_id<>coalesce((select public_page_id from public.wf_public_pages where entity_type=p_type and entity_id=p_entity),'')) then
    raise exception 'Public URL is reserved by a redirect';
  end if;
  select * into old from public.wf_public_pages where entity_type=p_type and entity_id=p_entity for update;
  insert into public.wf_public_pages(entity_type,entity_id,parent_public_page_id,slug,canonical_path,display_name,visibility,publication_status,robots_index,seo_title,meta_description,published_at)
  values(p_type,p_entity,p_parent,p_slug,p_path,p_name,visibility,state,
    coalesce((p_input->>'robotsIndex')::boolean,false),nullif(btrim(p_input->>'seoTitle'),''),nullif(btrim(p_input->>'metaDescription'),''),case when state='published' then now() end)
  on conflict(entity_type,entity_id) do update set
    parent_public_page_id=excluded.parent_public_page_id,slug=excluded.slug,canonical_path=excluded.canonical_path,display_name=excluded.display_name,
    visibility=excluded.visibility,publication_status=excluded.publication_status,robots_index=excluded.robots_index,
    seo_title=excluded.seo_title,meta_description=excluded.meta_description,
    published_at=case when excluded.publication_status='published' then coalesce(wf_public_pages.published_at,now()) else wf_public_pages.published_at end,
    updated_at=case when (wf_public_pages.parent_public_page_id,wf_public_pages.slug,wf_public_pages.canonical_path,wf_public_pages.display_name,wf_public_pages.visibility,wf_public_pages.publication_status,wf_public_pages.robots_index,wf_public_pages.seo_title,wf_public_pages.meta_description)
      is distinct from (excluded.parent_public_page_id,excluded.slug,excluded.canonical_path,excluded.display_name,excluded.visibility,excluded.publication_status,excluded.robots_index,excluded.seo_title,excluded.meta_description) then clock_timestamp() else wf_public_pages.updated_at end
  returning * into result;
  -- Point every historical alias directly at the latest URL. Reverting a slug cannot loop.
  update public.wf_public_page_redirects set active=false where from_path=result.canonical_path and public_page_id=result.public_page_id;
  update public.wf_public_page_redirects set to_path=result.canonical_path where public_page_id=result.public_page_id and active;
  if old.public_page_id is not null and old.canonical_path<>result.canonical_path then
    insert into public.wf_public_page_redirects(public_page_id,from_path,to_path,status_code)
    values(result.public_page_id,old.canonical_path,result.canonical_path,308)
    on conflict(from_path) do update set to_path=excluded.to_path,active=true,status_code=308;
  end if;
  if old.public_page_id is null or old.updated_at is distinct from result.updated_at then
    perform security.emit_employer_learning_event(
      p_event_type=>'EMPLOYER_LEARNING_PUBLICATION_CHANGED',p_target_id=>result.public_page_id,
      p_event_key=>'publication:'||result.public_page_id||':'||result.updated_at::text,
      p_source=>case when security.is_admin() then 'txkpro' else 'employer' end,p_employer_id=>p_employer,
      p_before=>jsonb_build_object('status',coalesce(old.publication_status,'draft'),'path',old.canonical_path),
      p_after=>jsonb_build_object('status',result.publication_status,'path',result.canonical_path),
      p_metadata=>jsonb_build_object('public_page_id',result.public_page_id,'entity_type',p_type,'entity_id',p_entity,
        'from_status',coalesce(old.publication_status,'draft'),'to_status',result.publication_status,'canonical_path',result.canonical_path)
    );
  end if;
  return result;
end;
$$;
revoke all on function security.learning_public_page_save(text,text,text,text,text,text,jsonb,text) from public,anon,authenticated;

-- Authenticated RPC. TXKPRO admins are supported independently of Employer membership.
create or replace function security.employer_learning_public_settings(p_course_id text,p_input jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.wf_employer_micro_certs%rowtype;
  ep public.wf_public_pages%rowtype;
  cp public.wf_public_pages%rowtype;
  lp public.wf_public_pages%rowtype;
  l public.wf_employer_micro_cert_lessons%rowtype;
  item jsonb;
  employer_slug text;
  course_slug text;
  slug text;
  children jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Publication access denied'; end if;
  select * into c from public.wf_employer_micro_certs where micro_cert_id=p_course_id for update;
  if c.micro_cert_id is null or not security.can_publish_employer_learning_entity('course',p_course_id) then
    raise exception 'Publication access denied';
  end if;
  -- Serialize all publishers for this Employer, including first-time parent creation.
  perform 1 from public.contractors where contractor_id=c.employer_id for update;
  select * into ep from public.wf_public_pages where entity_type='employer' and entity_id=c.employer_id;
  select * into cp from public.wf_public_pages where entity_type='course' and entity_id=p_course_id;
  if p_input is not null then
    if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid publication input'; end if;
    if p_input->>'expectedCurrentVersionId' is distinct from c.current_version_id then raise exception 'VERSION_CONFLICT: refresh before publishing'; end if;
    employer_slug:=coalesce(ep.slug,p_input->>'employerSlug');
    if ep.public_page_id is not null and p_input ? 'employerSlug' and p_input->>'employerSlug'<>ep.slug then raise exception 'Employer URL is shared; use its existing slug'; end if;
    if nullif(employer_slug,'') is null then raise exception 'Employer URL slug required'; end if;
    if ep.public_page_id is null or coalesce((p_input->>'publishEmployerPage')::boolean,false) then
      ep:=security.learning_public_page_save('employer',c.employer_id,null,employer_slug,'/employers/'||employer_slug,
        (select business_name from public.contractors where contractor_id=c.employer_id),
        jsonb_build_object('visibility',case when coalesce((p_input->>'publishEmployerPage')::boolean,false) then 'public' else 'private' end,
          'publicationStatus',case when coalesce((p_input->>'publishEmployerPage')::boolean,false) then 'published' else 'draft' end,
          'robotsIndex',coalesce(ep.robots_index,false),'seoTitle',ep.seo_title,'metaDescription',ep.meta_description),c.employer_id);
    end if;
    course_slug:=p_input->>'courseSlug';
    if nullif(course_slug,'') is null then raise exception 'Course URL slug required'; end if;
    if p_input->>'publicationStatus'='published' and p_input->>'visibility'='public'
      and not exists(select 1 from public.wf_employer_micro_cert_versions where micro_cert_version_id=c.current_version_id and status='live') then
      raise exception 'Course version must be live before public publication';
    end if;
    if p_input->>'publicationStatus'='published' and p_input->>'visibility'='public'
      and (ep.visibility<>'public' or ep.publication_status<>'published') then raise exception 'Public Employer page required before course publication'; end if;
    -- Every child's URL follows course renames, even children omitted from the submitted form.
    select coalesce(jsonb_agg(to_jsonb(p)),'[]') into children from public.wf_public_pages p where p.parent_public_page_id=cp.public_page_id and p.entity_type='lesson';
    cp:=security.learning_public_page_save('course',p_course_id,ep.public_page_id,course_slug,
      ep.canonical_path||'/courses/'||course_slug,c.title,p_input,c.employer_id);
    for item in select value from jsonb_array_elements(children) loop
      lp:=security.learning_public_page_save('lesson',item->>'entity_id',cp.public_page_id,item->>'slug',cp.canonical_path||'/lessons/'||(item->>'slug'),item->>'display_name',
        jsonb_build_object('visibility',item->>'visibility','publicationStatus',item->>'publication_status','robotsIndex',item->'robots_index','seoTitle',item->>'seo_title','metaDescription',item->>'meta_description'),c.employer_id);
    end loop;
    if p_input ? 'lessons' and jsonb_typeof(p_input->'lessons')<>'array' then raise exception 'Invalid lessons input'; end if;
    if jsonb_array_length(coalesce(p_input->'lessons','[]'))>200 then raise exception 'Too many lessons'; end if;
    for item in select value from jsonb_array_elements(coalesce(p_input->'lessons','[]')) loop
      select * into l from public.wf_employer_micro_cert_lessons where lesson_id=item->>'lessonId' and micro_cert_version_id=c.current_version_id;
      if l.lesson_id is null then raise exception 'Lesson outside current course version'; end if;
      if item->>'publicationStatus'='published' and item->>'visibility'='public' and l.status not in ('ready','published') then raise exception 'Lesson must be ready or published'; end if;
      slug:=item->>'slug';
      if nullif(slug,'') is null then raise exception 'Lesson URL slug required'; end if;
      lp:=security.learning_public_page_save('lesson',l.lesson_id,cp.public_page_id,slug,cp.canonical_path||'/lessons/'||slug,l.title,item,c.employer_id);
    end loop;
  end if;
  return jsonb_build_object('employerSlug',ep.slug,'employerPublished',ep.visibility='public' and ep.publication_status='published','course',case when cp.public_page_id is null then null else
    jsonb_build_object('slug',cp.slug,'canonicalPath',cp.canonical_path,'visibility',cp.visibility,'publicationStatus',cp.publication_status,'robotsIndex',cp.robots_index,'seoTitle',cp.seo_title,'metaDescription',cp.meta_description) end,
    'lessons',coalesce((select jsonb_agg(jsonb_build_object('lessonId',p.entity_id,'slug',p.slug,'canonicalPath',p.canonical_path,'visibility',p.visibility,'publicationStatus',p.publication_status,'robotsIndex',p.robots_index))
      from public.wf_public_pages p join public.wf_employer_micro_cert_lessons lesson_row on lesson_row.lesson_id=p.entity_id
      where p.entity_type='lesson' and lesson_row.micro_cert_version_id=c.current_version_id),'[]'));
exception when unique_violation then raise exception 'Public URL already in use; choose another slug';
end;
$$;
revoke all on function security.employer_learning_public_settings(text,jsonb) from public,anon;
grant execute on function security.employer_learning_public_settings(text,jsonb) to authenticated,service_role;
create or replace function public.employer_learning_public_settings(p_course_id text,p_input jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
  select security.employer_learning_public_settings(p_course_id,p_input);
$$;
revoke all on function public.employer_learning_public_settings(text,jsonb) from public,anon;
grant execute on function public.employer_learning_public_settings(text,jsonb) to authenticated,service_role;

create or replace function public.employer_learning_public_read(p_path text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  p public.wf_public_pages%rowtype;
  cp public.wf_public_pages%rowtype;
  ep public.wf_public_pages%rowtype;
  c public.wf_employer_micro_certs%rowtype;
  v public.wf_employer_micro_cert_versions%rowtype;
  l public.wf_employer_micro_cert_lessons%rowtype;
  alias boolean:=false;
begin
  select * into p from public.wf_public_pages where canonical_path=p_path and entity_type in ('employer','course','lesson');
  if p.public_page_id is null then
    select pp.* into p from public.wf_public_page_redirects r join public.wf_public_pages pp using(public_page_id)
      where r.from_path=p_path and r.active and pp.entity_type in ('employer','course','lesson');
    alias:=true;
  end if;
  if p.public_page_id is null or not security.learning_public_page_visible(p.public_page_id) then return jsonb_build_object('found',false); end if;
  if alias then return jsonb_build_object('found',true,'redirectPath',p.canonical_path); end if;
  if p.entity_type='employer' then
    return jsonb_build_object('found',true,'kind','employer','canonicalPath',p.canonical_path,'title',p.display_name,'robotsIndex',p.robots_index,
      'courses',coalesce((select jsonb_agg(jsonb_build_object('title',x.display_name,'canonicalPath',x.canonical_path)) from public.wf_public_pages x
        where x.parent_public_page_id=p.public_page_id and x.entity_type='course' and security.learning_public_page_visible(x.public_page_id)),'[]'));
  end if;
  if p.entity_type='lesson' then
    select * into l from public.wf_employer_micro_cert_lessons where lesson_id=p.entity_id;
    select * into cp from public.wf_public_pages where public_page_id=p.parent_public_page_id;
  else cp:=p; end if;
  select * into ep from public.wf_public_pages where public_page_id=cp.parent_public_page_id;
  select * into c from public.wf_employer_micro_certs where micro_cert_id=cp.entity_id;
  select * into v from public.wf_employer_micro_cert_versions where micro_cert_version_id=c.current_version_id;
  return jsonb_build_object('found',true,'kind',p.entity_type,'canonicalPath',p.canonical_path,'title',p.display_name,
    'description',case when p.entity_type='lesson' then l.description else c.description end,
    'learningObjective',case when p.entity_type='lesson' then l.learning_objective else v.learning_objective end,
    'durationMinutes',case when p.entity_type='lesson' then l.estimated_minutes else v.duration_minutes end,
    'versionNumber',v.version_number,'robotsIndex',p.robots_index and (p.entity_type='course' or cp.robots_index),
    'robotsFollow',p.robots_follow,'seoTitle',p.seo_title,'metaDescription',p.meta_description,
    'employer',jsonb_build_object('name',ep.display_name,'canonicalPath',ep.canonical_path),
    'course',jsonb_build_object('title',cp.display_name,'canonicalPath',cp.canonical_path),
    'lessons',coalesce((select jsonb_agg(jsonb_build_object('title',ll.title,'description',ll.description,'canonicalPath',pp.canonical_path,'durationMinutes',ll.estimated_minutes) order by ll.sequence_no)
      from public.wf_employer_micro_cert_lessons ll join public.wf_public_pages pp on pp.entity_type='lesson' and pp.entity_id=ll.lesson_id
      where ll.micro_cert_version_id=v.micro_cert_version_id and pp.parent_public_page_id=cp.public_page_id and security.learning_public_page_visible(pp.public_page_id)),'[]'),
    -- Deliberately omit rich HTML, embeds, signed/private media and arbitrary content/config JSON.
    'blocks',case when p.entity_type='lesson' then coalesce((select jsonb_agg(jsonb_build_object('type',b.block_type,'title',b.title,'text',case when b.block_type='rich_text' then regexp_replace(coalesce(b.content->>'html',b.content->>'text',''),'<[^>]*>',' ','g') else b.content->>'text' end) order by b.sequence_no)
      from public.wf_employer_micro_cert_lesson_blocks b where b.lesson_id=l.lesson_id and b.block_type in ('text','rich_text','heading','callout','safety_note','divider')),'[]') else '[]'::jsonb end);
end;
$$;
revoke all on function public.employer_learning_public_read(text) from public,anon,authenticated;
grant execute on function public.employer_learning_public_read(text) to service_role;

create or replace function public.employer_learning_public_sitemap()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('path',p.canonical_path,'updatedAt',p.updated_at)),'[]') from public.wf_public_pages p
  where p.entity_type in ('course','lesson') and p.robots_index
    and security.learning_public_page_visible(p.public_page_id)
    and (p.entity_type='course' or exists(select 1 from public.wf_public_pages cp where cp.public_page_id=p.parent_public_page_id and cp.robots_index));
$$;
revoke all on function public.employer_learning_public_sitemap() from public,anon,authenticated;
grant execute on function public.employer_learning_public_sitemap() to service_role;
