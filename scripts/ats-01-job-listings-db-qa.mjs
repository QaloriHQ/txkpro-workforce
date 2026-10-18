import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/20261018193301_ats_01_job_listings.sql", import.meta.url), "utf8");

test("ATS-01 migration installs and enforces private draft boundaries in Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec([
      "create role anon;",
      "create role authenticated;",
      "create role service_role;",
      "create schema security;",
      "create schema auth;",
      "grant usage on schema security to authenticated;",
      "create table public.users(user_id text primary key, auth_user_id uuid);",
      "create table public.contractors(contractor_id text primary key, owner_user_id text, approval_status text, account_status text);",
      "grant select on public.contractors to authenticated;",
      "create table public.wf_hiring_needs(hiring_need_id text primary key, employer_id text);",
      "create table public.app_role_memberships(user_id text, auth_user_id uuid, status text, scope_type text, scope_id text, role text);",
      "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.actor_auth', true),'')::uuid $$;",
      "create function security.current_legacy_user_id() returns text language sql stable security definer as $$ select current_setting('app.actor_user', true) $$;",
      "create function security.member_of_employer(p text) returns boolean language sql stable security definer as $$ select p = current_setting('app.employer', true) $$;",
      "insert into public.users values ('user-a','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),('user-b','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),('user-c','cccccccc-cccc-4ccc-8ccc-cccccccccccc');",
      "insert into public.contractors values ('employer-a',null,'approved','active'),('employer-b',null,'approved','active');",
      "insert into public.app_role_memberships values ('user-a','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','active','employer','employer-a','recruiter'),('user-b','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','active','employer','employer-a','employer_read_only'),('user-c','cccccccc-cccc-4ccc-8ccc-cccccccccccc','active','employer','employer-a','employer_admin');",
    ].join("\n"));
    await db.exec(migration);
    await db.exec([
      "set role authenticated;",
      "set app.actor_auth = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';",
      "set app.actor_user = 'user-a';",
      "set app.employer = 'employer-a';",
    ].join("\n"));

    const inserted = await db.query(
      "insert into public.wf_ats_job_listings(employer_id,created_by_user_id,title,revision) values ('employer-a','user-a','Apprentice',999) returning id,job_listing_id,revision,status",
    );
    assert.equal(inserted.rows.length, 1);
    const created = inserted.rows[0];
    assert.equal(created.revision, 1);
    assert.equal(created.status, "draft");
    assert.match(created.job_listing_id, /^JOB-/);

    const updated = await db.query(
      "update public.wf_ats_job_listings set title='Lead Apprentice', revision=999 where employer_id='employer-a' returning revision",
    );
    assert.equal(updated.rows[0].revision, 2);

    await assert.rejects(
      db.query("insert into public.wf_ats_job_listings(employer_id,created_by_user_id,title) values ('employer-b','user-a','Foreign')"),
    );
    await assert.rejects(
      db.query("update public.wf_ats_job_listings set status='published' where employer_id='employer-a'"),
    );
    await assert.rejects(
      db.query("insert into public.wf_ats_job_listings(employer_id,created_by_user_id,title,source_job_listing_id) values ('employer-a','user-a','Forged', '00000000-0000-4000-8000-000000000001')"),
    );
    await db.exec([
      "set app.actor_auth = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';",
      "set app.actor_user = 'user-c';",
    ].join("\n"));
    const archived = await db.query(
      "update public.wf_ats_job_listings set status='archived' where employer_id='employer-a' returning status,revision",
    );
    assert.equal(archived.rows[0].status, "archived");
    assert.equal(archived.rows[0].revision, 3);
    await assert.rejects(
      db.query("update public.wf_ats_job_listings set status='draft' where employer_id='employer-a'"),
      /ATS-01 only permits draft to archived/,
    );
    const stillArchived = await db.query("select status from public.wf_ats_job_listings where employer_id='employer-a'");
    assert.equal(stillArchived.rows[0].status, "archived");
    await db.exec([
      "set app.actor_auth = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';",
      "set app.actor_user = 'user-b';",
    ].join("\n"));
    const readable = await db.query("select title from public.wf_ats_job_listings where employer_id='employer-a'");
    assert.equal(readable.rows.length, 1);
    // RLS often turns unauthorized UPDATE into zero affected rows, not an
    // exception; both behaviors must leave the record unchanged.
    const denied = await db.query("update public.wf_ats_job_listings set title='Tampered' where employer_id='employer-a' returning id");
    assert.equal(denied.rows.length, 0);
    const unchanged = await db.query("select title from public.wf_ats_job_listings where employer_id='employer-a'");
    assert.equal(unchanged.rows[0].title, "Lead Apprentice");

    await db.exec("set role anon;");
    const publicJobs = await db.query("select job_listing_id from public.wf_ats_public_jobs");
    assert.equal(publicJobs.rows.length, 0);
    await assert.rejects(db.query("select id from public.wf_ats_job_listings"));
  } finally {
    await db.close();
  }
});
