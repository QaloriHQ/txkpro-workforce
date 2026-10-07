import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/staging/migrations/20261007010000_workforce_authenticate_workspace.sql',import.meta.url),'utf8');
const checkr=readFileSync(new URL('../supabase/staging/migrations/20261006225000_workforce_checkr_sandbox.sql',import.meta.url),'utf8');
const subject=checkr.slice(checkr.indexOf('create function security.checkr_subject'),checkr.indexOf('-- Session-derived'));
const owner='00000000-0000-4000-8000-000000000001',reviewer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',student='00000000-0000-4000-8000-000000000004';
async function fixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema security;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
 create table users(user_id text unique not null,auth_user_id uuid,email text,first_name text,last_name text,status text);
 alter table users add column id uuid primary key default gen_random_uuid();
 create table contractors(contractor_id text primary key,approval_status text,account_status text,business_name text);
 create table wf_institutions(institution_id text primary key,active boolean,name text);
 create table app_role_memberships(user_id text,auth_user_id uuid,scope_type text,scope_id text,status text,role text);
 create table wf_student_profiles(student_id text,user_id text,school_id text);
 create table wf_referrals(student_id text,employer_id text,institution_id text,hiring_need_id text,status text);
 create table wf_hiring_needs(hiring_need_id text,assigned_hiring_manager_user_id text);
 create table wf_reward_audit(actor text,owner_type text,owner_id text,event text,target text);
 create table wf_screening_permissions(employer_id text,user_id text,can_order boolean,can_review boolean,monthly_limit_cents integer,approval_above_cents integer);
 create function security.pro_actor() returns text language sql as $$select user_id from public.users where auth_user_id=auth.uid() and status='active'$$;
 create function security.student_referral_consent_status(s text,i text) returns jsonb language sql as $$select jsonb_build_object('allowed',current_setting('test.consent',true)<>'no')$$;
 ${subject}
 insert into users(user_id,auth_user_id,email,first_name,last_name,status) values('owner','${owner}','owner@example.test','Owner','One','active'),('reviewer','${reviewer}','r@example.test','Reviewer','One','active'),('other','${other}','o@example.test','Other','One','active'),('student','${student}','s@example.test','Student','One','active');
 insert into contractors values('tenant','approved','active','Named Employer'),('other','approved','active','Foreign Employer');insert into wf_institutions values('school',true,'College'),('other-school',true,'Foreign College');
 insert into app_role_memberships values('owner','${owner}','employer','tenant','active','employer_owner'),('reviewer','${reviewer}','employer','tenant','active','recruiter'),('other','${other}','employer','other','active','employer_owner'),('student','${student}','employer','tenant','active','employer_employee'),('owner','${owner}','institution','school','active','institution_admin'),('reviewer','${reviewer}','institution','school','active','instructor'),('other','${other}','institution','other-school','active','institution_admin');
 insert into wf_student_profiles values('stu','student','school');insert into wf_screening_permissions values('tenant','owner',true,true,10000,5000),('tenant','reviewer',true,true,10000,5000);
 `);await db.exec(sql);
 await db.exec(readFileSync(new URL('../supabase/staging/migrations/20261007011500_workforce_authenticate_indexes.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/staging/migrations/20261007212241_workforce_authcard.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/staging/migrations/20261007221529_workforce_screening_policy.sql',import.meta.url),'utf8'));
 const svc=async input=>{await db.exec('reset role;set role service_role');return (await db.query('select public.auth_screening_service($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const auth=async(input,id=owner)=>{await db.exec(`reset role;select set_config('test.auth','${id}',false);set role authenticated`);return (await db.query('select public.auth_screening_authority($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const card=async(input,id=student)=>{await db.exec(`reset role;select set_config('test.auth','${id}',false);set role authenticated`);return (await db.query('select public.authcard_self($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const cardSvc=async input=>{await db.exec('reset role;set role service_role');return (await db.query('select public.authcard_service($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 return {db,svc,auth,card,cardSvc};
}
const scope={ownerType:'employer',ownerId:'tenant'};
async function policy(f,input={},id=owner){await f.db.exec(`reset role;select set_config('test.auth','${id}',false);set role authenticated`);return (await f.db.query('select public.screening_policy($1::jsonb) result',[JSON.stringify({...scope,op:'policy',...input})])).rows[0].result;}
async function accept(f){const p=await policy(f);return policy(f,{op:'policy_accept',policyId:p.policyId,version:p.version,hash:p.hash,affirmative:true});}
const q={...scope,op:'quote',actor:'owner',subject:'student',audience:'employee',products:['employment'],providerCents:500,platformCents:500,thirdPartyCents:0,totalCents:1000,pricingVersion:'authenticate-public-usd-mock-2026-10-06-v1',paymentConfiguration:'pmc_test',requestKey:'10000000-0000-4000-8000-000000000001',purpose:'fraud_prevention',transactionCertified:true,nonEligibilityCertified:true};
test('policy denies anonymous, foreign, nonmanager acceptance and private/legacy access',async()=>{const f=await fixture();try{
 assert.equal((await policy(f)).state,'required');await assert.rejects(policy(f,{},other),/denied/);await assert.rejects(policy(f,{op:'policy_accept',affirmative:true},reviewer),/administrator/);
 await f.db.exec('reset role;set role anon');await assert.rejects(f.db.query("select public.screening_policy('{}')"),/permission denied/);
 await f.db.exec('reset role;set role service_role');await assert.rejects(f.db.query("select public.screening_policy('{}')"),/permission denied/);await assert.rejects(f.db.query('select * from security.wf_screening_policy_acceptances'),/permission denied/);await assert.rejects(f.db.query("select public.auth_screening_service_authcard('{}')"),/permission denied/);
 }finally{await f.db.close();}});
test('explicit current version/hash acceptance is idempotent and creates complete immutable audit',async()=>{const f=await fixture();try{
 const p=await policy(f);await assert.rejects(policy(f,{op:'policy_accept',policyId:p.policyId,version:p.version,hash:p.hash,affirmative:'true'}),/affirm/);await assert.rejects(policy(f,{op:'policy_accept',policyId:p.policyId,version:p.version,hash:'stale',affirmative:true}),/affirm/);
 const a=await accept(f);assert.equal(a.state,'accepted');const b=await accept(f);assert.equal(b.history.length,1);assert.equal(a.history[0].hash,p.hash);
 await f.db.exec('reset role');const rows=(await f.db.query("select payload from wf_reward_audit where event='EMPLOYER_SCREENING_POLICY_ACCEPTED'")).rows;assert.equal(rows.length,1);for(const k of ['actor_user_id','employer_id','policy_id','policy_version','accepted_at','scope','result','correlation_id'])assert.ok(rows[0].payload[k]);
 await assert.rejects(f.db.exec("update security.wf_screening_policy_acceptances set actor_user_id='other'"),/immutable/);await assert.rejects(f.db.exec("delete from security.wf_screening_policy_versions"),/immutable/);
 }finally{await f.db.close();}});
test('new policy version requires fresh acceptance without rewriting history',async()=>{const f=await fixture();try{
 const old=await accept(f);await f.db.exec("reset role;insert into security.wf_screening_policy_versions(policy_id,version,title,body) values('employer-screening',2,'New','New policy');update security.wf_screening_policy_current set version=2");assert.equal((await policy(f)).state,'superseded');await assert.rejects(f.svc(q),/policy acceptance/);
 const next=await accept(f);assert.equal(next.state,'accepted');assert.equal(next.history.length,2);assert.equal(next.history[1].body,old.body);
 }finally{await f.db.close();}});
test('revocation and administrator role loss block service quote, checkout and every claim',async()=>{const f=await fixture();try{
 await assert.rejects(f.svc(q),/policy acceptance/);const p=await accept(f);const o=await f.svc(q);
 const v=await policy(f,{op:'policy_revoke',acceptanceId:p.history[0].id});assert.equal(v.state,'revoked');await policy(f,{op:'policy_revoke',acceptanceId:p.history[0].id});
 for(const op of ['checkout','claim','approve'])await assert.rejects(f.svc({...scope,op,actor:'owner',orderId:o.id,product:'employment'}),/policy acceptance/);
 const again=await accept(f);assert.equal(again.history.length,2);assert.equal(again.state,'accepted');await f.db.exec("reset role;update app_role_memberships set status='revoked' where user_id='owner' and scope_type='employer'");await assert.rejects(f.svc(q),/policy acceptance/);assert.equal((await policy(f,{},reviewer)).state,'revoked');
 }finally{await f.db.close();}});
test('Employer acceptance never substitutes for exact Candidate authorization or ordering permissions',async()=>{const f=await fixture();try{
 await accept(f);const o=await f.svc(q);await assert.rejects(f.svc({...scope,op:'checkout',actor:'owner',orderId:o.id}),/Candidate AuthCard/);
 const r=(await f.card({op:'workspace'})).requests[0];await f.db.exec("reset role;update security.wf_authcards set status='verified',adult_verified=true,payment_status='paid',details_encrypted='fixture' where user_id='student'");await f.card({op:'share',requestId:r.id});const latest=(await f.card({op:'workspace'})).requests[0];await f.card({op:'authorize',requestId:r.id,version:latest.version,accepted:latest.parties.map(p=>p.id)});assert.equal((await f.svc({...scope,op:'checkout',actor:'owner',orderId:o.id})).id,o.id);
 await f.db.exec("reset role;update security.wf_auth_permissions set can_order=false where user_id='owner'");await assert.rejects(f.svc({...q,requestKey:'10000000-0000-4000-8000-000000000002'}),/Quote denied/);
 }finally{await f.db.close();}});
