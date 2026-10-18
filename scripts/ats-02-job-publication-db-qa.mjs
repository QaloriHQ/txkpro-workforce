import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { STARTER_PIPELINE } from "../lib/employer/ats-pipelines.ts";

const files = [
  "../supabase/migrations/20261018193301_ats_01_job_listings.sql",
  "../supabase/migrations/20261018213605_ats_02_pipeline_templates.sql",
  "../supabase/migrations/20261018213618_ats_02_job_publication.sql",
].map(path => readFileSync(new URL(path, import.meta.url),"utf8"));
const ids = {
  owner:"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  reader:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  other:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const sqlLiteral = (value) => JSON.stringify(value).replaceAll("'","''");
test("ATS-02 publication: RLS, same-employer version, state and curated projection", async () => {
  const db = new PGlite();
  try {
    await db.exec([
      "create role anon;", "create role authenticated;", "create role service_role;",
      "create schema security;", "create schema auth;", "grant usage on schema security to authenticated;",
      "create table public.users(user_id text primary key,auth_user_id uuid);",
      "create table public.contractors(contractor_id text primary key,owner_user_id text,approval_status text,account_status text,business_name text);",
      "grant select on public.contractors to authenticated;",
      "create table public.wf_hiring_needs(hiring_need_id text primary key,employer_id text);",
      "create table public.app_role_memberships(user_id text,auth_user_id uuid,status text,scope_type text,scope_id text,role text);",
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.actor_auth',true),'')::uuid $$;",
      "create function security.current_legacy_user_id() returns text language sql stable security definer as $$ select current_setting('app.actor_user',true) $$;",
      "create function security.member_of_employer(p text) returns boolean language sql stable security definer as $$ select p=current_setting('app.employer',true) $$;",
      `insert into public.users values ('owner-a','${ids.owner}'),('reader-a','${ids.reader}'),('owner-b','${ids.other}');`,
      "insert into public.contractors values ('employer-a',null,'approved','active','Employer A'),('employer-b',null,'approved','active','Employer B');",
      `insert into public.app_role_memberships values
      ('owner-a','${ids.owner}','active','employer','employer-a','employer_owner'),
      ('reader-a','${ids.reader}','active','employer','employer-a','employer_read_only'),
      ('owner-b','${ids.other}','active','employer','employer-b','employer_owner');`,
    ].join("\n"));
    for (const migration of files) await db.exec(migration);
    await db.exec(`set role authenticated; set app.actor_auth='${ids.owner}';set app.actor_user='owner-a';set app.employer='employer-a';`);
    const graph = sqlLiteral(STARTER_PIPELINE);
    const t1 = await db.query(`insert into public.wf_ats_pipeline_templates(employer_id,name,graph_json,created_by_user_id)
      values ('employer-a','Standard', '${graph}'::jsonb,'owner-a') returning id`);
    const templateId = t1.rows[0].id;
    const v1=await db.query(`select v.* from public.wf_ats_publish_pipeline('employer-a','${templateId}',1) as v`);
    assert.equal(v1.rows.length,1);
    const versionId=v1.rows[0].id;
    const draft=await db.query(`insert into public.wf_ats_job_listings(employer_id,created_by_user_id,title,description,location_city,location_state,application_instructions)
      values ('employer-a','owner-a','Electrician','Install electrical wiring','Texarkana','TX','Private instructions')
      returning id,revision,job_listing_id`);
    const job=draft.rows[0];
    await assert.rejects(db.query(`update public.wf_ats_job_listings set pipeline_version_id='${versionId}' where id='${job.id}'`),/pipeline version|Draft jobs/i);
    await assert.rejects(db.query(`select j.* from public.wf_ats_publish_job('employer-a','${job.id}','00000000-0000-4000-8000-000000000001',1) j`),/pipeline|employer/i);
    const published=await db.query(`select j.* from public.wf_ats_publish_job('employer-a','${job.id}','${versionId}',1) j`);
    assert.equal(published.rows[0].status,'published');
    assert.equal(published.rows[0].pipeline_version_id,versionId);
    assert.equal(published.rows[0].revision,2);
    const projection=await db.query(`select * from public.wf_ats_public_jobs where job_listing_id='${job.job_listing_id}'`);
    assert.equal(projection.rows.length,1);
    assert.equal(projection.rows[0].title,'Electrician');
    assert.equal(projection.rows[0].employer_display_name,'Employer A');
    assert.equal(Object.hasOwn(projection.rows[0],'application_instructions'),false);
    assert.equal(Object.hasOwn(projection.rows[0],'employer_id'),false);
    await assert.rejects(db.query(`select j.* from public.wf_ats_publish_job('employer-a','${job.id}','${versionId}',1) j`),/conflict|not a draft/i);
    await assert.rejects(db.query(`update public.wf_ats_job_listings set pipeline_version_id=null where id='${job.id}'`),/binding/i);
    await assert.rejects(db.query(`update public.wf_ats_job_listings set title='Changed' where id='${job.id}'`),/content/i);
    await db.query(`update public.wf_ats_job_listings set status='paused' where id='${job.id}'`);
    assert.equal((await db.query(`select count(*)::int n from public.wf_ats_public_jobs`)).rows[0].n,0);
    await db.query(`update public.wf_ats_job_listings set status='published' where id='${job.id}'`);
    assert.equal((await db.query(`select count(*)::int n from public.wf_ats_public_jobs`)).rows[0].n,1);
    await db.query(`update public.wf_ats_job_listings set status='closed' where id='${job.id}'`);
    assert.equal((await db.query(`select count(*)::int n from public.wf_ats_public_jobs`)).rows[0].n,0);
    await assert.rejects(db.query(`update public.wf_ats_job_listings set status='published' where id='${job.id}'`),/Invalid ATS job status transition/);
    await db.exec(`set app.actor_auth='${ids.reader}';set app.actor_user='reader-a';`);
    await assert.rejects(db.query(`select j.* from public.wf_ats_publish_job('employer-a','${job.id}','${versionId}',1) j`),/Owner\/Admin|required/i);
    const denied=await db.query(`update public.wf_ats_job_listings set status='archived' where id='${job.id}' returning id`);
    assert.equal(denied.rows.length,0);
    await db.exec(`set app.actor_auth='${ids.other}';set app.actor_user='owner-b';set app.employer='employer-b';`);
    assert.equal((await db.query(`select count(*)::int n from public.wf_ats_job_listings where id='${job.id}'`)).rows[0].n,0);
    await assert.rejects(db.query(`select j.* from public.wf_ats_publish_job('employer-b','${job.id}','${versionId}',1) j`),/pipeline|employer/i);
    await db.exec("reset role; set role anon;");
    assert.equal((await db.query("select count(*)::int n from public.wf_ats_public_jobs")).rows[0].n,0);
    await assert.rejects(db.query("select * from public.wf_ats_job_listings"),/permission denied/i);
    await assert.rejects(db.query("insert into public.wf_ats_public_jobs(job_listing_id,title) values ('forged','forged')"),/permission denied/i);
  } finally { await db.close(); }
});
