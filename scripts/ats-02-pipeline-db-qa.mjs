import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { STARTER_PIPELINE } from "../lib/employer/ats-pipelines.ts";

const baseline = readFileSync(new URL("../supabase/migrations/20261018193301_ats_01_job_listings.sql",import.meta.url),"utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261018213605_ats_02_pipeline_templates.sql",import.meta.url),"utf8");
const authA="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const authB="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const authC="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
test("ATS-02 SQL installs; version publication is immutable and employer-scoped", async () => {
  const db=new PGlite();
  try {
    await db.exec([
      "create role anon;","create role authenticated;","create role service_role;",
      "create schema security;","create schema auth;","grant usage on schema security to authenticated;",
      "create table public.users(user_id text primary key,auth_user_id uuid);",
      "create table public.contractors(contractor_id text primary key,owner_user_id text,approval_status text,account_status text);",
      "grant select on public.contractors to authenticated;",
      "create table public.wf_hiring_needs(hiring_need_id text primary key,employer_id text);",
      "create table public.app_role_memberships(user_id text,auth_user_id uuid,status text,scope_type text,scope_id text,role text);",
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.actor_auth',true),'')::uuid $$;",
      "create function security.current_legacy_user_id() returns text language sql stable security definer as $$ select current_setting('app.actor_user',true) $$;",
      "create function security.member_of_employer(p text) returns boolean language sql stable security definer as $$ select p=current_setting('app.employer',true) $$;",
      `insert into public.users values ('owner-a','${authA}'),('read-a','${authB}'),('owner-b','${authC}');`,
      "insert into public.contractors values ('employer-a',null,'approved','active'),('employer-b',null,'approved','active');",
      `insert into public.app_role_memberships values
      ('owner-a','${authA}','active','employer','employer-a','employer_owner'),
      ('read-a','${authB}','active','employer','employer-a','employer_read_only'),
      ('owner-b','${authC}','active','employer','employer-b','employer_owner');`,
    ].join("\n"));
    await db.exec(baseline);
    await db.exec(migration);
    await db.exec(`set role authenticated; set app.actor_auth='${authA}'; set app.actor_user='owner-a'; set app.employer='employer-a';`);
    const graph=JSON.stringify(STARTER_PIPELINE).replaceAll("'","''");
    const inserted=await db.query(`insert into public.wf_ats_pipeline_templates(employer_id,name,description,created_by_user_id,revision,graph_json)
      values('employer-a','Starter','', 'owner-a',999,'${graph}'::jsonb) returning id,revision`);
    assert.equal(inserted.rows.length,1);assert.equal(inserted.rows[0].revision,1);
    const id=inserted.rows[0].id;
    await assert.rejects(db.query(`insert into public.wf_ats_pipeline_versions(employer_id,template_id,version_number,source_revision,graph_json,published_by_user_id)
      values('employer-a','${id}',1,1,'${graph}'::jsonb,'owner-a')`),/permission|policy|deny/i);
    await assert.rejects(db.query(`update public.wf_ats_pipeline_templates set employer_id='employer-b' where id='${id}'`),/policy|immutable|permission/i);
    const published=await db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${id}',1) as v`);
    assert.equal(published.rows.length,1);
    assert.equal(published.rows[0].version_number,1);
    assert.equal(published.rows[0].source_revision,1);
    await assert.rejects(db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${id}',1) as v`),/unique|duplicate/i);
    await assert.rejects(db.query(`update public.wf_ats_pipeline_versions set version_number=42 where template_id='${id}'`),/permission|policy/i);
    await db.exec(`set app.actor_auth='${authB}';set app.actor_user='read-a';`);
    const unauth=await db.query(`update public.wf_ats_pipeline_templates set name='Forged' where id='${id}' returning id`);
    assert.equal(unauth.rows.length,0);
    await assert.rejects(db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${id}',1) as v`),/publication requires|permission/i);
    await db.exec(`set app.actor_auth='${authC}';set app.actor_user='owner-b';set app.employer='employer-b';`);
    const other=await db.query(`select id from public.wf_ats_pipeline_templates where id='${id}'`);
    assert.equal(other.rows.length,0);
    await assert.rejects(db.query(`select v.* from public.wf_ats_publish_pipeline('employer-b','${id}',1) as v`),/not found|unauthorized/i);
    await db.exec(`set app.actor_auth='${authA}';set app.actor_user='owner-a';set app.employer='employer-a';`);
    const bad=JSON.stringify({ ...STARTER_PIPELINE, edges: [] }).replaceAll("'","''");
    await db.query(`update public.wf_ats_pipeline_templates set graph_json='${bad}'::jsonb where id='${id}'`);
    await assert.rejects(db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${id}',2) as v`),/Invalid pipeline graph/i);
    const versionCount=await db.query(`select count(*)::int as n from public.wf_ats_pipeline_versions where template_id='${id}'`);
    assert.equal(versionCount.rows[0].n,1);
  } finally { await db.close(); }
});
