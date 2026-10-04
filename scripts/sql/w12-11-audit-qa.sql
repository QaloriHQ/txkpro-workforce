-- Staging only: synthetic fixtures, real authenticated role, complete rollback.
begin;
create temp table retention_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into retention_qa_actors select name,gen_random_uuid(),security.new_legacy_id('QA'),
 'qa40-'||name||'-'||gen_random_uuid()||'@example.invalid'
 from unnest(array['platform','admin','career','coordinator','instructor','assistant','department','analyst',
 'other_admin','employer','student','inactive','disabled','spoof','unscoped_admin','stitched','ambiguous','bound']) name;
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
 ('bound','program_coordinator','program','QA40-Shared'),('ambiguous','program_coordinator','program','QA40-Shared')) v(name,role,scope,scope_id) using(name);
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'qa40:stitched-read',auth_id,user_id,'read_only_analyst','institution','QA40-A','active','qa40'
 from retention_qa_actors where name='stitched';
insert into public.wf_user_invitations(invitation_id,email,role,scope_type,scope_id,institution_id,membership_key,status,expires_at,invited_by_auth_user_id,invited_by_user_id,accepted_by_auth_user_id,accepted_by_user_id,accepted_at)
 select 'QA40-INV',email,'program_coordinator','program','QA40-Shared','QA40-A','qa40:bound','accepted',now()+interval '1 day',auth_id,user_id,auth_id,user_id,now()
 from retention_qa_actors where name='bound';
update public.app_role_memberships set source='canonical_invitation:QA40-INV' where membership_key='qa40:bound';
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
-- Fixtures below are synthetic; all mutations roll back.
insert into public.platform_audit_events(action,entity_type,entity_id,institution_id,student_id,actor_user_id,actor_auth_user_id,before_json,after_json,metadata,created_at)
 select 'PLACEMENT_STATUS_CHANGED','placement','QA40-P'||suffix,inst,'QA40-S'||suffix,user_id,auth_id,
 '{"status":"pending_start","notes":"PRIVATE_SENTINEL"}',
 '{"status":"active","email":"PRIVATE_SENTINEL","token":"PRIVATE_SENTINEL"}',
 '{"phone":"PRIVATE_SENTINEL"}','2099-01-01T00:00:00Z'
 from retention_qa_actors cross join (values('A','QA40-A'),('AS','QA40-A'),('B','QA40-B')) v(suffix,inst) where name='admin';
insert into public.platform_audit_events(action,entity_type,entity_id,institution_id,student_id)
 values('EMPLOYER_PRIVATE_EVALUATION','placement','QA40-PA','QA40-A','QA40-SA'),
 ('PLACEMENT_STATUS_CHANGED','placement','QA40-PB','QA40-A','QA40-SB');
select security.emit_workforce_event('REFERRAL_VIEWED','student','QA40-SA',null,'QA40-A','QA40-SA');
insert into public.platform_audit_events(action,entity_type,entity_id,institution_id,student_id)
 values('USER_INVITATION_APPROVAL_DECIDED','user_invitation','QA40-INV','QA40-A',null),
 ('EMPLOYER_TRAINING_COMPLETED','student','QA40-SA','QA40-A','QA40-SA'),
 ('MICRO_CERT_ASSIGNED','student','QA40-SA','QA40-A','QA40-SA');
set local role authenticated;
do $$ declare actor text; d jsonb; e jsonb; id text; begin
 foreach actor in array array['admin','department','analyst','stitched'] loop
  perform pg_temp.actor(actor); d:=public.audit_workspace_read('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED"}');
  perform pg_temp.check_true((d->>'total')::int=2,actor||' reads A only and excludes conflicting scope');
  perform pg_temp.check_true(d::text not like '%PRIVATE_SENTINEL%' and d::text not like '%actor_auth%' and d::text not like '%metadata%',actor||' safe projection');
  perform pg_temp.check_true(d->'items'->0->>'beforeStatus'='pending_start' and d->'items'->0->>'afterStatus'='active',actor||' safe lifecycle status');
  perform pg_temp.denied($q$select public.audit_workspace_read('QA40-B')$q$,'42501',actor||' cross-institution denied');
 end loop;
 perform pg_temp.actor('coordinator'); d:=public.audit_workspace_read('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED"}');
 perform pg_temp.check_true((d->>'total')::int=1 and d->'items'->0->>'studentId'='QA40-SA','program excludes sibling cohort');
 perform pg_temp.actor('bound'); d:=public.audit_workspace_read('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED"}');
 perform pg_temp.check_true((d->>'total')::int=0,'bound program cannot read other program records');
 perform pg_temp.actor('other_admin'); d:=public.audit_workspace_read('QA40-B','{"eventType":"PLACEMENT_STATUS_CHANGED"}');
 perform pg_temp.check_true((d->>'total')::int=1,'B admin reads B');
 foreach actor in array array['career','instructor','assistant','employer','student','inactive','disabled','spoof','unscoped_admin','ambiguous'] loop
  perform pg_temp.actor(actor);
  perform pg_temp.denied($q$select public.audit_workspace_read('QA40-A')$q$,'42501',actor||' read denied');
  perform pg_temp.denied($q$select public.audit_workspace_export('QA40-A')$q$,'42501',actor||' export denied');
 end loop;
 perform pg_temp.actor('platform'); d:=public.audit_workspace_read(null,'{"eventType":"PLACEMENT_STATUS_CHANGED","from":"2099-01-01","to":"2099-01-02"}');
 perform pg_temp.check_true((d->>'total')::int=3,'platform reads both Institutions');
 perform pg_temp.actor('admin'); d:=public.audit_workspace_read('QA40-A','{"eventType":"REFERRAL_VIEWED"}');
 perform pg_temp.check_true((d->>'total')::int=1,'mirrored event deduplicated');
 d:=public.audit_workspace_read('QA40-A','{"eventType":"EMPLOYER_PRIVATE_EVALUATION"}');
 perform pg_temp.check_true((d->>'total')::int=0,'Employer-private event excluded');
 perform pg_temp.denied($q$select public.audit_workspace_read('QA40-A','{"result":"bad"}')$q$,'22023','invalid result rejected');
 perform pg_temp.denied($q$select public.audit_workspace_read('QA40-A','{"offset":-1}')$q$,'22023','negative offset rejected');
 perform pg_temp.denied($q$select public.audit_workspace_read('QA40-A','{"from":"2099-01-02","to":"2099-01-01"}')$q$,'22023','invalid date range rejected');
 perform pg_temp.denied($q$select public.audit_workspace_read('QA40-A','{"recordId":"invalid"}')$q$,'22023','invalid detail identifier rejected');
 d:=public.audit_workspace_read('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED"}'); id:=d->'items'->0->>'recordId';
 e:=public.audit_workspace_read('QA40-A',jsonb_build_object('recordId',id));
 perform pg_temp.check_true((e->>'total')::int=1,'detail read scoped to exact authorized record');
 e:=public.audit_workspace_read('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED","offset":1}');
 perform pg_temp.check_true(e->'items'->0->>'recordId'=d->'items'->1->>'recordId','pagination stable for equal timestamps');
 perform pg_temp.check_true((public.audit_workspace_read('QA40-A','{"eventType":"USER_INVITATION_APPROVAL_DECIDED"}')->>'total')::int=1,'canonical invitation approval visible');
 perform pg_temp.check_true((public.audit_workspace_read('QA40-A','{"eventType":"EMPLOYER_TRAINING_COMPLETED"}')->>'total')::int=1,'canonical training completion visible');
 perform pg_temp.check_true((public.audit_workspace_read('QA40-A','{"eventType":"MICRO_CERT_ASSIGNED"}')->>'total')::int=1,'canonical training assignment visible');
 perform pg_temp.actor('analyst'); e:=public.audit_workspace_export('QA40-A','{"eventType":"PLACEMENT_STATUS_CHANGED"}');
 perform pg_temp.check_true((e->>'total')::int=2 and jsonb_array_length(e->'items')=2,'permitted analyst export');
end $$;
reset role;
select pg_temp.check_true((select count(*)=1 from public.wf_domain_events where event_type='REPORT_EXPORTED' and institution_id='QA40-A' and actor_user_id=(select user_id from retention_qa_actors where name='analyst')),'export attributable exactly once');
insert into public.platform_audit_events(action,entity_type,entity_id,institution_id,created_at)
 select 'INSTITUTION_APPROVED','institution','QA40-A','QA40-A','2099-02-01T00:00:00Z' from generate_series(1,1001);
set local role authenticated;
select pg_temp.actor('admin');
select pg_temp.check_true((public.audit_workspace_export('QA40-A','{"eventType":"INSTITUTION_APPROVED","from":"2099-02-01","to":"2099-02-02"}')->>'truncated')::boolean,'export cap reports truncation');
select pg_temp.check_true(jsonb_array_length(public.audit_workspace_export('QA40-A','{"eventType":"INSTITUTION_APPROVED","from":"2099-02-01","to":"2099-02-02"}')->'items')=1000,'export bounded to 1000');
select pg_temp.check_true(jsonb_array_length(public.audit_workspace_read('QA40-A','{"eventType":"INSTITUTION_APPROVED","from":"2099-02-01","to":"2099-02-02"}')->'items')=25,'read bounded to 25');
reset role;
set local role anon;
-- Use a direct block since anon cannot read the private temporary check table.
do $$ declare denied boolean:=false; begin
 begin perform public.audit_workspace_read('QA40-A'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anonymous read unexpectedly allowed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
set local role service_role;
do $$ declare denied boolean:=false; begin
 begin perform public.audit_workspace_read(null); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Service without authenticated actor unexpectedly allowed'; end if;
end $$;
reset role;
select jsonb_build_object('passed',count(*),'anonymous_denial','passed','service_without_actor_denial','passed','checks',jsonb_agg(label order by label)) from retention_qa_checks;
rollback;
