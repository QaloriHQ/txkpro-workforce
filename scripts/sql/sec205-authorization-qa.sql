-- Staging only. All identities/data/checks are synthetic and rolled back.
begin;
create temp table sec205_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into sec205_actors select name,gen_random_uuid(),security.new_legacy_id('QA'),
  'sec205-'||name||'-'||gen_random_uuid()||'@example.invalid'
from unnest(array['super','platform_admin','platform_alias','owner','admin','recruiter','readonly','hm',
  'legacy_owner_role','legacy_recruiter_role','legacy_owner','legacy_team','inactive_team',
  'disabled_owner','disabled_team','disabled_admin','disabled_platform','inactive_role','inactive_platform',
  'wrong_company','unscoped_admin','company_admin_alias','wrong_scope','stitched','institution','student','spoof']) name;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data,raw_user_meta_data)
select auth_id,email,now(),'authenticated','authenticated','{}',
  case when name='spoof' then '{"role":"super_admin","scope_type":"platform"}'::jsonb else '{}'::jsonb end from sec205_actors;
update sec205_actors a set user_id=u.user_id from public.users u where u.auth_user_id=a.auth_id;
insert into public.users(user_id,auth_user_id,email,first_name,last_name,status)
select user_id,auth_id,email,'Synthetic',name,'active' from sec205_actors a
where not exists(select 1 from public.users u where u.auth_user_id=a.auth_id);
update public.users set status='disabled' where user_id in (select user_id from sec205_actors where name like 'disabled_%');
insert into public.wf_institutions(institution_id,name,active) values('SEC205-I','Synthetic QA institution',true);
insert into public.contractors(contractor_id,business_name,approval_status,account_status) values
  ('SEC205-E','Synthetic QA Employer','approved','active'),('SEC205-OTHER','Other QA Employer','approved','active');
insert into public.contractors(contractor_id,business_name,approval_status,account_status,owner_user_id)
select 'SEC205-'||name,'Synthetic owned Employer','approved','active',user_id from sec205_actors where name in ('legacy_owner','disabled_owner');
insert into public.contractor_team_members(team_member_id,contractor_id,user_id,status)
select 'SEC205-'||name,'SEC205-E',user_id,case when name='inactive_team' then 'disabled' else 'active' end
from sec205_actors where name in ('legacy_team','disabled_team','inactive_team');
insert into public.wf_student_profiles(student_id,user_id,school_id,profile_status)
select 'SEC205-S',user_id,'SEC205-I','active' from sec205_actors where name='student';
insert into public.wf_hiring_needs(hiring_need_id,employer_id,title,status,assigned_hiring_manager_user_id)
select 'SEC205-NEED','SEC205-E','Synthetic need','draft',user_id from sec205_actors where name='hm';
insert into public.wf_placements(placement_id,student_id,employer_id,role_title,hire_date,status,hiring_need_id) values
  ('SEC205-P','SEC205-S','SEC205-E','Synthetic role',current_date+5,'pending_start','SEC205-NEED'),
  ('SEC205-UNASSIGNED','SEC205-S','SEC205-E','Unassigned role',current_date+5,'pending_start',null),
  ('SEC205-OTHER-P','SEC205-S','SEC205-OTHER','Other Employer role',current_date+5,'pending_start',null);
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
select 'sec205:'||name,auth_id,user_id,role,scope,scope_id,
  case when name like 'inactive_%' then 'pending' else 'active' end,'sec205qa'
from sec205_actors join (values
  ('super','super_admin','platform',null),('platform_admin','admin','platform',null),('platform_alias','platform_admin','platform',null),
  ('owner','employer_owner','employer','SEC205-E'),('admin','employer_admin','employer','SEC205-E'),
  ('recruiter','recruiter','employer','SEC205-E'),('readonly','employer_read_only','employer','SEC205-E'),
  ('hm','hiring_manager','employer','SEC205-E'),('legacy_owner_role','contractor_owner','contractor','SEC205-E'),
  ('legacy_recruiter_role','contractor_recruiter','contractor','SEC205-E'),
  ('disabled_admin','employer_admin','employer','SEC205-E'),('disabled_platform','super_admin','platform',null),
  ('inactive_role','employer_admin','employer','SEC205-E'),('inactive_platform','admin','platform',null),
  ('wrong_company','employer_admin','employer','SEC205-OTHER'),('unscoped_admin','admin','institution','SEC205-I'),
  ('company_admin_alias','admin','employer','SEC205-E'),('wrong_scope','employer_admin','institution','SEC205-E'),
  ('stitched','recruiter','institution','SEC205-I'),('institution','institution_admin','institution','SEC205-I'),
  ('student','student','self','SEC205-S')) v(name,role,scope,scope_id) using(name);
-- A second membership cannot supply a role to the first membership's company scope.
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
select 'sec205:stitched-read',auth_id,user_id,'read_only_analyst','employer','SEC205-E','active','sec205qa'
from sec205_actors where name='stitched';
create temp table sec205_checks(label text);
grant select on sec205_actors to authenticated;
grant select,insert on sec205_checks to authenticated;
create function pg_temp.actor(p_name text) returns void language plpgsql as $$
declare v uuid; begin select auth_id into v from sec205_actors where name=p_name;
perform set_config('request.jwt.claim.sub',coalesce(v::text,''),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated',
  'user_metadata',jsonb_build_object('role','super_admin','scope_type','platform'))::text,true); end; $$;
create function pg_temp.check_true(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'SEC205 failed: %',label; end if;
insert into sec205_checks values(label); end; $$;
create function pg_temp.denied(query text,label text) returns void language plpgsql as $$
declare rejected boolean:=false; begin begin execute query;
exception when sqlstate 'P0001' or sqlstate '42501' then rejected:=true; end;
perform pg_temp.check_true(rejected,label); end; $$;
set local role authenticated;
do $$ declare a text; d jsonb; begin
foreach a in array array['super','platform_admin','platform_alias'] loop
  perform pg_temp.actor(a);
  perform pg_temp.check_true(security.is_admin(),a||' platform shortcut allowed');
  perform pg_temp.check_true(jsonb_array_length(public.employer_placements_list('SEC205-OTHER'))=1,a||' authorized platform RPC');
end loop;
foreach a in array array['owner','admin','recruiter','readonly','legacy_owner_role','legacy_recruiter_role','legacy_team'] loop
  perform pg_temp.actor(a);
  perform pg_temp.check_true(not security.is_admin(),a||' not platform admin');
  perform pg_temp.check_true(security.member_of_employer('SEC205-E'),a||' company membership');
  perform pg_temp.check_true(jsonb_array_length(public.employer_placements_list('SEC205-E'))=2,a||' own company RPC');
  perform pg_temp.check_true((select count(*)=1 from public.contractors where contractor_id='SEC205-E'),a||' own company RLS read');
  perform pg_temp.check_true((select count(*)=0 from public.contractors where contractor_id='SEC205-OTHER'),a||' wrong company RLS read denied');
  perform pg_temp.denied('select public.employer_placements_list(''SEC205-OTHER'')',a||' wrong company RPC denied');
end loop;
foreach a in array array['disabled_admin','disabled_platform','inactive_role','inactive_platform','wrong_company',
  'unscoped_admin','company_admin_alias','wrong_scope','stitched','institution','student','spoof','disabled_team','inactive_team'] loop
  perform pg_temp.actor(a);
  perform pg_temp.check_true(not security.is_admin(),a||' no platform shortcut');
  perform pg_temp.check_true(not security.member_of_employer('SEC205-E'),a||' membership denied');
  perform pg_temp.check_true(not security.has_employer_role('SEC205-E',array['employer_owner','employer_admin','recruiter','admin']),a||' role denied');
  perform pg_temp.denied('select public.employer_placements_list(''SEC205-E'')',a||' direct list denied');
  perform pg_temp.denied('select public.employer_placement_detail(''SEC205-E'',''SEC205-P'')',a||' direct detail denied');
  perform pg_temp.check_true((select count(*)=0 from public.wf_hiring_needs where hiring_need_id='SEC205-NEED'),a||' hiring-need RLS read denied');
end loop;
perform pg_temp.actor('legacy_owner_role');
perform pg_temp.check_true(security.has_employer_role('SEC205-E',array['EMPLOYER_OWNER']),'contractor owner alias retained');
perform pg_temp.actor('legacy_recruiter_role');
perform pg_temp.check_true(security.has_employer_role('SEC205-E',array['recruiter']),'contractor recruiter alias retained');
perform pg_temp.actor('legacy_team');
perform pg_temp.check_true(not security.has_employer_role('SEC205-E',array['employer_admin']),'legacy team read does not grant admin mutation');
perform pg_temp.actor('legacy_owner');
perform pg_temp.check_true(security.member_of_employer('SEC205-legacy_owner')
  and security.has_employer_role('SEC205-legacy_owner',array['employer_owner']),'trusted legacy owner retained');
perform pg_temp.check_true(not security.member_of_employer('SEC205-E'),'legacy owner remains company bound');
perform pg_temp.actor('disabled_owner');
perform pg_temp.check_true(not security.member_of_employer('SEC205-disabled_owner')
  and not security.has_employer_role('SEC205-disabled_owner',array['employer_owner']),'disabled legacy owner denied');
perform pg_temp.actor('hm');
d:=public.employer_placements_list('SEC205-E');
perform pg_temp.check_true(jsonb_array_length(d)=1 and d->0->>'placementId'='SEC205-P','Hiring Manager assigned need only');
perform pg_temp.check_true(security.can_manage_interview('SEC205-E','SEC205-NEED'),'assigned Hiring Manager permitted');
perform pg_temp.check_true(not security.can_manage_interview('SEC205-E',null),'unassigned Hiring Manager cannot manage');
perform pg_temp.denied('select public.employer_placement_detail(''SEC205-E'',''SEC205-UNASSIGNED'')','unassigned Hiring Manager detail denied');
perform pg_temp.actor('readonly');
perform pg_temp.check_true(not security.can_manage_interview('SEC205-E','SEC205-NEED'),'read-only cannot mutate interview');
perform pg_temp.actor('institution');
perform pg_temp.check_true(security.has_institution_learning_role('SEC205-I',null,array['institution_admin']),'Institution path preserved');
perform pg_temp.check_true(not security.has_institution_learning_role('SEC205-OTHER',null,array['institution_admin']),'Institution scope remains bounded');
perform pg_temp.check_true(not security.can_manage_employer_learning_content('SEC205-E'),'Institution cannot manage Employer learning');
perform pg_temp.actor('student');
perform pg_temp.check_true(security.student_owns('SEC205-S'),'Student own path preserved');
perform pg_temp.check_true(not security.student_owns('SEC205-OTHER-S'),'Student cannot gain platform own shortcut');
perform pg_temp.actor(null);
perform pg_temp.check_true(not security.is_admin() and not security.member_of_employer('SEC205-E')
  and not security.has_employer_role('SEC205-E',array['employer_owner']),'missing identity denied');
perform pg_temp.denied('select public.employer_placements_list(''SEC205-E'')','missing identity direct RPC denied');
end $$;
reset role;
do $$ declare f text; begin
foreach f in array array['security.is_admin()','security.has_employer_role(text,text[])','security.member_of_employer(text)'] loop
  perform pg_temp.check_true(not has_function_privilege('anon',f,'execute'),f||' anonymous execute revoked');
  perform pg_temp.check_true(has_function_privilege('authenticated',f,'execute'),f||' authenticated execute retained');
end loop;
end $$;
select count(*) as passed_checks,jsonb_agg(label order by label) as checks from sec205_checks;
rollback;
