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
 const svc=async input=>{await db.exec('reset role;set role service_role');return (await db.query('select public.auth_screening_service($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const auth=async(input,id=owner)=>{await db.exec(`reset role;select set_config('test.auth','${id}',false);set role authenticated`);return (await db.query('select public.auth_screening_authority($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const card=async(input,id=student)=>{await db.exec(`reset role;select set_config('test.auth','${id}',false);set role authenticated`);return (await db.query('select public.authcard_self($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 const cardSvc=async input=>{await db.exec('reset role;set role service_role');return (await db.query('select public.authcard_service($1::jsonb) result',[JSON.stringify(input)])).rows[0].result;};
 return {db,svc,auth,card,cardSvc};
}
const scope={ownerType:'employer',ownerId:'tenant'};
const q={...scope,op:'quote',actor:'owner',subject:'student',audience:'employee',products:['employment'],providerCents:500,platformCents:500,thirdPartyCents:0,totalCents:1000,pricingVersion:'authenticate-public-usd-mock-2026-10-06-v1',paymentConfiguration:'pmc_test',requestKey:'10000000-0000-4000-8000-000000000001',purpose:'fraud_prevention',transactionCertified:true,nonEligibilityCertified:true};
async function verified(f){
 await f.card({op:'workspace'});
 await f.db.exec("reset role;update security.wf_authcards set status='verified',adult_verified=true,payment_status='paid',details_encrypted='encrypted-test-only',display_name='Candidate' where user_id='student'");
}
async function authorize(f){const r=(await f.card({op:'workspace'})).requests[0];await f.card({op:'share',requestId:r.id});const current=(await f.card({op:'workspace'})).requests[0];await f.card({op:'authorize',requestId:r.id,version:current.version,accepted:current.parties.map(p=>p.id)});return r.id;}
test('KYU private state: anonymous, foreign subject, direct service and legacy writes denied',async()=>{
 const f=await fixture();try{
  const v=await f.card({op:'workspace'});assert.equal(v.actor,'student');assert.equal(v.status,'not_started');assert.ok(!JSON.stringify(v).includes('details_encrypted'));
  await f.db.exec('reset role;set role anon');await assert.rejects(f.db.query("select public.authcard_self('{}')"),/permission denied/);
  await f.db.exec('reset role;set role authenticated');await assert.rejects(f.db.query("select public.authcard_service('{}')"),/permission denied/);await assert.rejects(f.db.query('select * from security.wf_authcards'),/permission denied/);
  await f.db.exec('reset role;set role service_role');await assert.rejects(f.db.query("select public.auth_screening_service_legacy('{}')"),/permission denied/);
  await assert.rejects(f.cardSvc({op:'identity_observe',actor:'other',sessionId:'vs_fake',status:'verified',adult:true}),/not found/);
 }finally{await f.db.close();}
});
test('one-time payment and identity leases bind exact provider sessions; adult proof mandatory',async()=>{
 const f=await fixture();try{
  await f.card({op:'workspace'});
  await f.cardSvc({op:'details',actor:'student',encrypted:'x'.repeat(40),name:'Candidate'});
  await assert.rejects(f.cardSvc({op:'identity_claim',actor:'student'}),/Paid/);
  const p=await f.cardSvc({op:'payment_claim',actor:'student'});
  await assert.rejects(f.cardSvc({op:'payment_claim',actor:'student'}),/reconcile/);
  await assert.rejects(f.cardSvc({op:'payment_bind',actor:'student',sessionId:'cs_test',lease:'20000000-0000-4000-8000-000000000001'}),/binding/);
  await f.cardSvc({op:'payment_bind',actor:'student',sessionId:'cs_test',lease:p.payment_lease});
  await assert.rejects(f.cardSvc({op:'payment_observe',actor:'student',sessionId:'cs_other',status:'paid'}),/denied/);
  await f.cardSvc({op:'payment_observe',actor:'student',sessionId:'cs_test',status:'paid'});
  const c=await f.cardSvc({op:'identity_claim',actor:'student'});
  await f.cardSvc({op:'identity_bind',actor:'student',sessionId:'vs_test',lease:c.identity_lease});
  await f.cardSvc({op:'identity_observe',actor:'student',sessionId:'vs_test',status:'verified',adult:false});assert.equal((await f.card({op:'workspace'})).status,'cancelled');
  await f.cardSvc({op:'identity_observe',actor:'student',sessionId:'vs_test',status:'verified',adult:true});assert.equal((await f.card({op:'workspace'})).status,'verified');
  await f.card({op:'deactivate'});await f.cardSvc({op:'identity_observe',actor:'student',sessionId:'vs_test',status:'verified',adult:true});assert.equal((await f.card({op:'workspace'})).status,'revoked');
 }finally{await f.db.close();}
});
test('certifications precede sharing; owner-controlled consent is complete, versioned and order-bound',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.svc({...q,nonEligibilityCertified:false}),/certifications/);
  const o=await f.svc(q);
  await assert.rejects(f.svc({...q,purpose:'claims_liability'}),/binding/);
  const r=(await f.card({op:'workspace'})).requests[0];assert.equal(r.name,'Named Employer');
  await assert.rejects(f.card({op:'share',requestId:r.id}),/Verified/);
  await verified(f);
  await assert.rejects(f.card({op:'share',requestId:r.id},other),/denied/);
  await f.card({op:'share',requestId:r.id});
  await assert.rejects(f.svc({...scope,op:'checkout',actor:'owner',orderId:o.id}),/authorization/);
  const current=(await f.card({op:'workspace'})).requests[0];
  await assert.rejects(f.card({op:'authorize',requestId:r.id,version:'stale',accepted:current.parties.map(p=>p.id)}),/Consent changed/);
  await assert.rejects(f.card({op:'authorize',requestId:r.id,version:current.version,accepted:['txkpro']}),/All consent/);
  await f.card({op:'authorize',requestId:r.id,version:current.version,accepted:current.parties.map(p=>p.id)});
  assert.equal((await f.card({op:'workspace'})).requests[0].consent,'authorized');
  const lease=await f.svc({...scope,op:'checkout',actor:'owner',orderId:o.id});assert.ok(lease.checkout_lease);
 }finally{await f.db.close();}
});
test('revocation, changed disclosures and reversed KYU payment block every provider claim',async()=>{
 const f=await fixture();try{
  const o=await f.svc(q);await verified(f);const requestId=await authorize(f);
  const p=await f.svc({...scope,op:'checkout',actor:'owner',orderId:o.id});
  await f.svc({...scope,op:'session',orderId:o.id,sessionId:'cs_order',lease:p.checkout_lease});
  await f.svc({op:'payment',orderId:o.id,sessionId:'cs_order',kind:'paid',eventId:'evt_order'});
  await f.db.exec("reset role;update security.wf_authcard_consent_policy set version=2 where id='authenticate'");
  await assert.rejects(f.svc({...scope,op:'claim',actor:'owner',orderId:o.id,product:'employment'}),/authorization/);
  await f.db.exec("reset role;update security.wf_authcard_consent_policy set version=1 where id='authenticate';update security.wf_authcards set payment_status='hold' where user_id='student'");
  await assert.rejects(f.svc({...scope,op:'claim',actor:'owner',orderId:o.id,product:'employment'}),/authorization/);
  await f.db.exec("reset role;update security.wf_authcards set payment_status='paid' where user_id='student'");
  await f.card({op:'revoke',requestId});
  await assert.rejects(f.svc({...scope,op:'claim',actor:'owner',orderId:o.id,product:'employment'}),/authorization/);
  await assert.rejects(f.card({op:'share',requestId}),/Verified/);
  await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from security.wf_authcard_authorizations')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('named workspace receives only shared platform status; foreign workspace denied',async()=>{
 const f=await fixture();try{
  const o=await f.svc(q);await verified(f);
  await f.auth({...scope,op:'workspace'});
  const read=async()=> (await f.db.query('select public.authcard_order_status($1::jsonb) v',[JSON.stringify(scope)])).rows[0].v;
  assert.equal((await read())[o.id].verified,false);
  const requestId=await authorize(f);await f.auth({...scope,op:'workspace'});const view=await read();assert.equal(view[o.id].verified,true);assert.ok(!JSON.stringify(view).includes('encrypted-test-only'));assert.ok(!JSON.stringify(view).includes('Candidate'));
  await f.card({op:'revoke',requestId});await f.auth({...scope,op:'workspace'});assert.equal((await read())[o.id].verified,false);
  await f.db.exec(`reset role;select set_config('test.auth','${other}',false);set role authenticated`);await assert.rejects(read(),/access denied/);
 }finally{await f.db.close();}
});
