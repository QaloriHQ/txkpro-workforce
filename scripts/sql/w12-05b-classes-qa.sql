-- Rollback-only staging fixtures. Run after draft migration within BEGIN/ROLLBACK.
create temporary table class_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into class_qa_actors select name,gen_random_uuid(),security.new_legacy_id('QA'),'qa235-'||name||'-'||gen_random_uuid()||'@example.invalid'
from unnest(array['admin','instructor','other_instructor','outsider','student','other_student','wrong','unverified']) name;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,email,case when name='unverified' then null else now() end,'authenticated','authenticated','{}','{}' from class_qa_actors;
update class_qa_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
select user_id,auth_id,email,'QA',name,'active' from class_qa_actors a where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
insert into public.wf_institutions(institution_id,name,active) values('QA235-A','QA Institution A',true),('QA235-B','QA Institution B',true);
insert into public.wf_cohorts(cohort_id,institution_id,name,program_name,status) values('QA235-C1','QA235-A','September','Electrical','active'),('QA235-C2','QA235-A','October','Electrical','enrolling'),('QA235-CB','QA235-B','Other','Electrical','active');
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
select 'qa235:'||a.name,a.auth_id,a.user_id,x.role,x.scope_type,x.scope_id,'active','qa235' from class_qa_actors a join (values
('admin','institution_admin','institution','QA235-A'),('instructor','instructor','institution','QA235-A'),('other_instructor','instructor','cohort','QA235-C1'),('outsider','institution_admin','institution','QA235-B'),('student','student','self','QA235-S'),('other_student','student','self','QA235-OS')) x(name,role,scope_type,scope_id) using(name);
create temporary table class_qa_ids(name text primary key,id text);
grant select on class_qa_actors to authenticated; grant all on class_qa_ids to authenticated;
create function pg_temp.class_actor(p_name text) returns void language plpgsql as $$declare a class_qa_actors%rowtype; begin
 select * into a from class_qa_actors where name=p_name;
 perform set_config('request.jwt.claim.sub',coalesce(a.auth_id::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_id,'role','authenticated','email',a.email)::text,true);
end $$;
create function pg_temp.assert_class(p_value boolean,p_message text) returns void language plpgsql as $$begin if p_value is distinct from true then raise exception 'QA235 failed: %',p_message; end if; end $$;
create function pg_temp.class_denied(p_sql text,p_pattern text) returns void language plpgsql as $$declare rejected boolean:=false;begin
 begin execute p_sql; exception when others then if sqlerrm ~* p_pattern then rejected:=true; else raise; end if; end;
 perform pg_temp.assert_class(rejected,'expected denial: '||p_pattern);
end $$;
set local role authenticated;
select pg_temp.class_actor('instructor');
do $$declare r jsonb;d jsonb;k uuid:=gen_random_uuid();e text;begin
 r:=public.class_save(jsonb_build_object('name','Multi cohort class','institutionId','QA235-A','courseName','Electrical I','status','open','cohortIds',jsonb_build_array('QA235-C1','QA235-C2'),'requestKey',k));
 insert into class_qa_ids values('class',r->>'classId');
 d:=public.class_save(jsonb_build_object('name','Multi cohort class','institutionId','QA235-A','status','open','cohortIds',jsonb_build_array('QA235-C1','QA235-C2'),'requestKey',k));
 perform pg_temp.assert_class(d->>'classId'=r->>'classId' and d->>'idempotent'='true','retry creates no duplicate class');
 perform pg_temp.class_denied(format('select public.class_save(%L::jsonb)',jsonb_build_object('name','Cross institution','institutionId','QA235-A','status','open','cohortIds',jsonb_build_array('QA235-CB'),'requestKey',gen_random_uuid())::text),'scope denied');
 select email into e from class_qa_actors where name='student';
 d:=public.user_invitation_create(e,'student','class',r->>'classId','QA235-A',null,now()+interval '7 days',null,'{"cohortHint":"QA235-C1","programHint":"Electrical"}');
 insert into class_qa_ids values('invite',d->>'invitationId');
 perform pg_temp.assert_class(d->>'created'='true','assigned instructor may invite');
 perform pg_temp.class_denied(format('select public.user_invitation_create(%L,''instructor'',''class'',%L,''QA235-A'',null,now()+interval ''7 days'',null,''{}'')',e,r->>'classId'),'scope denied');
 perform pg_temp.class_denied(format('select public.user_invitation_create(%L,''student'',''institution'',''QA235-A'',''QA235-A'',null,now()+interval ''7 days'',null,''{}'')',e),'scope denied');
 perform pg_temp.assert_class(jsonb_array_length(public.class_workspace()->'classes'->0->'enrollments')=0,'pending invite is not enrollment');
 d:=public.class_link(r->>'classId',repeat('a',64),null);insert into class_qa_ids values('link',d->>'linkId');
end $$;
select pg_temp.class_actor('outsider');
select pg_temp.assert_class(jsonb_array_length(public.class_workspace()->'classes')=0,'cross institution classes hidden');
select pg_temp.class_denied(format('select public.class_link(%L,%L,null)',id,repeat('b',64)),'scope denied') from class_qa_ids where name='class';
select pg_temp.class_actor('other_instructor');
select pg_temp.assert_class(public.class_workspace()->'classes'->0->>'canManage'='false','partial cohort unassigned instructor read-only');
select pg_temp.class_denied(format('select public.class_save(%L::jsonb)',jsonb_build_object('classId',id,'name','No','status','closed')),'scope denied') from class_qa_ids where name='class';
select pg_temp.class_actor('instructor');
select pg_temp.class_denied(format('select public.class_instructor_assign(%L,%L,false)',(select id from class_qa_ids where name='class'),(select user_id from class_qa_actors where name='other_instructor')),'every class cohort');
select pg_temp.class_denied(format('select public.class_instructor_assign(%L,%L,false)',(select id from class_qa_ids where name='class'),(select user_id from class_qa_actors where name='outsider')),'every class cohort');
select pg_temp.class_actor('admin');
select public.cohort_start_date('QA235-C1','2026-09-01');
select pg_temp.class_denied('select public.cohort_start_date(''QA235-CB'',''2026-09-01'')','scope denied');
select pg_temp.class_actor('wrong');
select pg_temp.class_denied(format('select public.user_invitation_accept(%L)',id),'recipient mismatch') from class_qa_ids where name='invite';
select pg_temp.class_actor('student');
do $$declare r jsonb;d jsonb;i text;begin
 select id into i from class_qa_ids where name='invite';r:=public.user_invitation_accept(i);d:=public.user_invitation_accept(i);
 perform pg_temp.assert_class(r->>'status'='accepted' and d->>'idempotent'='true','canonical acceptance retry');
 perform pg_temp.assert_class(jsonb_array_length(public.class_workspace()->'classes'->0->'enrollments')=1,'one enrollment only');
 perform pg_temp.class_denied('select public.complete_student_onboarding(''{"schoolId":"QA235-A","cohortId":"QA235-CB","publicProfileVisibility":"private"}''::jsonb)','active cohort');
 r:=public.complete_student_onboarding('{"firstName":"QA","lastName":"Student","schoolId":"QA235-A","cohortId":"QA235-C1","publicProfileVisibility":"private","publicProfileSlug":"qa235-student","publicDisplayName":"QA Student"}');
 perform pg_temp.assert_class(r->>'ok'='true','cohort onboarding succeeds');
 perform pg_temp.assert_class(jsonb_array_length(public.institution_connections()->'people')>0,'student sees scoped staff');
 perform pg_temp.class_denied('select * from public.wf_class_enrollments','permission denied');
end $$;
select pg_temp.class_actor('other_student');
do $$declare r jsonb;d jsonb;begin
 r:=public.class_qr_claim(repeat('a',64));d:=public.class_qr_claim(repeat('a',64));
 perform pg_temp.assert_class(r->>'invitationId'=d->>'invitationId','QR claim deduplication');
 perform pg_temp.assert_class(jsonb_array_length(public.class_workspace()->'classes')=0,'QR review does not enroll');
 perform public.class_invitation_decline(r->>'invitationId');
 perform pg_temp.class_denied(format('select public.user_invitation_accept(%L)',r->>'invitationId'),'active|pending|declined');
end $$;
select pg_temp.class_actor('unverified');
select pg_temp.class_denied('select public.class_qr_claim('||quote_literal(repeat('a',64))||')','verified');
select pg_temp.class_actor('instructor');
select public.class_link((select id from class_qa_ids where name='class'),null,(select id::uuid from class_qa_ids where name='link'));
select pg_temp.class_actor('other_student');
select pg_temp.class_denied('select public.class_qr_claim('||quote_literal(repeat('a',64))||')','unavailable');
select pg_temp.class_actor('instructor');
select public.class_enrollment_update((select id from class_qa_ids where name='class'),(select user_id from class_qa_actors where name='student'),'completed');
reset role;
select pg_temp.assert_class((select count(*)=1 from public.wf_class_enrollments where class_id=(select id from class_qa_ids where name='class')),'completion preserves historical enrollment');
select pg_temp.assert_class((select cohort_id='QA235-C1' and school_id='QA235-A' from public.wf_student_profiles where user_id=(select user_id from class_qa_actors where name='student')),'affiliation preserved');
select pg_temp.assert_class(exists(select 1 from public.platform_audit_events where entity_id=(select id from class_qa_ids where name='class')),'class audits emitted');
set local role anon;
select pg_temp.class_denied('select public.class_workspace()','permission denied');
reset role;
select 'W12-05B classes authorization QA PASS' as result;
