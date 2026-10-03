-- Staging only: synthetic fixtures, real authenticated role, complete rollback.
begin;
create temp table retention_qa_actors(name text primary key,auth_id uuid,user_id text,email text);
insert into retention_qa_actors select name,gen_random_uuid(),security.new_legacy_id('QA'),
 'd10qa-'||name||'-'||gen_random_uuid()||'@example.invalid'
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
insert into public.wf_institutions(institution_id,name,active) values('D10QA-A','QA A',true),('D10QA-B','QA B',true);
insert into public.wf_cohorts(cohort_id,institution_id,name,program_name) values
 ('D10QA-CA','D10QA-A','QA Cohort A','D10QA-Program A'),('D10QA-CAS','D10QA-A','QA Cohort sibling','D10QA-Program sibling'),
 ('D10QA-CB','D10QA-B','QA Cohort B','D10QA-Program B'),
 ('D10QA-AMB-A','D10QA-A','Ambiguous A','D10QA-Shared'),('D10QA-AMB-B','D10QA-B','Ambiguous B','D10QA-Shared');
insert into public.contractors(contractor_id,business_name) values('D10QA-E','D10QA Employer');
insert into public.wf_student_profiles(student_id,user_id,school_id,cohort_id,profile_status)
 select 'D10QA-S'||suffix,user_id,inst,cohort,'active' from retention_qa_actors
 cross join (values ('A','D10QA-A','D10QA-CA'),('AS','D10QA-A','D10QA-CAS'),('B','D10QA-B','D10QA-CB')) v(suffix,inst,cohort) where name='student';
insert into public.wf_placements(placement_id,student_id,employer_id,role_title,hire_date,status)
 select 'D10QA-P'||suffix,'D10QA-S'||suffix,'D10QA-E','D10QA Support fixture',current_date-30,'active'
 from unnest(array['A','AS','B']) suffix;
insert into public.wf_retention_milestones(milestone_id,placement_id,day_number,scheduled_for,status)
 select 'D10QA-M'||suffix,'D10QA-P'||suffix,30,now(),'responded' from unnest(array['A','AS','B']) suffix;
insert into public.wf_retention_messages(message_id,milestone_id,recipient_user_id,provider_message_id,delivery_status)
 select 'D10QA-MSG'||suffix,'D10QA-M'||suffix,user_id,'D10QA-out-'||suffix,'sent'
 from retention_qa_actors cross join unnest(array['A','AS','B']) suffix where name='student';
insert into public.wf_retention_responses(response_id,milestone_id,message_id,recipient_user_id,provider_message_id,sender_phone,raw_response,normalized_score,normalized_state)
 select 'D10QA-R'||suffix,'D10QA-M'||suffix,'D10QA-MSG'||suffix,user_id,'D10QA-in-'||suffix,'+15555550140','PRIVATE_RAW_D10QA',3,'needs_help'
 from retention_qa_actors cross join unnest(array['A','AS','B']) suffix where name='student';
insert into public.wf_retention_cases(case_id,placement_id,milestone_id,source_response_id)
 select 'D10QA-C'||suffix,'D10QA-P'||suffix,'D10QA-M'||suffix,'D10QA-R'||suffix from unnest(array['A','AS','B']) suffix;
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'd10qa:'||name,auth_id,user_id,role,scope,scope_id,case when name='inactive' then 'pending' else 'active' end,'d10qa'
 from retention_qa_actors join (values
 ('platform','admin','platform',null),('admin','institution_admin','institution','D10QA-A'),
 ('career','career_services','institution','D10QA-A'),('coordinator','program_coordinator','program','D10QA-Program A'),
 ('instructor','instructor','cohort','D10QA-CA'),('assistant','assistant_instructor','cohort','D10QA-CA'),
 ('department','department_head','institution','D10QA-A'),('analyst','read_only_analyst','institution','D10QA-A'),
 ('other_admin','institution_admin','institution','D10QA-B'),('employer','employer_admin','employer','D10QA-E'),
 ('student','student','self','D10QA-SA'),('inactive','instructor','cohort','D10QA-CA'),('disabled','institution_admin','institution','D10QA-A'),
 ('unscoped_admin','admin','cohort','D10QA-CB'),('stitched','instructor','cohort','D10QA-CB'),
 ('bound','program_coordinator','program','D10QA-Shared'),('ambiguous','program_coordinator','program','D10QA-Shared')) v(name,role,scope,scope_id) using(name);
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'd10qa:stitched-read',auth_id,user_id,'read_only_analyst','institution','D10QA-A','active','d10qa'
 from retention_qa_actors where name='stitched';
insert into public.wf_user_invitations(invitation_id,email,role,scope_type,scope_id,institution_id,membership_key,status,expires_at,invited_by_auth_user_id,invited_by_user_id,accepted_by_auth_user_id,accepted_by_user_id,accepted_at)
 select 'D10QA-INV',email,'program_coordinator','program','D10QA-Shared','D10QA-A','d10qa:bound','accepted',now()+interval '1 day',auth_id,user_id,auth_id,user_id,now()
 from retention_qa_actors where name='bound';
update public.app_role_memberships set source='canonical_invitation:D10QA-INV' where membership_key='d10qa:bound';

update public.contractors set approval_status='approved',account_status='active' where contractor_id='D10QA-E';
update public.app_role_memberships set role='institution_admin',scope_type='institution',scope_id='D10QA-A' where membership_key='d10qa:inactive';
insert into public.app_role_memberships(membership_key,auth_user_id,user_id,role,scope_type,scope_id,status,source)
 select 'd10qa:readonly',auth_id,user_id,'employer_read_only','employer','D10QA-E','active','d10qa' from retention_qa_actors where name='analyst';
create temp table retention_qa_checks(label text);
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
 foreach actor in array array['platform','admin','career','coordinator','bound','employer'] loop
   perform pg_temp.actor(actor);
   perform pg_temp.check_true(security.placement_can_confirm_start(auth.uid(),'D10QA-PA'),actor||' scoped confirmation allowed');
 end loop;
 foreach actor in array array['instructor','assistant','department','analyst','student','inactive','disabled','spoof','unscoped_admin','stitched','ambiguous','other_admin'] loop
   perform pg_temp.actor(actor);
   perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PA'',current_date)','42501',actor||' confirmation denied');
 end loop;
 perform pg_temp.actor('coordinator');
 perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PAS'',current_date)','42501','sibling Program denied');
 perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PB'',current_date)','42501','cross Institution denied');
 perform pg_temp.actor('admin');
 perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PA'',current_date+1)','22023','future start denied');
 d:=public.institution_workforce_summary('D10QA-A');
 perform pg_temp.check_true((d->>'totalHires')::int=0,'legacy active excluded from official count');
 d:=public.placement_confirm_start('D10QA-PA',current_date-35);
 perform pg_temp.check_true(d->>'status'='active' and not (d->>'idempotent')::boolean,'legacy active explicitly confirmed');
 d:=public.placement_confirm_start('D10QA-PA',current_date-35);
 perform pg_temp.check_true((d->>'idempotent')::boolean,'same-date retry idempotent');
 perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PA'',current_date-34)','22023','changed date retry denied');
 d:=public.institution_workforce_summary('D10QA-A');
 perform pg_temp.check_true((d->>'totalHires')::int=1 and (d->>'activePlacements')::int=1,'official and active counts based on confirmation');
 d:=public.institution_program_cohort_management('D10QA-A');
 perform pg_temp.check_true((select sum((x->>'placementCount')::int) from jsonb_array_elements(d->'programs') x)=1,'Program official counts');
 perform pg_temp.actor('student');
 d:=public.student_placements_list();
 perform pg_temp.check_true((select (x->>'officialPlacement')::boolean from jsonb_array_elements(d) x where x->>'placementId'='D10QA-PA'),'Student sees confirmation evidence');
 perform pg_temp.actor(null);
 perform pg_temp.denied('select public.placement_confirm_start(''D10QA-PA'',current_date-35)','42501','missing auth denied');
end $$;
reset role;
do $$ begin
 perform pg_temp.check_true((select count(*)=1 from public.platform_audit_events where entity_id='D10QA-PA' and source='placement_confirm_start'),'one confirmation audit with retries');
 perform pg_temp.check_true((select start_confirmed_by_auth_user_id=(select auth_id from retention_qa_actors where name='admin') from public.wf_placements where placement_id='D10QA-PA'),'authenticated confirmer provenance');
 perform pg_temp.check_true((select status='responded' from public.wf_retention_milestones where milestone_id='D10QA-MA'),'retention response history preserved');
end $$;
-- A completed interview creates a pending start even for a past scheduled date.
insert into public.wf_student_profiles(student_id,user_id,school_id,cohort_id,profile_status)
 select 'D10QA-SC',user_id,'D10QA-A','D10QA-CA','active' from retention_qa_actors where name='student';
insert into public.wf_interview_requests(interview_request_id,student_id,employer_id,role_title,status)
 values('D10QA-INT','D10QA-SC','D10QA-E','QA role','completed');
set local role authenticated;
do $$ declare d jsonb; pid text; begin
 perform pg_temp.actor('employer');
 d:=public.employer_record_hire('D10QA-E','D10QA-INT','QA role',null,current_date-90,'Full-time');
 pid:=d->>'placementId';
 perform pg_temp.check_true(d->>'status'='pending_start','past scheduled start remains pending');
 perform set_config('d10qa.placement_id',pid,true);
 d:=public.employer_record_hire('D10QA-E','D10QA-INT','QA role',null,current_date-90,'Full-time');
 perform pg_temp.check_true(d->>'placementId'=pid and not (d->>'created')::boolean,'hire retry returns same placement');
 d:=public.employer_placement_detail('D10QA-E',pid);
 perform pg_temp.check_true(jsonb_array_length(d->'milestones')=3 and not (d->>'officialPlacement')::boolean,'three independent templates and no official count');
 d:=public.placement_confirm_start(pid,current_date-40);
 perform pg_temp.check_true(d->>'status'='active','Employer explicitly confirms start');
 d:=public.employer_placement_detail('D10QA-E',pid);
 perform pg_temp.check_true((d->>'officialPlacement')::boolean and (d->>'employmentStartDate')::date=current_date-40,'Employer detail confirmation');
 d:=public.employer_update_placement_status('D10QA-E',pid,'ended','QA end');
 perform pg_temp.check_true(d->>'status'='ended','end confirmed employment');
 perform pg_temp.actor('admin');
 d:=public.institution_workforce_summary('D10QA-A');
 perform pg_temp.check_true((d->>'totalHires')::int=2 and (d->>'activePlacements')::int=1,'ended confirmed employment remains historical official placement');
end $$;
reset role;
do $$ declare pid text:=current_setting('d10qa.placement_id'); begin
 perform pg_temp.check_true((select count(*)=3 from public.wf_retention_milestones where placement_id=pid),'exactly three templates after confirm/end');
 perform pg_temp.check_true((select bool_and((scheduled_for at time zone 'UTC')::date=current_date-40+day_number) from public.wf_retention_milestones where placement_id=pid),'unsent templates anchored to actual employment start');
 perform pg_temp.check_true((select bool_and(status='cancelled') from public.wf_retention_milestones where placement_id=pid),'end cancels unsent milestones independently');
 perform pg_temp.check_true((select count(*)=1 from public.wf_domain_events where event_type='PLACEMENT_CREATED' and target_id=pid),'one creation event');
 perform pg_temp.check_true(not has_function_privilege('anon','public.placement_confirm_start(text,date)','execute'),'anonymous execution revoked');
 perform pg_temp.check_true(not has_function_privilege('authenticated','public.retention_claim_due_milestones(integer)','execute'),'scheduler remains service-only');
 perform pg_temp.check_true(not has_table_privilege('authenticated','public.wf_placements','UPDATE'),'direct placement writes closed');
end $$;
-- All fixtures and audit/event writes remain inside this transaction.
select count(*) as passed_checks,jsonb_agg(label order by label) as checks from retention_qa_checks;
rollback;
