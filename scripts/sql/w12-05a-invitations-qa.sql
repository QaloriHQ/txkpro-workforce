-- Run against staging with postgres privileges. All fixtures and mutations
-- are rollback-only; no provider email is sent and no real user is changed.
begin;
create temporary table invite_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into invite_qa_actors select x,gen_random_uuid(),security.new_legacy_id('QA'),'qa185-'||x||'-'||gen_random_uuid()||'@example.invalid'
from unnest(array['platform','admin_a','admin_b','coordinator','employer_a','employer_b','recipient','staff','wrong','unverified','newrecipient']) x;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,email,case when name='unverified' then null else now() end,'authenticated','authenticated','{}'::jsonb,'{}'::jsonb from invite_qa_actors where name<>'newrecipient';
-- Respect any existing Auth bridge trigger rather than creating duplicates.
update invite_qa_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
select user_id,auth_id,email,'QA','Fixture','active' from invite_qa_actors a
where a.name<>'newrecipient' and not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
insert into public.wf_institutions(institution_id,name,active) values('QA185-A','QA A',true),('QA185-B','QA B',true);
insert into public.wf_cohorts(cohort_id,institution_id,name,program_name) values('QA185-CA','QA185-A','QA Cohort A','QA Program A'),('QA185-CB','QA185-B','QA Cohort B','QA Program B');
insert into public.contractors(contractor_id,business_name) values('QA185-EA','QA Employer A'),('QA185-EB','QA Employer B');
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
select 'qa185:'||a.name,a.auth_id,a.user_id,v.role,v.scope_type,v.scope_id,'active','qa185'
from invite_qa_actors a join (values
 ('platform','admin','platform',null),('admin_a','institution_admin','institution','QA185-A'),('admin_b','institution_admin','institution','QA185-B'),
 ('coordinator','program_coordinator','program','QA Program A'),('employer_a','employer_admin','employer','QA185-EA'),('employer_b','employer_admin','employer','QA185-EB'),('recipient','student','self','QA185-SELF')) v(name,role,scope_type,scope_id) on a.name=v.name;
create temporary table invite_qa_ids(name text primary key,id text);
grant select on invite_qa_actors to authenticated,service_role;
grant all on invite_qa_ids to authenticated,service_role;
create function pg_temp.actor(p_name text) returns void language plpgsql as $$
declare a invite_qa_actors%rowtype;
begin
 select * into a from invite_qa_actors where name=p_name;
 perform set_config('request.jwt.claim.sub',coalesce(a.auth_id::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_id,'role','authenticated','email',a.email)::text,true);
end; $$;
create function pg_temp.check_true(p_value boolean,p_message text) returns void language plpgsql as $$ begin if p_value is distinct from true then raise exception 'QA failed: %',p_message; end if; end; $$;
create function pg_temp.denied(p_sql text,p_pattern text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute p_sql; exception when others then if sqlerrm ~* p_pattern then rejected:=true; else raise; end if; end;
 perform pg_temp.check_true(rejected,'expected denial: '||p_pattern);
end; $$;
set local role authenticated;
select pg_temp.actor('admin_a');
do $$ declare r jsonb; d jsonb; e text; begin
 select email into e from invite_qa_actors where name='recipient';
 r:=public.user_invitation_create(e,'student','cohort','QA185-CA','QA185-A',null,now()+interval '7 days','qa185-student','{}');
 insert into invite_qa_ids values('student',r->>'invitationId');
 d:=public.user_invitation_create(e,'student','cohort','QA185-CA','QA185-A',null,now()+interval '7 days','qa185-student','{}');
 perform pg_temp.check_true(d->>'created'='false' and d->>'invitationId'=r->>'invitationId','duplicate create');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,%L,%L,%L,%L,null,now()+interval ''7 days'',null,''{}'')',e,'student','cohort','QA185-CB','QA185-B'),'scope denied');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,%L,%L,null,null,null,now()+interval ''7 days'',null,''{}'')',e,'admin','platform'),'scope denied');
end; $$;
select pg_temp.actor('admin_b');
select pg_temp.denied(format('select public.user_invitation_revoke(%L,''revoked'')',id),'scope denied') from invite_qa_ids where name='student';
select pg_temp.check_true(public.user_invitations_list('QA185-A',null,null)='[]'::jsonb,'cross-Institution list');
select pg_temp.actor('employer_a');
do $$ declare e text; r jsonb; begin
 select email into e from invite_qa_actors where name='staff';
 r:=public.user_invitation_create(e,'recruiter','employer','QA185-EA',null,'QA185-EA',now()+interval '7 days',null,'{}');
 insert into invite_qa_ids values('employer',r->>'invitationId');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,''recruiter'',''employer'',''QA185-EB'',null,''QA185-EB'',now()+interval ''7 days'',null,''{}'')',e),'scope denied');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,''employer_owner'',''employer'',''QA185-EA'',null,''QA185-EA'',now()+interval ''7 days'',null,''{}'')',e),'scope denied');
end; $$;
select pg_temp.actor('employer_b');
select pg_temp.denied(format('select public.user_invitation_prepare_resend(%L)',id),'scope denied') from invite_qa_ids where name='employer';
select pg_temp.actor('wrong');
select pg_temp.denied(format('select public.user_invitation_for_recipient(%L)',id),'recipient mismatch') from invite_qa_ids where name='student';
select pg_temp.denied(format('select public.user_invitation_accept(%L)',id),'recipient mismatch') from invite_qa_ids where name='student';
select pg_temp.actor('recipient');
do $$ declare r jsonb; d jsonb; i text; e text; begin
 select id into i from invite_qa_ids where name='student';
 r:=public.user_invitation_accept(i); d:=public.user_invitation_accept(i);
 perform pg_temp.check_true(r->>'status'='accepted' and d->>'idempotent'='true','single-use idempotent acceptance');
 r:=public.complete_student_onboarding('{"firstName":"QA","lastName":"Student","publicProfileVisibility":"private","publicProfileSlug":"qa185-student","publicDisplayName":"QA Student","schoolId":"QA185-B","discoverable":false}'::jsonb);
 perform pg_temp.check_true(r->>'ok'='true','active Student onboarding RPC');
 select email into e from invite_qa_actors where name='wrong';
 perform pg_temp.denied(format('select public.user_invitation_create(%L,''instructor'',''institution'',''QA185-A'',''QA185-A'',null,now()+interval ''7 days'',null,''{}'')',e),'scope denied');
end; $$;
select pg_temp.actor('coordinator');
do $$ declare r jsonb; e text; begin
 select email into e from invite_qa_actors where name='staff';
 r:=public.user_invitation_create(e,'instructor','cohort','QA185-CA','QA185-A',null,now()+interval '7 days',null,'{}');
 perform pg_temp.check_true(r->>'activationPolicy'='approval_required','delegated approval boundary');
 insert into invite_qa_ids values('approval',r->>'invitationId');
end; $$;
select pg_temp.actor('staff');
do $$ declare r jsonb; i text; begin
 select id into i from invite_qa_ids where name='approval'; r:=public.user_invitation_accept(i);
 perform pg_temp.check_true(r->>'membershipStatus'='pending','acceptance does not bypass D-01');
 select id into i from invite_qa_ids where name='employer'; r:=public.user_invitation_accept(i);
 perform pg_temp.check_true(r->>'redirectTo'='/employer','existing account additive Employer membership');
end; $$;
select pg_temp.actor('coordinator');
select pg_temp.denied(format('select public.user_invitation_decide_approval(%L,''approved'')',id),'approval scope denied') from invite_qa_ids where name='approval';
select pg_temp.actor('admin_a');
select pg_temp.check_true(public.user_invitation_decide_approval(id,'approved')->>'status'='active','scoped approval activates access') from invite_qa_ids where name='approval';
select pg_temp.check_true(public.user_invitation_decide_approval(id,'approved')->>'idempotent'='true','approval retry') from invite_qa_ids where name='approval';
do $$ declare r jsonb; e text; begin
 select email into e from invite_qa_actors where name='wrong';
 r:=public.user_invitation_create(e,'student','institution','QA185-A','QA185-A',null,now()+interval '7 days',null,'{}');
 insert into invite_qa_ids values('revoked',r->>'invitationId');
 perform public.user_invitation_revoke(r->>'invitationId','revoked');
 r:=public.user_invitation_create(e,'student','cohort','QA185-CA','QA185-A',null,now()+interval '7 days',null,'{}');
 insert into invite_qa_ids values('expired',r->>'invitationId');
end; $$;
reset role;
update public.wf_user_invitations set expires_at=now()-interval '1 second' where invitation_id=(select id from invite_qa_ids where name='expired');
set local role authenticated;
select pg_temp.actor('recipient');
select pg_temp.denied(format('select public.user_invitation_accept(%L)',id),'recipient mismatch') from invite_qa_ids where name in ('expired','revoked');
reset role;
select pg_temp.check_true((select status='pending' from public.wf_user_invitations where invitation_id=(select id from invite_qa_ids where name='expired')),'nonrecipient cannot expire invitation');
set local role authenticated;
select pg_temp.actor('wrong');
select pg_temp.denied(format('select public.user_invitation_accept(%L)',id),'not active|expired') from invite_qa_ids where name in ('expired','revoked');
select pg_temp.actor('platform');
do $$ declare e text; begin
 select email into e from invite_qa_actors where name='wrong';
 perform public.user_invitation_create(e,'support','platform',null,null,null,now()+interval '7 days',null,'{}');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,''super_admin'',''platform'',null,null,null,now()+interval ''7 days'',null,''{}'')',e),'scope denied');
 perform pg_temp.denied(format('select public.user_invitation_create(%L,''invented_role'',''institution'',''QA185-A'',''QA185-A'',null,now()+interval ''7 days'',null,''{}'')',e),'scope denied');
end; $$;
select pg_temp.actor('unverified');
select pg_temp.denied(format('select public.user_invitation_for_recipient(%L)',id),'recipient mismatch') from invite_qa_ids where name='student';
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.user_invitation_accept(text)','execute'),'anonymous RPC revoked');
select pg_temp.check_true(not has_function_privilege('authenticated','public.user_invitation_claim_delivery(text,text)','execute'),'delivery service-only');
select pg_temp.check_true(not has_function_privilege('authenticated','public.workforce_invitation_accept(text)','execute'),'legacy acceptance disabled');
select pg_temp.check_true((select s.school_id='QA185-A' and s.cohort_id='QA185-CA' and s.profile_visibility='private' from public.wf_student_profiles s join invite_qa_actors a on a.user_id=s.user_id where a.name='recipient'),'canonical affiliation and privacy');
select pg_temp.check_true((select count(*)=1 from public.platform_audit_events e join invite_qa_ids i on e.entity_id=i.id where i.name='student' and e.action='USER_INVITATION_ACCEPTED'),'acceptance audit single emission');
select pg_temp.check_true((select count(*)=1 from public.wf_domain_events e join invite_qa_actors a on e.actor_auth_user_id=a.auth_id where a.name='recipient' and e.event_type='STUDENT_LINKED_TO_COHORT'),'canonical cohort event');
select pg_temp.check_true((select count(*)=2 from public.app_role_memberships r join invite_qa_actors a on r.user_id=a.user_id where a.name='recipient' and r.status='active' and r.role='student' and (r.membership_key='qa185:recipient' or r.scope_id='QA185-CA')),'preexisting Student role remains additive');
-- New identity links the precreated canonical user without metadata authority.
set local role authenticated;
select pg_temp.actor('admin_a');
do $$ declare r jsonb; e text; begin
 select email into e from invite_qa_actors where name='newrecipient';
 r:=public.user_invitation_create(e,'student','cohort','QA185-CA','QA185-A',null,now()+interval '7 days',null,'{}');
 perform pg_temp.check_true(r->>'recipientExistingIdentity'='false','new recipient setup');
 insert into invite_qa_ids values('newrecipient',r->>'invitationId');
end; $$;
set local role service_role;
select pg_temp.check_true(public.user_invitation_claim_delivery(id,'qa185-send1')->>'claimed'='true','service delivery claim') from invite_qa_ids where name='newrecipient';
select public.user_invitation_record_delivery(id,false,'test_failure','qa185-send1') from invite_qa_ids where name='newrecipient';
select pg_temp.check_true(public.user_invitation_claim_delivery(id,'qa185-send1')->>'idempotent'='true','delivery retry same key') from invite_qa_ids where name='newrecipient';
select pg_temp.check_true(public.user_invitation_claim_delivery(id,'qa185-send2')->>'claimed'='false','delivery cooldown') from invite_qa_ids where name='newrecipient';
reset role;
update public.wf_user_invitations set delivery_claimed_at=now()-interval '61 seconds' where invitation_id=(select id from invite_qa_ids where name='newrecipient');
set local role service_role;
select pg_temp.check_true(public.user_invitation_claim_delivery(id,'qa185-send2')->>'claimed'='true','delivery retry new claim') from invite_qa_ids where name='newrecipient';
select pg_temp.check_true(public.user_invitation_record_delivery(id,true,null,'qa185-send1')->>'idempotent'='true','stale completion fenced') from invite_qa_ids where name='newrecipient';
select public.user_invitation_record_delivery(id,true,null,'qa185-send2') from invite_qa_ids where name='newrecipient';
reset role;
select pg_temp.check_true((select send_count=2 and delivery_status='sent' from public.wf_user_invitations where invitation_id=(select id from invite_qa_ids where name='newrecipient')),'delivery count and status');
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,email,now(),'authenticated','authenticated','{}','{"role":"super_admin"}' from invite_qa_actors where name='newrecipient';
update invite_qa_actors a set user_id=u.user_id from public.users u where a.name='newrecipient' and u.auth_user_id=a.auth_id;
set local role authenticated;
select pg_temp.actor('newrecipient');
select pg_temp.check_true(public.user_invitation_accept(id)->>'status'='accepted','new identity acceptance') from invite_qa_ids where name='newrecipient';
reset role;
select pg_temp.check_true((select count(*)=1 from public.users u join invite_qa_actors a on lower(u.email)=a.email where a.name='newrecipient'),'single canonical new identity');
select pg_temp.check_true(not exists(select 1 from public.app_role_memberships r join invite_qa_actors a on r.auth_user_id=a.auth_id where a.name='newrecipient' and r.scope_type='platform' and r.status='active'),'metadata cannot grant authority');
select 'PASS: invitation scope, identity, lifecycle, approval, onboarding, privacy, audit and delivery QA' as result;
rollback;
