import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const socialMigration = readFileSync(new URL("../supabase/staging/migrations/20261012215315_workforce_w12_20_profile_social_controls.sql", import.meta.url), "utf8");
const moderationMigration = readFileSync(new URL("../supabase/staging/migrations/20261013233000_workforce_comm_04_moderation.sql", import.meta.url), "utf8");
const reporterAuth = "00000000-0000-4000-8000-000000000001";
const authorAuth = "00000000-0000-4000-8000-000000000002";
const adminAuth = "00000000-0000-4000-8000-000000000003";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema security; create schema auth;
    grant usage on schema public,security,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
    create function security.new_legacy_id(prefix text) returns text language sql as $$select prefix||'-'||replace(gen_random_uuid()::text,'-','')$$;
    create table public.users(user_id text primary key,auth_user_id uuid,status text,first_name text,last_name text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.app_role_memberships(user_id text,auth_user_id uuid,status text,role text,scope_type text,scope_id text);
    create table public.wf_public_pages(public_page_id text primary key default security.new_legacy_id('PAGE'),owner_user_id text,entity_type text,display_name text,profile_image_url text,visibility text,publication_status text,canonical_path text,headline text,created_at timestamptz default now());
    create table public.wf_profile_posts(profile_post_id text primary key default security.new_legacy_id('POST'),author_public_page_id text,author_user_id text,post_type text default 'post',title text,body text,media jsonb default '[]',visibility text,status text,published_at timestamptz,topic text,location_label text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.wf_profile_post_comments(profile_post_comment_id text primary key default security.new_legacy_id('CMT'),profile_post_id text references public.wf_profile_posts(profile_post_id),author_user_id text,author_public_page_id text,body text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.wf_profile_post_reactions(profile_post_reaction_id text primary key default security.new_legacy_id('REACT'),profile_post_id text,actor_user_id text,actor_public_page_id text,reaction_type text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,reaction_type));
    create table public.wf_profile_post_shares(profile_post_share_id text primary key default security.new_legacy_id('SHR'),profile_post_id text,actor_user_id text,actor_public_page_id text,share_type text,commentary text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,share_type));
    create table public.wf_community_preferences(user_id text primary key,nearby_location text);
    create table public.wf_community_follows(follower_user_id text,followed_user_id text,primary key(follower_user_id,followed_user_id));
    create table public.wf_community_saves(user_id text,profile_post_id text,primary key(user_id,profile_post_id));
    create table public.wf_community_reports(report_id text primary key default security.new_legacy_id('RPT'),reporter_user_id text not null references public.users(user_id),profile_post_id text not null references public.wf_profile_posts(profile_post_id),reason text not null check(reason in ('spam','harassment','misinformation','unsafe','other')),status text not null default 'submitted' check(status in ('submitted','reviewing','resolved','dismissed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(reporter_user_id,profile_post_id));
    create table public.platform_audit_events(actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,source text,metadata jsonb,after_json jsonb);
    create function security.community_actor() returns text language plpgsql stable security definer set search_path='' as $$declare v text;begin select u.user_id into v from public.users u where u.auth_user_id=auth.uid() and u.status='active' and exists(select 1 from public.app_role_memberships m where m.user_id=u.user_id and m.auth_user_id=auth.uid() and m.status='active');if v is null then raise exception 'COMMUNITY_ACCESS_DENIED' using errcode='42501';end if;return v;end$$;
    create function security.community_author_page(p_user_id text) returns text language sql volatile security definer set search_path='' as $$select public_page_id from public.wf_public_pages where owner_user_id=p_user_id order by created_at limit 1$$;
    insert into public.users(user_id,auth_user_id,status,first_name,last_name) values
      ('reporter','${reporterAuth}','active','Riley','Reporter'),
      ('author','${authorAuth}','active','Alex','Author'),
      ('admin','${adminAuth}','active','Taylor','Admin');
    insert into public.app_role_memberships values
      ('reporter','${reporterAuth}','active','student','self','reporter'),
      ('author','${authorAuth}','active','student','self','author'),
      ('admin','${adminAuth}','active','platform_admin','platform','platform');
    insert into public.wf_public_pages(public_page_id,owner_user_id,entity_type,display_name,visibility,publication_status,canonical_path) values
      ('PAGE-R','reporter','student','Riley Reporter','public','published','/students/riley'),
      ('PAGE-A','author','student','Alex Author','public','published','/students/alex'),
      ('PAGE-X','admin','admin','Taylor Admin','private','unpublished','/admin/taylor');
    insert into public.wf_profile_posts(profile_post_id,author_public_page_id,author_user_id,body,visibility,status,published_at) values
      ('POST-NORMAL','PAGE-A','author','A normal community post.','public','published',now()),
      ('POST-SPAM','PAGE-A','author','Click here now https://bad.example/a https://bad.example/b','public','published',now());
  `);
  await db.exec(socialMigration);
  await db.exec(moderationMigration);
  async function as(auth) {
    await db.exec(`reset role;select set_config('test.auth','${auth}',false);set role authenticated`);
  }
  return { db, as };
}

test("reports create one canonical case and report volume alone does not prove abuse", async () => {
  const { db, as } = await fixture();
  try {
    await as(reporterAuth);
    const first = (await db.query("select public.community_report_submit('post','POST-NORMAL','spam','Looks repetitive') result")).rows[0].result;
    const second = (await db.query("select public.community_report_submit('post','POST-NORMAL','spam','Updated context') result")).rows[0].result;
    assert.equal(first.caseId, second.caseId);
    await db.exec("reset role");
    const moderationCase = (await db.query("select report_count,status,automation_state from public.wf_community_moderation_cases where case_id=$1", [first.caseId])).rows[0];
    assert.deepEqual(moderationCase, { report_count: 1, status: "submitted", automation_state: "monitoring" });
    assert.equal((await db.query("select status from public.wf_profile_posts where profile_post_id='POST-NORMAL'")).rows[0].status, "published");
  } finally { await db.close(); }
});

test("objective spam is quarantined while high-risk reports require review", async () => {
  const { db, as } = await fixture();
  try {
    await as(reporterAuth);
    const spam = (await db.query("select public.community_report_submit('post','POST-SPAM','spam',null) result")).rows[0].result;
    const risk = (await db.query("select public.community_report_submit('user','author','threat','Credible threat context') result")).rows[0].result;
    await db.exec("reset role");
    assert.equal((await db.query("select status from public.wf_profile_posts where profile_post_id='POST-SPAM'")).rows[0].status, "hidden");
    assert.deepEqual((await db.query("select status,automation_state,outcome from public.wf_community_moderation_cases where case_id=$1", [spam.caseId])).rows[0], { status: "resolved", automation_state: "actioned", outcome: "content_quarantined" });
    assert.deepEqual((await db.query("select status,severity,automation_state from public.wf_community_moderation_cases where case_id=$1", [risk.caseId])).rows[0], { status: "reviewing", severity: "critical", automation_state: "needs_review" });
  } finally { await db.close(); }
});

test("blocking removes relationships, suppresses content and prevents interaction", async () => {
  const { db, as } = await fixture();
  try {
    await db.exec("insert into public.wf_community_follows values('reporter','author'),('author','reporter')");
    await as(reporterAuth);
    await db.query("select public.community_block_set('author','block')");
    const feed = (await db.query("select public.community_feed('recent',null,null,null,20) result")).rows[0].result;
    assert.equal(feed.items.length, 0);
    await assert.rejects(db.query("select public.community_like_toggle('POST-NORMAL')"), /COMMUNITY_INTERACTION_DENIED/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int count from public.wf_community_follows")).rows[0].count, 0);
  } finally { await db.close(); }
});

test("admin decisions are authorized, attributable and appealable by suspended users", async () => {
  const { db, as } = await fixture();
  try {
    await as(reporterAuth);
    const report = (await db.query("select public.community_report_submit('post','POST-NORMAL','harassment','Targeted abuse context') result")).rows[0].result;
    await assert.rejects(db.query("select public.community_moderation_decide($1,'suspend_user','Repeated targeted harassment',24)", [report.caseId]), /MODERATION_ADMIN_REQUIRED/);
    await as(adminAuth);
    await db.query("select public.community_moderation_decide($1,'suspend_user','Repeated targeted harassment',24)", [report.caseId]);
    await as(authorAuth);
    const appeal = (await db.query("select public.community_moderation_appeal($1,'This decision omitted important context.') result", [report.caseId])).rows[0].result;
    assert.equal(appeal.status, "submitted");
    const self = (await db.query("select public.community_moderation_self() result")).rows[0].result;
    assert.equal(self[0].appealStatus, "submitted");
    await db.exec("reset role");
    const audit = (await db.query("select actor_user_id,action from public.platform_audit_events where action in ('COMMUNITY_MODERATION_ACTIONED','COMMUNITY_MODERATION_APPEALED') order by action")).rows;
    assert.deepEqual(audit, [{ actor_user_id: "admin", action: "COMMUNITY_MODERATION_ACTIONED" }, { actor_user_id: "author", action: "COMMUNITY_MODERATION_APPEALED" }]);
  } finally { await db.close(); }
});
