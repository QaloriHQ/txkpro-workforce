-- W12-16A. Curated Student portfolio; no award/skill/placement mutations.
create table public.wf_student_portfolio_preferences (
 student_id text primary key references public.wf_student_profiles(student_id),
 show_skills boolean not null default false, show_training boolean not null default false,
 show_badges boolean not null default false, show_certifications boolean not null default false,
 show_progress boolean not null default false,
 ranking_scope text not null default 'cohort' check(ranking_scope in ('cohort','institution','txkpro')),
 photo_id uuid, cover_id uuid, updated_at timestamptz not null default now()
);
create table public.wf_student_portfolio_files (
 id uuid primary key default gen_random_uuid(), student_id text not null references public.wf_student_profiles(student_id),
 title text not null check(length(title) between 1 and 120),
 kind text not null check(kind in ('photo','cover','project','resume','certificate','document')),
 access text not null default 'private' check(access in ('private','public','employer')),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
 size bigint not null check(size between 1 and 10485760),
 storage_path text not null unique, created_at timestamptz not null default now(),
 unique(student_id,id), check(kind not in ('photo','cover','project') or mime like 'image/%')
);
create table public.wf_student_portfolio_projects (
 id uuid primary key default gen_random_uuid(), student_id text not null references public.wf_student_profiles(student_id),
 title text not null check(length(title) between 1 and 120), description text not null default '' check(length(description)<=3000),
 skills text not null default '' check(length(skills)<=600), visibility text not null default 'private' check(visibility in ('private','public')),
 image_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(student_id,image_id) references public.wf_student_portfolio_files(student_id,id)
);
create index wf_student_portfolio_projects_student_idx on public.wf_student_portfolio_projects(student_id,image_id);
alter table public.wf_student_portfolio_preferences enable row level security;
alter table public.wf_student_portfolio_files enable row level security;
alter table public.wf_student_portfolio_projects enable row level security;
create policy portfolio_preferences_service on public.wf_student_portfolio_preferences to service_role using(true) with check(true);
create policy portfolio_files_service on public.wf_student_portfolio_files to service_role using(true) with check(true);
create policy portfolio_projects_service on public.wf_student_portfolio_projects to service_role using(true) with check(true);
revoke all on public.wf_student_portfolio_preferences,public.wf_student_portfolio_files,public.wf_student_portfolio_projects from anon,authenticated;
grant all on public.wf_student_portfolio_preferences,public.wf_student_portfolio_files,public.wf_student_portfolio_projects to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('student-portfolio','student-portfolio',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
-- No client Storage grants/policies. Only the server uploads and streams objects after checking access.
create function security.student_portfolio_read(p_student text,p_public boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'preferences',jsonb_build_object('showSkills',coalesce(pr.show_skills,false),'showTraining',coalesce(pr.show_training,false),
 'showBadges',coalesce(pr.show_badges,false),'showCertifications',coalesce(pr.show_certifications,false),
 'showProgress',coalesce(pr.show_progress,false),'rankingScope',coalesce(pr.ranking_scope,'cohort'),
 'photoId',(select f.id from public.wf_student_portfolio_files f where f.id=pr.photo_id and f.student_id=p_student and f.kind='photo' and (not p_public or f.access='public')),
 'coverId',(select f.id from public.wf_student_portfolio_files f where f.id=pr.cover_id and f.student_id=p_student and f.kind='cover' and (not p_public or f.access='public'))),
 'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,'skills',p.skills,'visibility',p.visibility,
 'imageId',(select f.id from public.wf_student_portfolio_files f where f.id=p.image_id and f.student_id=p_student and f.kind='project' and (not p_public or f.access='public'))) order by p.created_at desc)
 from public.wf_student_portfolio_projects p where p.student_id=p_student and (not p_public or p.visibility='public')),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'kind',f.kind,'access',f.access,'mime',f.mime,'size',f.size) order by f.created_at desc)
 from public.wf_student_portfolio_files f where f.student_id=p_student and (not p_public or f.access='public')),'[]'::jsonb),
 'progression',null)
 from (select 1) anchor left join public.wf_student_portfolio_preferences pr on pr.student_id=p_student;
$$;
revoke all on function security.student_portfolio_read(text,boolean) from public,anon,authenticated,service_role;

create function security.student_portfolio(p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s text; u text; op text; row_id uuid; n integer; f public.wf_student_portfolio_files%rowtype; path text; before_state jsonb; after_state jsonb;
begin
 s:=security.student_public_profile_actor();
 select user_id into u from public.wf_student_profiles where student_id=s;
 perform 1 from public.users where user_id=u for update; -- serialize limits, file deletion and preferences
 if p_input is null then return security.student_portfolio_read(s)||jsonb_build_object('studentId',s); end if;
 if jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>20000 then raise exception using errcode='22023',message='Invalid portfolio input'; end if;
 before_state:=security.student_portfolio_read(s);
 op:=p_input->>'op'; row_id:=nullif(p_input->>'id','')::uuid;
 if op='preferences' then
  -- Preserve existing defaults; full preferences object is required, no arbitrary JSON persisted.
  if (p_input->>'rankingScope') is null or p_input->>'rankingScope' not in ('cohort','institution','txkpro') then raise exception using errcode='22023',message='Choose a ranking scope'; end if;
  if nullif(p_input->>'photoId','') is not null and not exists(select 1 from public.wf_student_portfolio_files where id=(p_input->>'photoId')::uuid and student_id=s and kind='photo') then raise exception using errcode='22023',message='Choose your profile photo'; end if;
  if nullif(p_input->>'coverId','') is not null and not exists(select 1 from public.wf_student_portfolio_files where id=(p_input->>'coverId')::uuid and student_id=s and kind='cover') then raise exception using errcode='22023',message='Choose your cover image'; end if;
  insert into public.wf_student_portfolio_preferences(student_id,show_skills,show_training,show_badges,show_certifications,show_progress,ranking_scope,photo_id,cover_id)
  values(s,coalesce((p_input->>'showSkills')::boolean,false),coalesce((p_input->>'showTraining')::boolean,false),coalesce((p_input->>'showBadges')::boolean,false),coalesce((p_input->>'showCertifications')::boolean,false),coalesce((p_input->>'showProgress')::boolean,false),p_input->>'rankingScope',nullif(p_input->>'photoId','')::uuid,nullif(p_input->>'coverId','')::uuid)
  on conflict(student_id) do update set show_skills=excluded.show_skills,show_training=excluded.show_training,show_badges=excluded.show_badges,show_certifications=excluded.show_certifications,show_progress=excluded.show_progress,ranking_scope=excluded.ranking_scope,photo_id=excluded.photo_id,cover_id=excluded.cover_id,updated_at=now();
 elsif op='project_save' then
  if length(coalesce(btrim(p_input->>'title'),'')) not between 1 and 120 or length(coalesce(p_input->>'description',''))>3000 or length(coalesce(p_input->>'skills',''))>600 or coalesce(p_input->>'visibility','') not in ('private','public') then raise exception using errcode='22023',message='Check project title, description, skills and visibility'; end if;
  if nullif(p_input->>'imageId','') is not null and not exists(select 1 from public.wf_student_portfolio_files where student_id=s and id=(p_input->>'imageId')::uuid and kind='project') then raise exception using errcode='22023',message='Choose your project image'; end if;
  row_id:=coalesce(row_id,gen_random_uuid());
  if exists(select 1 from public.wf_student_portfolio_projects where id=row_id and student_id<>s) then raise exception using errcode='42501',message='Project unavailable'; end if;
  if not exists(select 1 from public.wf_student_portfolio_projects where id=row_id) and (select count(*) from public.wf_student_portfolio_projects where student_id=s)>=30 then raise exception using errcode='22023',message='Maximum 30 projects'; end if;
  insert into public.wf_student_portfolio_projects(id,student_id,title,description,skills,visibility,image_id)
  values(row_id,s,btrim(p_input->>'title'),coalesce(p_input->>'description',''),coalesce(p_input->>'skills',''),p_input->>'visibility',nullif(p_input->>'imageId','')::uuid)
  on conflict(id) do update set title=excluded.title,description=excluded.description,skills=excluded.skills,visibility=excluded.visibility,image_id=excluded.image_id,updated_at=now();
 elsif op='project_delete' then
  delete from public.wf_student_portfolio_projects where id=row_id and student_id=s;
  if not found then raise exception using errcode='42501',message='Project unavailable'; end if;
 elsif op='file_register' then
  path:=s||'/'||row_id::text;
  if row_id is null or p_input->>'storagePath' is distinct from path or not exists(select 1 from storage.objects where bucket_id='student-portfolio' and name=path and (metadata->>'size')::bigint=(p_input->>'size')::bigint and metadata->>'mimetype'=p_input->>'mime') then raise exception using errcode='22023',message='Uploaded file unavailable'; end if;
  if exists(select 1 from public.wf_student_portfolio_files where id=row_id and student_id=s) then return security.student_portfolio_read(s)||jsonb_build_object('studentId',s); end if;
  if (select count(*) from public.wf_student_portfolio_files where student_id=s)>=40 or (select coalesce(sum(size),0) from public.wf_student_portfolio_files where student_id=s)+(p_input->>'size')::bigint>209715200 then raise exception using errcode='22023',message='File limit reached (40 files / 200 MB)'; end if;
  insert into public.wf_student_portfolio_files(id,student_id,title,kind,mime,size,storage_path) values(row_id,s,btrim(p_input->>'title'),p_input->>'kind',p_input->>'mime',(p_input->>'size')::bigint,path);
 elsif op='file_update' then
  update public.wf_student_portfolio_files set title=btrim(p_input->>'title'),access=p_input->>'access' where id=row_id and student_id=s;
  if not found then raise exception using errcode='42501',message='File unavailable'; end if;
 elsif op='file_delete' then
  select * into f from public.wf_student_portfolio_files where id=row_id and student_id=s;
  if not found then raise exception using errcode='42501',message='File unavailable'; end if;
  update public.wf_student_portfolio_projects set image_id=null where image_id=row_id and student_id=s;
  update public.wf_student_portfolio_preferences set photo_id=case when photo_id=row_id then null else photo_id end,cover_id=case when cover_id=row_id then null else cover_id end where student_id=s;
  delete from public.wf_student_portfolio_files where id=row_id and student_id=s;
 else raise exception using errcode='22023',message='Invalid portfolio action';
 end if;
 -- Explicit expansion vocabulary: no text/file contents/private snapshots in the audit.
 after_state:=security.student_portfolio_read(s);
 if before_state is distinct from after_state then
 update public.wf_public_pages set updated_at=clock_timestamp() where entity_type='student' and entity_id=s;
 insert into public.platform_audit_events(actor_auth_user_id,actor_user_id,action,entity_type,entity_id,student_id,source,after_json)
 values((select auth.uid()),u,'STUDENT_PORTFOLIO_CHANGED','student_portfolio',s,s,'student',jsonb_build_object('operation',op,'recordId',row_id));
 end if;
 return after_state||jsonb_build_object('studentId',s);
end;
$$;
revoke all on function security.student_portfolio(jsonb) from public,anon,service_role;
grant execute on function security.student_portfolio(jsonb) to authenticated;
create function public.student_portfolio(p_input jsonb default null) returns jsonb language sql security invoker set search_path='' as $$ select security.student_portfolio(p_input); $$;
revoke all on function public.student_portfolio(jsonb) from public,anon,service_role;
grant execute on function public.student_portfolio(jsonb) to authenticated;

create function public.student_portfolio_public(p_path text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare page jsonb; s text; result jsonb; prefs public.wf_student_portfolio_preferences%rowtype;
begin
 page:=public.student_public_profile_read(p_path);
 if not coalesce((page->>'found')::boolean,false) or coalesce((page->>'redirect')::boolean,false) then return page; end if;
 select entity_id into s from public.wf_public_pages where canonical_path=p_path and entity_type='student';
 result:=security.student_portfolio_read(s,true);
 select * into prefs from public.wf_student_portfolio_preferences where student_id=s;
 return page||jsonb_build_object('portfolio',result||jsonb_build_object('evidence',coalesce((
  select jsonb_agg(e order by e->>'category',e->>'title') from (
   select jsonb_build_object('id',ss.student_skill_id,'title',sc.name,'category','instructor_verified','issuer','Instructor verified','status','verified','date',ss.verified_at,'expiresAt',null,'version',null) e
   from public.wf_student_skills ss join public.wf_skill_catalog sc on sc.skill_id=ss.skill_id where ss.student_id=s and ss.status='verified' and prefs.show_skills
   union all
   select jsonb_build_object('id',a.assignment_id,'title',mc.title,'category','employer_training','issuer',c.business_name,'status','completed','date',a.completed_at,'expiresAt',null,'version',v.version_number)
   from public.wf_micro_cert_assignments a join public.wf_employer_micro_certs mc on mc.micro_cert_id=a.micro_cert_id join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id=a.micro_cert_version_id join public.contractors c on c.contractor_id=mc.employer_id where a.student_id=s and a.status='completed' and prefs.show_training
   union all
   select jsonb_build_object('id',a.company_badge_award_id,'title',b.title,'category','company_badge','issuer',c.business_name,'status',case when a.revoked_at is not null then 'revoked' when a.expires_at<=now() then 'expired' else 'active' end,'date',a.issued_at,'expiresAt',a.expires_at,'version',v.version_number)
   from public.wf_company_badge_awards a join public.wf_company_badges b on b.company_badge_id=a.company_badge_id join public.contractors c on c.contractor_id=a.employer_id left join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id=a.micro_cert_version_id where a.student_id=s and prefs.show_badges
   union all
   select jsonb_build_object('id',a.credential_id,'title',d.title,'category','employer_certification','issuer',c.business_name,'status',case when a.status='revoked' or a.revoked_at is not null then 'revoked' when a.expires_at<=now() then 'expired' else 'active' end,'date',a.issued_at,'expiresAt',a.expires_at,'version',v.version_number)
   from public.wf_employer_certification_awards a join public.wf_employer_certification_definitions d on d.certification_definition_id=a.certification_definition_id join public.contractors c on c.contractor_id=a.employer_id join public.wf_employer_micro_cert_versions v on v.micro_cert_version_id=a.micro_cert_version_id where a.student_id=s and prefs.show_certifications
  ) evidence),'[]'::jsonb)));
end;
$$;
revoke all on function public.student_portfolio_public(text) from public,anon,authenticated;
grant execute on function public.student_portfolio_public(text) to service_role;
-- Service reader needs the private projection but no exposed anonymous RPC grant.
grant execute on function security.student_portfolio_read(text,boolean) to service_role;

create function security.student_portfolio_file(p_id uuid,p_employer text default null,p_hiring_need text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.wf_student_portfolio_files%rowtype; allowed boolean:=false;
begin
 select f1.* into f from public.wf_student_portfolio_files f1 join public.wf_student_profiles s on s.student_id=f1.student_id join public.users u on u.user_id=s.user_id where f1.id=p_id and lower(u.status)='active' and lower(s.profile_status)='active';
 if not found then return null; end if;
 if (select auth.uid()) is not null then
  allowed:=exists(select 1 from public.wf_student_profiles s join public.users u on u.user_id=s.user_id join public.app_role_memberships m on m.auth_user_id=u.auth_user_id where s.student_id=f.student_id and u.auth_user_id=(select auth.uid()) and lower(u.status)='active' and lower(m.status)='active' and lower(m.role)='student' and lower(m.scope_type)='self' and m.scope_id=f.student_id);
 end if;
 if not allowed and f.access='public' then allowed:=exists(select 1 from public.wf_public_pages p where p.entity_type='student' and p.entity_id=f.student_id and p.visibility='public' and p.publication_status='published'); end if;
 if not allowed and f.access='employer' and p_employer is not null and exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') and security.can_browse_employer_talent(p_employer) then
  -- Reuse canonical talent consent/affiliation/hiring-manager scope; never a role-only grant.
  begin
   allowed:=jsonb_array_length(public.employer_talent_search(p_employer,p_hiring_need,jsonb_build_object('studentId',f.student_id)))>0;
  exception when raise_exception then allowed:=false; end;
 end if;
 if not allowed then return null; end if;
 return jsonb_build_object('id',f.id,'title',f.title,'mime',f.mime,'storagePath',f.storage_path,'size',f.size);
end;
$$;
revoke all on function security.student_portfolio_file(uuid,text,text) from public;
grant execute on function security.student_portfolio_file(uuid,text,text) to authenticated;
create function public.student_portfolio_file(p_id uuid,p_employer text default null,p_hiring_need text default null) returns jsonb language sql security invoker set search_path='' as $$ select security.student_portfolio_file(p_id,p_employer,p_hiring_need); $$;
revoke all on function public.student_portfolio_file(uuid,text,text) from public,service_role;
grant execute on function public.student_portfolio_file(uuid,text,text) to authenticated;

-- Anonymous web requests use a service-only PUBLIC-files allowlist, never schema access to security.
create function public.student_portfolio_public_file(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',f.id,'title',f.title,'mime',f.mime,'storagePath',f.storage_path,'size',f.size)
 from public.wf_student_portfolio_files f join public.wf_student_profiles s on s.student_id=f.student_id
 join public.users u on u.user_id=s.user_id join public.wf_public_pages p on p.entity_type='student' and p.entity_id=s.student_id
 where f.id=p_id and f.access='public' and p.visibility='public' and p.publication_status='published' and lower(u.status)='active' and lower(s.profile_status)='active';
$$;
revoke all on function public.student_portfolio_public_file(uuid) from public,anon,authenticated;
grant execute on function public.student_portfolio_public_file(uuid) to service_role;

create function security.student_portfolio_employer_files(p_student text,p_employer text,p_hiring_need text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.users where auth_user_id=(select auth.uid()) and lower(status)='active') or not security.can_browse_employer_talent(p_employer) then raise exception using errcode='42501',message='Employer scope required'; end if;
 if jsonb_array_length(public.employer_talent_search(p_employer,p_hiring_need,jsonb_build_object('studentId',p_student)))=0 then raise exception using errcode='42501',message='Candidate unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'kind',f.kind,'access',f.access,'mime',f.mime,'size',f.size) order by f.created_at desc)
 from public.wf_student_portfolio_files f join public.wf_student_profiles s on s.student_id=f.student_id join public.users u on u.user_id=s.user_id
 where f.student_id=p_student and lower(u.status)='active' and lower(s.profile_status)='active' and (f.access='employer' or (f.access='public' and exists(select 1 from public.wf_public_pages p where p.entity_type='student' and p.entity_id=f.student_id and p.visibility='public' and p.publication_status='published')))),'[]'::jsonb);
end;
$$;
revoke all on function security.student_portfolio_employer_files(text,text,text) from public,anon,service_role;
grant execute on function security.student_portfolio_employer_files(text,text,text) to authenticated;
create function public.student_portfolio_employer_files(p_student text,p_employer text,p_hiring_need text default null) returns jsonb language sql security invoker set search_path='' as $$ select security.student_portfolio_employer_files(p_student,p_employer,p_hiring_need); $$;
revoke all on function public.student_portfolio_employer_files(text,text,text) from public,anon,service_role;
grant execute on function public.student_portfolio_employer_files(text,text,text) to authenticated;
