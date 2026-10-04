-- Staging-only, synthetic identities, transaction rolled back. Run after migration.
begin;
create temp table pl_actors(name text, auth_id uuid, user_id text, email text);
insert into pl_actors select n,gen_random_uuid(),security.new_legacy_id('QA'),'public-learning-'||n||'-'||gen_random_uuid()||'@example.invalid'
from unnest(array['owner','admin','super','recruiter','readonly','wrong','disabled','spoof']) n;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,email,now(),'authenticated','authenticated','{}',case when name='spoof' then '{"role":"super_admin"}'::jsonb else '{}'::jsonb end from pl_actors;
update pl_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
select user_id,auth_id,email,'Synthetic',name,'active' from pl_actors a where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
update public.users set status='disabled' where user_id=(select user_id from pl_actors where name='disabled');
insert into public.contractors(contractor_id,business_name,approval_status,account_status) values('PL-E','Synthetic Public Employer','approved','active'),('PL-OTHER','Other Employer','approved','active');
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
select 'pl:'||name,auth_id,user_id,r,sc,si,'active','public-learning-qa' from pl_actors join (values
 ('owner','employer_owner','employer','PL-E'),('admin','employer_admin','employer','PL-E'),('super','super_admin','platform',null),
 ('recruiter','recruiter','employer','PL-E'),('readonly','employer_read_only','employer','PL-E'),('wrong','employer_admin','employer','PL-OTHER'),('disabled','employer_owner','employer','PL-E')) v(name,r,sc,si) using(name);
insert into public.wf_employer_micro_certs(micro_cert_id,employer_id,title,description) values('PL-C','PL-E','Synthetic Course','Public summary');
insert into public.wf_employer_micro_cert_versions(micro_cert_version_id,micro_cert_id,version_number,status,learning_objective,passing_requirement)
values('PL-V','PL-C',1,'live','Public objective','{"PRIVATE_REQUIREMENT":"SECRET"}');
update public.wf_employer_micro_certs set current_version_id='PL-V' where micro_cert_id='PL-C';
insert into public.wf_employer_micro_cert_lessons(lesson_id,micro_cert_version_id,sequence_no,title,status) values('PL-L','PL-V',1,'Synthetic Lesson','published'),('PL-DRAFT','PL-V',2,'Draft Lesson','draft');
insert into public.wf_employer_micro_cert_lesson_blocks(lesson_id,sequence_no,block_type,content) values
 ('PL-L',1,'text','{"text":"Public text","answerKey":"SECRET","privateNotes":"SECRET"}'),
 ('PL-L',2,'video','{"url":"https://example.com/private?token=SECRET"}');
create temp table pl_checks(label text);
create function pg_temp.pl_check(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'QA FAIL: %',label; end if; insert into pl_checks values(label); end $$;
create function pg_temp.pl_actor(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub',(select auth_id::text from pl_actors where name=n),true); $$;
create function pg_temp.pl_denied(q text,label text) returns void language plpgsql as $$ begin execute q; raise exception 'QA FAIL: allowed %',label; exception when others then if sqlerrm like 'QA FAIL:%' then raise; end if; insert into pl_checks values(label); end $$;
do $$ declare a text; settings jsonb; public_result jsonb; body jsonb; events_before int; path text:='/employers/pl-employer/courses/course'; begin
  perform pg_temp.pl_check(not has_function_privilege('anon','public.employer_learning_public_read(text)','execute'),'anon cannot invoke privileged read');
  perform pg_temp.pl_check(not has_function_privilege('authenticated','public.employer_learning_public_read(text)','execute'),'authenticated cannot invoke privileged read');
  perform pg_temp.pl_check(not has_function_privilege('anon','public.employer_learning_public_settings(text,jsonb)','execute'),'anon cannot publish');
  perform pg_temp.pl_check(not has_table_privilege('anon','public.wf_public_pages','SELECT'),'anon cannot read registry');
  perform pg_temp.pl_check(not has_table_privilege('authenticated','public.wf_public_pages','UPDATE'),'authenticated cannot bypass publication');
  foreach a in array array['owner','admin','super'] loop
    perform pg_temp.pl_actor(a);
    perform public.employer_learning_public_settings('PL-C');
    perform pg_temp.pl_check(true,a||' authorized settings');
  end loop;
  foreach a in array array['recruiter','readonly','wrong','disabled','spoof'] loop
    perform pg_temp.pl_actor(a);
    perform pg_temp.pl_denied('select public.employer_learning_public_settings(''PL-C'',''{}'')',a||' publish denied');
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.pl_denied('select public.employer_learning_public_settings(''PL-C'')','missing session denied');
  perform pg_temp.pl_actor('owner');
  body:='{"employerSlug":"pl-employer","publishEmployerPage":true,"courseSlug":"course","expectedCurrentVersionId":"PL-V","visibility":"public","publicationStatus":"published","robotsIndex":true,"lessons":[{"lessonId":"PL-L","slug":"lesson","visibility":"public","publicationStatus":"published","robotsIndex":true}]}';
  perform pg_temp.pl_denied(format('select public.employer_learning_public_settings(''PL-C'',%L::jsonb)',(body||'{"publishEmployerPage":false}'::jsonb)::text),'Employer publication needs explicit consent');
  perform public.employer_learning_public_settings('PL-C',body);
  public_result:=public.employer_learning_public_read(path);
  perform pg_temp.pl_check((public_result->>'found')::boolean,'live public course visible');
  perform pg_temp.pl_check(public_result->>'kind'='course','course canonical kind');
  perform pg_temp.pl_check(jsonb_array_length(public_result->'lessons')=1,'published lessons only');
  perform pg_temp.pl_check(public_result::text not like '%SECRET%','course excludes private config');
  public_result:=public.employer_learning_public_read(path||'/lessons/lesson');
  perform pg_temp.pl_check((public_result->>'found')::boolean,'published lesson visible');
  perform pg_temp.pl_check(jsonb_array_length(public_result->'blocks')=1,'private media omitted');
  perform pg_temp.pl_check(public_result::text not like '%SECRET%','arbitrary content keys excluded');
  perform pg_temp.pl_check((select count(*)=2 from jsonb_array_elements(public.employer_learning_public_sitemap()) x where x->>'path' like '/employers/pl-employer/%'),'indexable sitemap includes course and lesson');
  select count(*) into events_before from public.wf_domain_events where employer_id='PL-E';
  perform public.employer_learning_public_settings('PL-C',body);
  perform pg_temp.pl_check((select count(*)=events_before from public.wf_domain_events where employer_id='PL-E'),'repeated save has no duplicate event');
  perform pg_temp.pl_denied(format('select public.employer_learning_public_settings(''PL-C'',%L::jsonb)',(body||'{"expectedCurrentVersionId":"STALE"}'::jsonb)::text),'stale version rejected');
  perform pg_temp.pl_denied(format('select public.employer_learning_public_settings(''PL-C'',%L::jsonb)',(body||'{"courseSlug":"bad/slug"}'::jsonb)::text),'unsafe slug rejected');
  perform pg_temp.pl_denied(format('select public.employer_learning_public_settings(''PL-C'',%L::jsonb)',(body||'{"lessons":[{"lessonId":"PL-DRAFT","slug":"draft","visibility":"public","publicationStatus":"published"}]}'::jsonb)::text),'draft lesson publication rejected');
  perform pg_temp.pl_denied(format('select public.employer_learning_public_settings(''PL-C'',%L::jsonb)',(body||'{"lessons":[{"lessonId":"OTHER-LESSON","slug":"other"}]}'::jsonb)::text),'cross-course lesson rejected');
  perform public.employer_learning_public_settings('PL-C',body||'{"courseSlug":"renamed","lessons":[]}'::jsonb);
  perform pg_temp.pl_check(public.employer_learning_public_read(path)->>'redirectPath'='/employers/pl-employer/courses/renamed','course permanent alias');
  perform pg_temp.pl_check(public.employer_learning_public_read(path||'/lessons/lesson')->>'redirectPath'='/employers/pl-employer/courses/renamed/lessons/lesson','child alias follows course rename');
  perform pg_temp.pl_check((select count(*)=2 from public.wf_public_page_redirects where from_path like path||'%' and status_code=308 and active),'permanent 308 ledger');
  perform public.employer_learning_public_settings('PL-C',body);
  perform pg_temp.pl_check(public.employer_learning_public_read('/employers/pl-employer/courses/renamed')->>'redirectPath'=path,'slug reversion aliases latest');
  perform pg_temp.pl_check(public.employer_learning_public_read(path)->>'redirectPath' is null,'slug reversion no loop');
  update public.wf_public_pages set robots_index=false where entity_type='course' and entity_id='PL-C';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path)->>'robotsIndex')::boolean,'noindex metadata');
  perform pg_temp.pl_check((select count(*)=0 from jsonb_array_elements(public.employer_learning_public_sitemap()) x where x->>'path' like '/employers/pl-employer/%'),'noindex removed from sitemap');
  update public.wf_public_pages set robots_index=true,visibility='private' where entity_type='course' and entity_id='PL-C';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path)->>'found')::boolean,'private course hidden');
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path||'/lessons/lesson')->>'found')::boolean,'private parent hides lesson');
  perform pg_temp.pl_check(not (public.employer_learning_public_read('/employers/pl-employer/courses/renamed')->>'found')::boolean,'private alias hidden');
  update public.wf_public_pages set visibility='public',publication_status='unpublished' where entity_type='course' and entity_id='PL-C';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path)->>'found')::boolean,'unpublished course hidden');
  update public.wf_public_pages set publication_status='published' where entity_type='course' and entity_id='PL-C';
  update public.wf_employer_micro_cert_versions set status='draft' where micro_cert_version_id='PL-V';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path)->>'found')::boolean,'nonlive version hidden');
  update public.wf_employer_micro_cert_versions set status='live' where micro_cert_version_id='PL-V';
  update public.wf_employer_micro_cert_lessons set status='archived' where lesson_id='PL-L';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path||'/lessons/lesson')->>'found')::boolean,'archived lesson hidden');
  update public.contractors set approval_status='suspended' where contractor_id='PL-E';
  perform pg_temp.pl_check(not (public.employer_learning_public_read(path)->>'found')::boolean,'suspended employer hidden');
  perform pg_temp.pl_check(not (public.employer_learning_public_read('/employers/pl-employer')->>'found')::boolean,'suspended employer parent hidden');
  perform pg_temp.pl_check(not (public.employer_learning_public_read('/employers/pl-employer/courses/missing')->>'found')::boolean,'unknown URL unavailable');
  perform pg_temp.pl_check((select count(*)>0 from public.wf_domain_events where employer_id='PL-E' and event_type='EMPLOYER_LEARNING_PUBLICATION_CHANGED'),'canonical events emitted');
end $$;
update public.contractors set approval_status='approved' where contractor_id='PL-E';
grant insert on pl_checks to authenticated;
set local role authenticated;
select pg_temp.pl_check(public.employer_learning_public_settings('PL-C')->'course' is not null,'authenticated wrapper executes private guarded function');
reset role;
select count(*) as checks_passed from pl_checks;
rollback;
