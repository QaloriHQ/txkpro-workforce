import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {STARTER_PIPELINE} from "../lib/employer/ats-pipelines.ts";

const migrations=[
  "20261018193301_ats_01_job_listings.sql","20261018213605_ats_02_pipeline_templates.sql",
  "20261018213618_ats_02_job_publication.sql","20261018213747_ats_02_fk_indexes.sql",
  "20261018214455_ats_02_rpc_invoker.sql","20261027043057_ats_02_stage_graph_v2.sql",
  "20261101090000_ats_03_invitations_lifecycle.sql",
].map(name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"));
const ids={owner:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",candidate:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",other:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",reader:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"};
const literal=value=>JSON.stringify(value).replaceAll("'","''");

test("ATS-03 pins applications, isolates candidates and audits guarded lifecycle actions",async()=>{const db=new PGlite();try{
  await db.exec([
    "create role anon;","create role authenticated;","create role service_role;","create schema security;","create schema auth;","grant usage on schema security to authenticated;",
    "create table public.users(user_id text primary key,auth_user_id uuid);",
    "create table public.contractors(contractor_id text primary key,owner_user_id text,approval_status text,account_status text,business_name text);",
    "grant select on public.contractors to authenticated;",
    "create table public.wf_hiring_needs(hiring_need_id text primary key,employer_id text);",
    "create table public.app_role_memberships(user_id text,auth_user_id uuid,status text,scope_type text,scope_id text,role text);",
    "create table auth.users(id uuid primary key);",
    "create table public.wf_student_profiles(user_id text,student_id text unique);",
    "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.actor_auth',true),'')::uuid$$;",
    "create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('app.email',true))$$;",
    "create function security.current_legacy_user_id() returns text language sql stable security definer as $$select nullif(current_setting('app.actor_user',true),'')$$;",
    "create function security.member_of_employer(p text) returns boolean language sql stable security definer as $$select p=current_setting('app.employer',true)$$;",
    `insert into public.users values('owner-a','${ids.owner}'),('candidate-a','${ids.candidate}'),('other-a','${ids.other}'),('reader-a','${ids.reader}');`,
    `insert into auth.users values('${ids.owner}'),('${ids.candidate}'),('${ids.other}'),('${ids.reader}');`,
    "insert into public.contractors values('employer-a',null,'approved','active','Employer A'),('employer-b',null,'approved','active','Employer B');",
    `insert into public.app_role_memberships values('owner-a','${ids.owner}','active','employer','employer-a','employer_owner'),('candidate-a','${ids.candidate}','active','platform',null,'student'),('other-a','${ids.other}','active','platform',null,'student'),('reader-a','${ids.reader}','active','employer','employer-a','employer_read_only');`,
    "insert into public.wf_student_profiles values('candidate-a','student-a'),('other-a','student-b');",
  ].join("\n"));
  for(const migration of migrations)await db.exec(migration);
  await db.exec(`set role authenticated;set app.actor_auth='${ids.owner}';set app.actor_user='owner-a';set app.employer='employer-a';set app.email='owner@example.com';`);
  const graph=literal(STARTER_PIPELINE);
  const template=(await db.query(`insert into public.wf_ats_pipeline_templates(employer_id,name,graph_json,created_by_user_id) values('employer-a','Standard','${graph}'::jsonb,'owner-a') returning id`)).rows[0];
  const version=(await db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${template.id}',1) v`)).rows[0];
  const job=(await db.query("insert into public.wf_ats_job_listings(employer_id,created_by_user_id,title,description,location_city,location_state) values('employer-a','owner-a','Electrician','Install and maintain systems','Texarkana','TX') returning id,job_listing_id")).rows[0];
  await db.query(`select * from public.wf_ats_publish_job('employer-a','${job.id}','${version.id}',1)`);
  const invite=(await db.query(`select i.* from public.wf_ats_candidate_invitation_create('employer-a','${job.id}','candidate@example.com','student-a') i`)).rows[0];
  assert.equal(invite.status,"pending");
  await db.exec(`set app.actor_auth='${ids.candidate}';set app.actor_user='candidate-a';set app.email='candidate@example.com';set app.employer='';`);
  const submitted=(await db.query(`select a.* from public.wf_ats_application_submit('${job.job_listing_id}','${invite.id}','{"experience":"Two years"}'::jsonb,'ats-applicant-privacy-v1') a`)).rows[0];
  assert.equal(submitted.status,"submitted");assert.equal(submitted.pipeline_version_id,version.id);assert.equal(submitted.student_id,"student-a");
  const candidateTasks=await db.query(`select status,due_at,candidate_visible from public.wf_ats_application_tasks where application_id='${submitted.id}' order by created_at`);
  assert.equal(candidateTasks.rows.length,1);assert.ok(candidateTasks.rows.every(row=>row.candidate_visible&&row.due_at===null));assert.ok(candidateTasks.rows.some(row=>row.status==="submitted"));
  assert.equal((await db.query(`select status from public.wf_ats_candidate_invitations where id='${invite.id}'`)).rows[0].status,"accepted");
  await assert.rejects(db.query(`select * from public.wf_ats_application_submit('${job.job_listing_id}',null,'{"experience":"Again"}'::jsonb,'ats-applicant-privacy-v1')`),/already exists/i);
  await db.exec(`set app.actor_auth='${ids.other}';set app.actor_user='other-a';set app.email='other@example.com';`);
  assert.equal((await db.query(`select id from public.wf_ats_applications where id='${submitted.id}'`)).rows.length,0);
  assert.equal((await db.query(`select id from public.wf_ats_application_tasks where application_id='${submitted.id}'`)).rows.length,0);
  await db.exec(`set app.actor_auth='${ids.reader}';set app.actor_user='reader-a';set app.email='reader@example.com';set app.employer='employer-a';`);
  await assert.rejects(db.query(`select * from public.wf_ats_application_employer_close('employer-a','${submitted.id}',1,'Not selected')`),/denied/i);
  await db.exec(`set app.actor_auth='${ids.owner}';set app.actor_user='owner-a';set app.email='owner@example.com';`);
  const employerView=await db.query(`select id from public.wf_ats_applications where id='${submitted.id}'`);assert.equal(employerView.rows.length,1);
  const reviewTask=(await db.query(`select id,revision,status from public.wf_ats_application_tasks where application_id='${submitted.id}' and owner_role<>'candidate' limit 1`)).rows[0];
  const transitioned=(await db.query(`select t.* from public.wf_ats_employer_task_transition('employer-a','${reviewTask.id}',${reviewTask.revision},'in_progress','Review assigned') t`)).rows[0];assert.equal(transitioned.status,"in_progress");
  await db.exec(`set app.actor_auth='${ids.candidate}';set app.actor_user='candidate-a';set app.email='candidate@example.com';set app.employer='';`);
  const withdrawn=(await db.query(`select a.* from public.wf_ats_application_withdraw('${submitted.id}',1,'Accepted another opportunity') a`)).rows[0];assert.equal(withdrawn.status,"withdrawn");
  await assert.rejects(db.query(`select * from security.wf_ats_application_audit where application_id='${submitted.id}'`),/permission denied/i);
  await db.exec("reset role");
  assert.ok((await db.query(`select count(*)::int n from security.wf_ats_application_audit where application_id='${submitted.id}'`)).rows[0].n>=4);
}finally{await db.close();}});

