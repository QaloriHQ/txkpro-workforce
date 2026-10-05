-- Additive layout preferences; ownership, safe projection and grants remain unchanged.
alter table public.wf_student_portfolio_preferences
 add column layout text not null default 'comfortable' check(layout in ('comfortable','compact')),
 add column panel_order text[] not null default array['credentials','projects','files']::text[]
 check(cardinality(panel_order)=3 and panel_order @> array['credentials','projects','files']::text[] and panel_order <@ array['credentials','projects','files']::text[]);
create or replace function security.student_portfolio_read(p_student text,p_public boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'preferences',jsonb_build_object('layout',coalesce(pr.layout,'comfortable'),'panelOrder',to_jsonb(coalesce(pr.panel_order,array['credentials','projects','files']::text[])),'showSkills',coalesce(pr.show_skills,false),'showTraining',coalesce(pr.show_training,false),
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
create or replace function security.student_portfolio(p_input jsonb default null) returns jsonb
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
 if op='layout' then
  if jsonb_typeof(p_input->'panelOrder') is distinct from 'array' or jsonb_array_length(p_input->'panelOrder')<>3 or coalesce(p_input->>'layout','') not in ('comfortable','compact') then raise exception using errcode='22023',message='Choose a valid profile layout'; end if;
  if (select count(distinct v) from jsonb_array_elements_text(p_input->'panelOrder') v where v in ('credentials','projects','files'))<>3 then raise exception using errcode='22023',message='Choose each profile panel once'; end if;
  insert into public.wf_student_portfolio_preferences(student_id,layout,panel_order)
  values(s,p_input->>'layout',array(select jsonb_array_elements_text(p_input->'panelOrder')))
  on conflict(student_id) do update set layout=excluded.layout,panel_order=excluded.panel_order,updated_at=now();
 elsif op='preferences' then
  -- Preserve existing defaults; full preferences object is required, no arbitrary JSON persisted.
  if (p_input->>'rankingScope') is null or p_input->>'rankingScope' not in ('cohort','institution','txkpro') then raise exception using errcode='22023',message='Choose a ranking scope'; end if;
  if nullif(p_input->>'photoId','') is not null and not exists(select 1 from public.wf_student_portfolio_files where id=(p_input->>'photoId')::uuid and student_id=s and kind='photo') then raise exception using errcode='22023',message='Choose your profile photo'; end if;
  if nullif(p_input->>'coverId','') is not null and not exists(select 1 from public.wf_student_portfolio_files where id=(p_input->>'coverId')::uuid and student_id=s and kind='cover') then raise exception using errcode='22023',message='Choose your cover image'; end if;
  insert into public.wf_student_portfolio_preferences(student_id,show_skills,show_training,show_badges,show_certifications,show_progress,ranking_scope,photo_id,cover_id)
  values(s,coalesce((p_input->>'showSkills')::boolean,false),coalesce((p_input->>'showTraining')::boolean,false),coalesce((p_input->>'showBadges')::boolean,false),coalesce((p_input->>'showCertifications')::boolean,false),coalesce((p_input->>'showProgress')::boolean,false),p_input->>'rankingScope',nullif(p_input->>'photoId','')::uuid,nullif(p_input->>'coverId','')::uuid)
  on conflict(student_id) do update set show_skills=excluded.show_skills,show_training=excluded.show_training,show_badges=excluded.show_badges,show_certifications=excluded.show_certifications,show_progress=excluded.show_progress,ranking_scope=excluded.ranking_scope,photo_id=excluded.photo_id,cover_id=excluded.cover_id,updated_at=now();
 elsif op='project_save' then
  if (select count(*) from regexp_split_to_table(coalesce(p_input->>'skills',''),',') tag where btrim(tag)<>'')>3 or exists(select 1 from regexp_split_to_table(coalesce(p_input->>'skills',''),',') tag where length(btrim(tag))>60) then raise exception using errcode='22023',message='Use up to three skills, 60 characters each'; end if;
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
