-- Rolled-back real-role authorization and publication tests. No email/SMS sends.
begin;
create temporary table profile55_actors(name text,auth_id uuid,user_id text);
insert into profile55_actors select name,gen_random_uuid(),security.new_legacy_id('QA55') from unnest(array['owner','other','staff','disabled']) name;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,'qa55-'||auth_id||'@example.invalid',now(),'authenticated','authenticated','{}','{}' from profile55_actors;
update profile55_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
select a.user_id,a.auth_id,'qa55-'||auth_id||'@example.invalid','QA','Profile','active' from profile55_actors a
where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
update public.users set status='active' where user_id in (select user_id from profile55_actors);
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,status,source)
select 'qa55-staff',auth_id,user_id,'admin','platform','active','qa55' from profile55_actors where name='staff';
grant select on profile55_actors to authenticated,service_role,anon;
create function pg_temp.actor(n text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',(select auth_id::text from profile55_actors where name=n),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_id from profile55_actors where name=n),'role','authenticated')::text,true);
end; $$;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'QA55 failed: %',label; end if; end; $$;
create function pg_temp.denied(q text,pattern text) returns void language plpgsql as $$ declare rejected boolean:=false; begin
 begin execute q; exception when others then if sqlerrm ~* pattern then rejected:=true; else raise; end if; end;
 perform pg_temp.ok(rejected,'expected denial '||pattern); end; $$;
set local role authenticated;
select pg_temp.actor('owner');
select pg_temp.denied('select public.complete_student_onboarding(''{"firstName":"QA","lastName":"Profile"}''::jsonb)','Choose Public or Private');
select pg_temp.denied('select security.complete_student_onboarding_before_public_profile(''{}'')','permission denied');
select public.complete_student_onboarding('{"firstName":"QA","lastName":"Profile","publicProfileVisibility":"public","publicProfileSlug":"qa55-owner","publicDisplayName":"QA Public","publicHeadline":"Student headline","publicBio":"Student bio","discoverable":false}');
select pg_temp.ok(public.student_public_profile_settings()->>'visibility'='public','explicit public persisted');
select pg_temp.denied('select public.student_public_profile_settings(''{"visibility":"unlisted","slug":"qa55-owner","displayName":"QA"}'')','Choose Public or Private');
select pg_temp.denied('select public.student_public_profile_settings(''{"visibility":"public","slug":"../../private","displayName":"QA"}'')','profile URL');
select pg_temp.denied('select public.student_public_profile_read(''/students/qa55-owner'')','permission denied');
select pg_temp.actor('other');
select public.complete_student_onboarding('{"firstName":"Other","lastName":"Profile","publicProfileVisibility":"private","publicProfileSlug":"qa55-other","publicDisplayName":"Other"}');
select pg_temp.ok(public.student_public_profile_settings()->>'displayName'='Other','self read only');
select pg_temp.denied('select public.student_public_profile_settings(''{"visibility":"public","slug":"qa55-owner","displayName":"Other"}'')','reserved');
select pg_temp.actor('staff');
select pg_temp.denied('select public.student_public_profile_settings()','Student self');
select pg_temp.denied('select public.complete_student_onboarding(''{"publicProfileVisibility":"private"}'')','provisioned role');
select pg_temp.actor('owner');
select public.student_public_profile_settings('{"visibility":"public","slug":"qa55-owner-renamed","displayName":"QA Public","headline":"Student headline","bio":"Student bio","entityId":"qa55-other","robotsIndex":false}');
reset role;
select pg_temp.ok((select discoverability_status='private' from public.wf_student_profiles where user_id=(select user_id from profile55_actors where name='owner')),'public visibility did not change Employer discovery');
select pg_temp.ok((select count(*)=1 from public.wf_public_page_redirects where from_path='/students/qa55-owner' and to_path='/students/qa55-owner-renamed' and active),'slug redirect');
create temporary table profile55_audit_count as select count(*) n from public.platform_audit_events where action='STUDENT_PUBLIC_PROFILE_CHANGED' and actor_user_id=(select user_id from profile55_actors where name='owner');
set local role authenticated;
select pg_temp.actor('owner');
select public.student_public_profile_settings('{"visibility":"public","slug":"qa55-owner-renamed","displayName":"QA Public","headline":"Student headline","bio":"Student bio"}');
reset role;
select pg_temp.ok((select count(*)=(select n from profile55_audit_count) from public.platform_audit_events where action='STUDENT_PUBLIC_PROFILE_CHANGED' and actor_user_id=(select user_id from profile55_actors where name='owner')),'idempotent audit');
set local role service_role;
select pg_temp.ok(public.student_public_profile_read('/students/qa55-owner')->>'redirect'='true','old slug resolves while public');
select pg_temp.ok(public.student_public_profile_read('/students/qa55-other')='{"found":false}'::jsonb,'private not found');
select pg_temp.ok(public.student_public_profile_read('/students/qa55-owner-renamed')=jsonb_build_object('found',true,'redirect',false,'path','/students/qa55-owner-renamed','displayName','QA Public','headline','Student headline','bio','Student bio','robotsIndex',true,'robotsFollow',true),'exact safe public allowlist');
select pg_temp.ok(public.student_public_profile_sitemap() @> '[{"path":"/students/qa55-owner-renamed"}]','public included');
set local role authenticated;
select pg_temp.actor('owner');
select public.student_public_profile_settings('{"visibility":"private","slug":"qa55-owner-renamed","displayName":"QA Public","headline":"Student headline","bio":"Student bio"}');
set local role service_role;
select pg_temp.ok(public.student_public_profile_read('/students/qa55-owner')='{"found":false}'::jsonb,'old redirect hidden after privacy change');
select pg_temp.ok(public.student_public_profile_read('/students/qa55-owner-renamed')='{"found":false}'::jsonb,'current page hidden immediately');
select pg_temp.ok(not(public.student_public_profile_sitemap() @> '[{"path":"/students/qa55-owner-renamed"}]'),'private excluded immediately');
reset role;
update public.users set status='disabled' where user_id=(select user_id from profile55_actors where name='owner');
set local role authenticated;
select pg_temp.actor('owner');
select pg_temp.denied('select public.student_public_profile_settings()','Student self');
set local role anon;
select pg_temp.denied('select public.student_public_profile_settings()','permission denied');
select pg_temp.denied('select public.student_public_profile_read(''/students/qa55-owner'')','permission denied');
reset role;
select 'W12-16 real-role QA PASS: explicit choice, atomic onboarding, ownership, role denial, safe projection, collisions, redirects, privacy, sitemap, audit idempotency' result;
rollback;
