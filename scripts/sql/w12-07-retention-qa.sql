-- Staging only: synthetic fixtures, real authenticated role, complete rollback.
begin;
create temp table retention_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into retention_qa_actors select name,gen_random_uuid(),security.new_legacy_id('QA'),
 'qa40-'||name||'-'||gen_random_uuid()||'@example.invalid'
 from unnest(array['platform','admin','career','coordinator','instructor','assistant','department','analyst',
 'other_admin','employer','student','inactive','disabled','spoof','unscoped_admin','stitched','ambiguous']) name;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
 select auth_id,email,now(),'authenticated','authenticated','{}',
 case when name='spoof' then '{"role":"super_admin","scope_type":"platform"}'::jsonb else '{}'::jsonb end from retention_qa_actors;
update retention_qa_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
 select user_id,auth_id,email,'QA',name,'active' from retention_qa_actors a
 where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
update public.users set status='disabled' where user_id=(select user_id from retention_qa_actors where name='disabled');
insert into public.wf_institutions(institution_id,name,active) values('QA40-A','QA A',true),('QA40-B','QA B',true);
insert into public.wf_cohorts(cohort_id,institution_id,name,program_name) values
 ('QA40-CA','QA40-A','QA Cohort A','QA40-Program A'),('QA40-CAS','QA40-A','QA Cohort sibling','QA40-Program sibling'),
 ('QA40-CB','QA40-B','QA Cohort B','QA40-Program B'),
 ('QA40-AMB-A','QA40-A','Ambiguous A','QA40-Shared'),('QA40-AMB-B','QA40-B','Ambiguous B','QA40-Shared');
insert into public.contractors(contractor_id,business_name) values('QA40-E','QA40 Employer');
insert into public.wf_student_profiles(student_id,user_id,school_id,cohort_id,profile_status)
 select 'QA40-S'||suffix,user_id,inst,cohort,'active' from retention_qa_actors
 cross join (values ('A','QA40-A','QA40-CA'),('AS','QA40-A','QA40-CAS'),('B','QA40-B','QA40-CB')) v(suffix,inst,cohort) where name='student';
insert into public.wf_placements(placement_id,student_id,employer_id,role_title,hire_date,status)
 select 'QA40-P'||suffix,'QA40-S'||suffix,'QA40-E','QA40 Support fixture',current_date-30,'active'
 from unnest(array['A','AS','B']) suffix;
insert into public.wf_retention_milestones(milestone_id,placement_id,day_number,scheduled_for,status)
 select 'QA40-M'||suffix,'QA40-P'||suffix,30,now(),'responded' from unnest(array['A','AS','B']) suffix;
insert into public.wf_retention_messages(message_id,milestone_id,recipient_user_id,provider_message_id,delivery_status)
 select 'QA40-MSG'||suffix,'QA40-M'||suffix,user_id,'QA40-out-'||suffix,'sent'
 from retention_qa_actors cross join unnest(array['A','AS','B']) suffix where name='student';
insert into public.wf_retention_responses(response_id,milestone_id,message_id,recipient_user_id,provider_message_id,sender_phone,raw_response,normalized_score,normalized_state)
 select 'QA40-R'||suffix,'QA40-M'||suffix,'QA40-MSG'||suffix,user_id,'QA40-in-'||suffix,'+15555550140','PRIVATE_RAW_QA40',3,'needs_help'
 from retention_qa_actors cross join unnest(array['A','AS','B']) suffix where name='student';
insert into public.wf_retention_cases(case_id,placement_id,milestone_id,source_response_id)
 select 'QA40-C'||suffix,'QA40-P'||suffix,'QA40-M'||suffix,'QA40-R'||suffix from unnest(array['A','AS','B']) suffix;
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'qa40:'||name,auth_id,user_id,role,scope,scope_id,case when name='inactive' then 'pending' else 'active' end,'qa40'
 from retention_qa_actors join (values
 ('platform','admin','platform',null),('admin','institution_admin','institution','QA40-A'),
 ('career','career_services','institution','QA40-A'),('coordinator','program_coordinator','program','QA40-Program A'),
 ('instructor','instructor','cohort','QA40-CA'),('assistant','assistant_instructor','cohort','QA40-CA'),
 ('department','department_head','institution','QA40-A'),('analyst','read_only_analyst','institution','QA40-A'),
 ('other_admin','institution_admin','institution','QA40-B'),('employer','employer_admin','employer','QA40-E'),
 ('student','student','self','QA40-SA'),('inactive','instructor','cohort','QA40-CA'),('disabled','institution_admin','institution','QA40-A'),
 ('unscoped_admin','admin','cohort','QA40-CB'),('stitched','instructor','cohort','QA40-CB'),
 ('ambiguous','program_coordinator','program','QA40-Shared')) v(name,role,scope,scope_id) using(name);
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'qa40:stitched-read',auth_id,user_id,'read_only_analyst','institution','QA40-A','active','qa40'
 from retention_qa_actors where name='stitched';
create temp table retention_qa_checks(label text);
create temp table retention_qa_baseline as select
 (select count(*) from public.wf_notifications) notifications,
 (select count(*) from public.wf_student_skills) skills,
 (select jsonb_agg(to_jsonb(p) order by placement_id) from public.wf_placements p) placements;
grant select on retention_qa_actors to authenticated;
grant insert,select on retention_qa_checks to authenticated;
create function pg_temp.actor(p_name text) returns void language plpgsql as $$
 declare v uuid; begin select auth_id into v from retention_qa_actors where name=p_name;
 perform set_config('request.jwt.claim.sub',coalesce(v::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true); end; $$;
create function pg_temp.check_true(v boolean,label text) returns void language plpgsql as $$
 begin if v is distinct from true then raise exception 'QA failed: %',label; end if;
 insert into retention_qa_checks values(label); end; $$;
create function pg_temp.denied(query text,expected_state text,label text) returns void language plpgsql as $$
 declare rejected boolean:=false; begin begin execute query;
 exception when others then if sqlstate=expected_state then rejected:=true; else raise; end if; end;
 perform pg_temp.check_true(rejected,label); end; $$;
set local role authenticated;
do $$ declare actor text; d jsonb; begin
 foreach actor in array array['platform','admin','career','coordinator','instructor','assistant'] loop
   perform pg_temp.actor(actor); d:=public.retention_case_detail('QA40-CA');
   perform pg_temp.check_true((d->>'canManage')::boolean,actor||' management permitted');
 end loop;
 foreach actor in array array['department','analyst','stitched'] loop
   perform pg_temp.actor(actor); d:=public.retention_case_detail('QA40-CA');
   perform pg_temp.check_true(not (d->>'canManage')::boolean,actor||' read-only');
   perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),''{"note":"forbidden"}'')','42501',actor||' mutation denied');
 end loop;
 foreach actor in array array['other_admin','employer','student','inactive','disabled','spoof','unscoped_admin','ambiguous'] loop
   perform pg_temp.actor(actor);
   perform pg_temp.denied('select public.retention_case_detail(''QA40-CA'')','42501',actor||' detail denied');
   perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),''{"note":"forbidden"}'')','42501',actor||' mutation denied');
 end loop;
 foreach actor in array array['coordinator','instructor','assistant'] loop
   perform pg_temp.actor(actor);
   perform pg_temp.denied('select public.retention_case_detail(''QA40-CAS'')','42501',actor||' sibling scope denied');
   perform pg_temp.denied('select public.retention_case_detail(''QA40-CB'')','42501',actor||' cross Institution denied');
 end loop;
 perform pg_temp.actor('admin');
 d:=public.retention_cases_list('QA40-A',null,null,'QA40',0,1);
 perform pg_temp.check_true((d->>'total')::integer=2 and jsonb_array_length(d->'items')=1,'scoped pagination');
 perform pg_temp.check_true(not (d#>'{items,0}' ? 'notes'),'queue excludes notes');
 perform pg_temp.check_true(d::text not like '%PRIVATE_RAW_QA40%' and d::text not like '%provider%','queue excludes raw/provider data');
 perform pg_temp.denied('select public.retention_cases_list(''QA40-B'')','42501','cross Institution queue denied');
 perform pg_temp.actor('platform');
 perform pg_temp.check_true((public.retention_case_detail('QA40-CB')->>'canManage')::boolean,'platform manages other Institution');
end; $$;
select pg_temp.actor('admin');
do $$ declare owner text; d jsonb; k uuid:=gen_random_uuid(); body jsonb; begin
 select user_id into owner from retention_qa_actors where name='instructor';
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),''{"status":"resolved","note":"no","resolutionCode":"no"}'')','22023','skipped lifecycle denied');
 perform pg_temp.denied(format('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),%L)',jsonb_build_object('ownerUserId',(select user_id from retention_qa_actors where name='other_admin'))),'22023','cross scope owner denied');
 perform pg_temp.denied(format('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),%L)',jsonb_build_object('ownerUserId',(select user_id from retention_qa_actors where name='inactive'))),'22023','inactive owner denied');
 body:=jsonb_build_object('ownerUserId',owner,'note','PRIVATE_NOTE_QA40');
 d:=public.retention_case_update('QA40-CA',0,k,body);
 perform pg_temp.check_true(d->>'status'='assigned' and d->>'version'='1','assignment moves open to assigned');
 perform pg_temp.check_true(jsonb_array_length(d->'notes')=1,'note saved with assignment');
 d:=public.retention_case_update('QA40-CA',0,k,body);
 perform pg_temp.check_true(d->>'version'='1' and jsonb_array_length(d->'notes')=1,'identical replay does not duplicate');
 perform pg_temp.denied(format('select public.retention_case_update(''QA40-CA'',0,%L,''{"note":"changed"}'')',k),'22023','request key mismatch denied');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',0,gen_random_uuid(),''{"note":"stale"}'')','40001','stale version denied');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',1,gen_random_uuid(),''{"status":"contacted"}'')','22023','contact needs outcome note');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',1,gen_random_uuid(),''{"note":"","severity":"urgent"}'')','22023','unsupported fields denied');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',1,gen_random_uuid(),''{"nextFollowUpAt":"infinity"}'')','22023','infinite follow-up denied');
 d:=public.retention_case_update('QA40-CA',1,gen_random_uuid(),'{"status":"contacted","note":"Contact outcome"}');
 perform pg_temp.check_true(d->>'status'='contacted' and d->>'contactedAt' is not null,'contact recorded');
 d:=public.retention_case_update('QA40-CA',2,gen_random_uuid(),jsonb_build_object('status','monitoring','nextFollowUpAt',now()+interval '2 days'));
 perform pg_temp.check_true(d->>'status'='monitoring' and d->>'nextFollowUpAt' is not null,'monitoring scheduled');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',3,gen_random_uuid(),''{"status":"resolved"}'')','22023','closure needs evidence');
 k:=gen_random_uuid(); body:='{"status":"resolved","resolutionCode":"support_complete","note":"Closure evidence"}';
 d:=public.retention_case_update('QA40-CA',3,k,body);
 perform pg_temp.check_true(d->>'status'='resolved' and d->>'resolvedAt' is not null and d->>'closedAt' is not null and d->>'nextFollowUpAt' is null,'resolved clears follow-up');
 d:=public.retention_case_update('QA40-CA',3,k,body);
 perform pg_temp.check_true(d->>'version'='4' and jsonb_array_length(d->'notes')=3,'closed resolution replay safe');
 perform pg_temp.denied('select public.retention_case_update(''QA40-CA'',4,gen_random_uuid(),''{"status":"open"}'')','22023','terminal reopening denied');
 perform pg_temp.actor('other_admin');
 perform pg_temp.denied(format('select public.retention_case_update(''QA40-CA'',3,%L,%L)',k,body),'42501','receipt does not bypass tenant access');
end; $$;
-- Additional canonical terminal paths.
select pg_temp.actor('admin');
do $$ declare owner text; d jsonb; begin
 select user_id into owner from retention_qa_actors where name='admin';
 d:=public.retention_case_update('QA40-CAS',0,gen_random_uuid(),jsonb_build_object('ownerUserId',owner));
 d:=public.retention_case_update('QA40-CAS',1,gen_random_uuid(),'{"status":"closed_no_response","resolutionCode":"no_response","note":"Contact attempts unanswered"}');
 perform pg_temp.check_true(d->>'status'='closed_no_response' and d->>'closedAt' is not null,'no-response closure');
 perform pg_temp.actor('other_admin');
 d:=public.retention_case_update('QA40-CB',0,gen_random_uuid(),'{"status":"cancelled","resolutionCode":"duplicate","note":"Cancelled by human operator"}');
 perform pg_temp.check_true(d->>'status'='cancelled' and d->>'closedAt' is not null,'human cancellation');
end; $$;
-- Direct reads/writes and anonymous execution remain closed.
select pg_temp.denied('select * from public.wf_retention_case_notes','42501','direct note table denied');
select pg_temp.denied('update public.wf_retention_cases set status=''resolved'' where case_id=''QA40-CA''','42501','direct case writes denied');
reset role;
select pg_temp.actor('analyst');
set local role authenticated;
select pg_temp.check_true(public.retention_case_detail('QA40-CA')::text like '%PRIVATE_NOTE_QA40%','matrix READ operator sees internal case notes');
reset role;
-- Disable a formerly valid writer and verify current access on replay.
update public.app_role_memberships set status='revoked' where membership_key='qa40:admin';
select pg_temp.actor('admin');
set local role authenticated;
select pg_temp.denied('select public.retention_case_detail(''QA40-CA'')','42501','revoked membership denied');
reset role;
set local role anon;
do $$ begin begin perform public.retention_case_detail('QA40-CA'); raise exception 'anon allowed'; exception when insufficient_privilege then null; end; end; $$;
reset role;
select pg_temp.check_true((select count(*) from public.wf_domain_events where event_type='RETENTION_CASE_RESOLVED' and target_id='QA40-CA')=1,'one canonical resolution event');
select pg_temp.check_true(not exists(select 1 from public.wf_domain_events where target_id like 'QA40-C%' and employer_id is not null),'no Employer event consequences');
select pg_temp.check_true(not exists(select 1 from public.platform_audit_events where entity_id like 'QA40-C%' and (metadata::text||coalesce(before_json::text,'')||coalesce(after_json::text,'')) like '%PRIVATE_NOTE_QA40%'),'notes excluded from audit payload');
select pg_temp.check_true((select count(*) from public.platform_audit_events where action='retention_case_updated' and entity_id like 'QA40-C%')=7,'one audit per actual update');
select pg_temp.check_true((select count(*) from public.wf_notifications)=(select notifications from retention_qa_baseline),'no automatic notification sends');
select pg_temp.check_true((select count(*) from public.wf_student_skills)=(select skills from retention_qa_baseline),'Verified Skills unchanged');
select pg_temp.check_true((select jsonb_agg(to_jsonb(p) order by placement_id) from public.wf_placements p)=(select placements from retention_qa_baseline),'employment state unchanged');
select jsonb_build_object('result','PASS','checks',count(*),'fixture','rollback-only','roles','authenticated/anon','providerSends',0) as result from retention_qa_checks;
rollback;
