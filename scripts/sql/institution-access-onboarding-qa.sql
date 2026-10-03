-- Staging-only, authenticated/anonymous/service-role execution; all fixtures roll back.
begin;
create temp table access_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into access_qa_actors select n,gen_random_uuid(),security.new_legacy_id('QA'),
 'qa194-'||n||'-'||gen_random_uuid()||'@example.invalid'
 from unnest(array['super','admin','institution','instructor','analyst','pending','student','spoof','disabled','suspended','unscoped','ambiguous']) n;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
 select auth_id,email,now(),'authenticated','authenticated','{}',
 case when name='spoof' then '{"role":"super_admin","scope_type":"platform"}'::jsonb else '{}'::jsonb end from access_qa_actors;
update access_qa_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
 select user_id,auth_id,email,'QA',name,'active' from access_qa_actors a where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
update public.users set status='disabled' where auth_user_id=(select auth_id from access_qa_actors where name='disabled');
insert into public.wf_institutions(institution_id,name,city,state,active) values('QA194-A','QA194 A','A','TX',true),('QA194-B','QA194 B','B','TX',true),('QA194-OFF','QA194 inactive','C','TX',false);
insert into public.wf_cohorts(cohort_id,institution_id,name,program_name) values('QA194-CA','QA194-A','QA cohort A','QA194 Shared'),('QA194-CB','QA194-B','QA cohort B','QA194 Shared');
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'qa194:'||name,auth_id,user_id,r,s,si,case when name='pending' then 'pending' when name='suspended' then 'suspended' else 'active' end,'qa194'
 from access_qa_actors join (values
 ('super','super_admin','platform',null),('admin','admin','platform',null),('institution','institution_admin','institution','QA194-A'),
 ('instructor','instructor','cohort','QA194-CA'),('analyst','read_only_analyst','institution','QA194-A'),('pending','instructor','cohort','QA194-CA'),
 ('student','student','platform',null),('disabled','super_admin','platform',null),('suspended','super_admin','platform',null),
 ('unscoped','super_admin','institution','QA194-A'),('ambiguous','instructor','program','QA194 Shared')) v(name,r,s,si) using(name);
create temp table access_qa_checks(label text);
create temp table access_qa_baseline as select
 (select count(*) from auth.users) auth_count,(select count(*) from public.users) user_count,
 (select jsonb_agg(to_jsonb(r) order by id) from public.app_role_memberships r) memberships,
 (select count(*) from public.wf_instructor_seats) seats,
 (select count(*) from public.wf_role_memberships) workforce_memberships,
 (select count(*) from public.wf_institutions) institution_count;
grant select on access_qa_actors to authenticated;
grant select,insert on access_qa_checks to authenticated,anon,service_role;
create function pg_temp.actor(p_name text) returns void language plpgsql as $$ declare v uuid;
 begin select auth_id into v from access_qa_actors where name=p_name;
 perform set_config('request.jwt.claim.sub',coalesce(v::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true); end; $$;
create function pg_temp.check_true(v boolean,label text) returns void language plpgsql as $$
 begin if v is distinct from true then raise exception 'QA failed: %',label; end if; insert into access_qa_checks values(label); end; $$;
create function pg_temp.denied(query text,expected_state text,label text) returns void language plpgsql as $$ declare rejected boolean:=false;
 begin begin execute query; exception when others then if sqlstate=expected_state then rejected:=true; else raise; end if; end;
 perform pg_temp.check_true(rejected,label); end; $$;
set local role authenticated;
do $$ declare d jsonb; a text; k uuid:=gen_random_uuid(); i text; begin
 perform pg_temp.actor('institution'); d:=public.onboarding_institutions_directory();
 perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(d) x where x->>'name'='Texarkana College'),'existing TC available');
 perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(d) x where x->>'institution_id'='QA194-OFF'),'inactive hidden');
 perform pg_temp.check_true((select (x->>'authorized')::boolean from jsonb_array_elements(d) x where x->>'institution_id'='QA194-A'),'approved Institution shown');
 perform pg_temp.check_true(not (select (x->>'authorized')::boolean from jsonb_array_elements(d) x where x->>'institution_id'='QA194-B'),'other Institution unapproved');
 perform pg_temp.check_true(not (d->0 ? 'bridge_source_key') and not (d->0 ? 'email'),'safe directory fields');
 foreach a in array array['admin','institution','instructor','analyst','pending','student','spoof','disabled','suspended','unscoped','ambiguous'] loop
   perform pg_temp.actor(a);
   perform pg_temp.denied('select public.platform_institutions_list()','42501',a||' cannot list internal institutions');
   perform pg_temp.denied('select public.platform_access_requests_list()','42501',a||' cannot read request PII');
   perform pg_temp.denied('select public.platform_institution_create(gen_random_uuid(),''forbidden'',''other'')','42501',a||' cannot create institution');
 end loop;
 perform pg_temp.actor('super');
 d:=public.platform_institution_create(k,'QA194 Created','community_college','Test City','TX'); i:=d->>'institutionId';
 perform pg_temp.check_true((d->>'created')::boolean and i is not null,'Super Admin creates');
 d:=public.platform_institution_create(k,'QA194 Created','community_college','Test City','TX');
 perform pg_temp.check_true(not (d->>'created')::boolean and d->>'institutionId'=i,'create retry idempotent');
 perform pg_temp.denied(format('select public.platform_institution_create(%L,''changed'',''other'')',k),'P0001','request key payload conflict denied');
 perform pg_temp.denied('select public.platform_institution_create(gen_random_uuid(),''qa194 created'',''technical_college'',''test city'',''tx'')','P0001','duplicate name location blocked');
 perform pg_temp.denied('select public.platform_institution_create(gen_random_uuid(),'''',''other'')','P0001','blank name denied');
 perform pg_temp.denied('select public.platform_institution_create(gen_random_uuid(),''invalid'',''invalid'')','P0001','invalid type denied');
 perform pg_temp.check_true(jsonb_array_length(public.platform_institutions_list())>0,'Super Admin lists');
 foreach a in array array['institution','instructor','analyst','pending'] loop
   perform pg_temp.actor(a);
   perform pg_temp.denied('select public.save_educator_onboarding(''{"firstName":"QA","lastName":"Person","institutionId":"QA194-B"}'',4,true)','42501',a||' cannot onboard into other Institution');
   perform pg_temp.denied('select public.save_educator_onboarding(''{"firstName":"QA","lastName":"Person"}'',3,false)','P0001',a||' cannot skip Institution');
   d:=public.save_educator_onboarding('{"firstName":"QA","lastName":"Person","institutionId":"QA194-A","role":"super_admin"}',4,true);
   perform pg_temp.check_true(d->>'status'=case when a='pending' then 'pending_review' else 'complete' end,a||' preserves approval state');
   perform pg_temp.check_true(d->>'redirectTo'=case when a='pending' then '/onboarding?pending=1' else '/institution' end,a||' correct redirect');
   d:=public.save_educator_onboarding('{"institutionId":"QA194-A"}',4,true);
   perform pg_temp.check_true(d->>'status'=case when a='pending' then 'pending_review' else 'complete' end,a||' onboarding retry');
 end loop;
 foreach a in array array['super','student','spoof','disabled','suspended','unscoped','ambiguous'] loop
   perform pg_temp.actor(a);
   perform pg_temp.denied('select public.save_educator_onboarding(''{"firstName":"QA","lastName":"Person","institutionId":"QA194-A"}'',4,true)','42501',a||' cannot self provision educator');
 end loop;
 perform pg_temp.actor('student');
 perform pg_temp.denied('select public.marketing_access_request(''QA'',''qa194@example.invalid'',''student'',''access'')','42501','authenticated intake RPC denied');
 perform pg_temp.denied('select * from public.wf_access_requests','42501','authenticated direct intake read denied');
 perform pg_temp.denied('select * from public.wf_institution_creation_receipts','42501','receipt inaccessible');
 perform pg_temp.denied('select * from public.wf_institutions','42501','broad institution read remains denied');
end; $$;
reset role;
-- Existing owner test account can finish without persisting test contact data.
select set_config('request.jwt.claim.sub','714e2eb7-2141-42c8-b35b-d2cd47611131',true);
set local role authenticated;
select pg_temp.check_true((public.save_educator_onboarding('{"firstName":"QA","lastName":"Person","institutionId":"INS-STG-TC"}',4,true)->>'status')='complete','owner test Institution Admin completes');
reset role;
select pg_temp.check_true((select jsonb_agg(to_jsonb(r) order by id) from public.app_role_memberships r)=(select memberships from access_qa_baseline),'all roles scopes and statuses unchanged');
select pg_temp.check_true((select count(*) from public.wf_instructor_seats)=(select seats from access_qa_baseline),'no Instructor seats added');
select pg_temp.check_true((select count(*) from public.wf_role_memberships)=(select workforce_memberships from access_qa_baseline),'no workforce roles added');
select pg_temp.check_true((select count(*) from public.platform_audit_events where action='workforce.institution.created' and entity_id in (select institution_id from public.wf_institutions where name='QA194 Created'))=1,'institution audit exactly once');
select pg_temp.check_true((select count(*) from public.platform_audit_events where action='workforce.onboarding.completed' and actor_user_id in (select user_id from access_qa_actors))=4,'onboarding audit once per transition');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.denied('select public.onboarding_institutions_directory()','42501','anon directory denied');
select pg_temp.denied('select public.platform_institution_create(gen_random_uuid(),''no'',''other'')','42501','anon institution denied');
select pg_temp.denied('select public.save_educator_onboarding(''{}'')','42501','anon onboarding denied');
select pg_temp.denied('select public.marketing_access_request(''QA'',''qa194@example.invalid'',''student'',''access'')','42501','anon direct intake RPC denied');
select pg_temp.denied('insert into public.wf_access_requests(contact_name,email,requested_role,intent) values(''QA'',''qa194@example.invalid'',''student'',''access'')','42501','anon intake table write denied');
reset role;
set local role service_role;
select public.marketing_access_request('QA','qa194-intake@example.invalid','student','access');
select public.marketing_access_request('QA','QA194-INTAKE@EXAMPLE.INVALID','employer','demo');
select pg_temp.denied('select public.marketing_access_request(''QA'',''not-email'',''student'',''access'')','P0001','invalid intake denied');
select pg_temp.denied('select public.marketing_access_request(''QA'',''qa194-other@example.invalid'',''super_admin'',''access'')','P0001','admin intake role denied');
reset role;
select pg_temp.check_true((select count(*) from public.wf_access_requests where email='qa194-intake@example.invalid')=1,'intake cooldown normalized retry');
select pg_temp.check_true((select count(*) from auth.users)=(select auth_count from access_qa_baseline),'intake no Auth identity');
select pg_temp.check_true((select count(*) from public.users)=(select user_count from access_qa_baseline),'intake no user account');
select pg_temp.check_true((select count(*) from public.wf_institutions)=(select institution_count+1 from access_qa_baseline),'intake no institution');
select pg_temp.actor('super');
set local role authenticated;
select pg_temp.check_true(exists(select 1 from jsonb_array_elements(public.platform_access_requests_list()) r where r->>'email'='qa194-intake@example.invalid'),'Super Admin reviews intake');
reset role;
select count(*) as passed_checks from access_qa_checks;
rollback;
