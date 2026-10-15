import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../supabase/staging/migrations/20261015004938_workforce_comm_10_engagement_points.sql",
    import.meta.url,
  ),
  "utf8",
);
const AUTH = {
  a: "00000000-0000-4000-8000-000000000001",
  b: "00000000-0000-4000-8000-000000000002",
  c: "00000000-0000-4000-8000-000000000003",
  d: "00000000-0000-4000-8000-000000000004",
};

async function fixture({ historical = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema security; create schema auth;
    grant usage on schema public,security,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
    create table public.users(user_id text primary key,auth_user_id uuid,status text);
    create table public.wf_public_pages(public_page_id text primary key,owner_user_id text,entity_type text);
    create table public.wf_profile_posts(profile_post_id text primary key,author_public_page_id text,author_user_id text,visibility text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.wf_community_groups(group_id text primary key,visibility text,status text);
    create table public.wf_community_post_audiences(profile_post_id text,group_id text);
    create table public.wf_profile_post_reactions(profile_post_reaction_id text primary key,profile_post_id text,actor_user_id text,reaction_type text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,reaction_type));
    create table public.wf_profile_post_shares(profile_post_share_id text primary key,profile_post_id text,actor_user_id text,share_type text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,share_type));
    create table public.wf_profile_post_comments(profile_post_comment_id text primary key,profile_post_id text,author_user_id text,parent_comment_id text,status text default 'published',created_at timestamptz default now());
    create table public.wf_post_polls(profile_post_id text primary key,status text);
    create table public.wf_post_poll_ballots(ballot_id text primary key,profile_post_id text,voter_user_id text,created_at timestamptz default now(),unique(profile_post_id,voter_user_id));
    create table public.wf_post_events(profile_post_id text primary key,status text);
    create table public.wf_post_event_rsvps(profile_post_id text,user_id text,status text,first_qualified_at timestamptz,updated_at timestamptz default now(),primary key(profile_post_id,user_id));
    create table public.platform_audit_events(actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,source text,metadata jsonb,created_at timestamptz default now());
    create table public.wf_pro_season_finalizations(season date primary key,season_ends date,level_version int,scoring_snapshot jsonb,student_count int,finalized_by text,finalized_at timestamptz default now());
    create table public.wf_pro_level_thresholds(version int,level int,minimum_points bigint);
    create table public.wf_pro_rules(code text);
    create table public.wf_student_profiles(student_id text primary key,user_id text,school_id text,cohort_id text);
    create table public.wf_pro_ledger(student_id text,season date,points int);
    create table public.wf_pro_season_standings(season date,student_id text,institution_id text,cohort_id text,season_points bigint,lifetime_points bigint,lifetime_level int,cohort_rank bigint,institution_rank bigint,txkpro_rank bigint);
    create function security.pro_level_version_for(date) returns int language sql stable as $$select 1$$;
    create function security.pro_actor() returns text language sql stable security definer set search_path='' as $$select user_id from public.users where auth_user_id=auth.uid() and lower(status)='active'$$;
    create function security.pro_summary(text,boolean default false) returns jsonb language sql stable as $$select jsonb_build_object('progress',jsonb_build_object('points',5,'lifetime',5),'badges','[]'::jsonb)$$;
    create function security.pro_finalize_season(date,text default null) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into public.users values
      ('a','${AUTH.a}','active'),('b','${AUTH.b}','active'),('c','${AUTH.c}','active'),('d','${AUTH.d}','active');
    insert into public.wf_public_pages values
      ('pa','a','student'),('pb','b','member'),('pc','c','member'),('pd','d','employer');
    insert into public.wf_profile_posts(profile_post_id,author_public_page_id,author_user_id,visibility,status) values
      ('public','pa','a','public','published'),
      ('private','pa','a','private','published'),
      ('public-group','pa','a','unlisted','published'),
      ('private-group','pa','a','private','published'),
      ('nonstudent','pc','c','public','published'),
      ('organization','pd','d','public','published'),
      ('sponsored','pa','a','public','published');
    insert into public.wf_community_groups values('g-public','public','active'),('g-private','private','active');
    insert into public.wf_community_post_audiences values('public-group','g-public'),('private-group','g-private');
    insert into public.wf_post_polls values('public','open');
    insert into public.wf_post_events values('public','published');
    insert into public.wf_student_profiles values('student-a','a','school','cohort');
    insert into public.wf_pro_ledger values('student-a',date_trunc('quarter',now() at time zone 'America/Chicago')::date,5);
    insert into public.wf_pro_level_thresholds values(1,1,0),(1,2,10),(1,3,20);
  `);
  if (historical)
    await db.exec("insert into public.wf_profile_post_reactions values('old-like','public','b','like',now())");
  await db.exec(migration);
  await db.exec("update public.wf_profile_posts set content_origin='sponsored' where profile_post_id='sponsored'");
  async function as(user, role = "authenticated") {
    await db.exec(
      `reset role;select set_config('test.auth','${user ? AUTH[user] : ""}',false);set role ${role}`,
    );
  }
  return { db, as };
}

test("supported actions stack exact uncapped awards while repeats and self-actions do not", async () => {
  const { db } = await fixture();
  try {
    await db.exec(`
      insert into public.wf_profile_post_reactions values('like-b','public','b','like',now()),('like-a','public','a','like',now());
      insert into public.wf_profile_post_comments values('comment-1','public','b',null,'published',now()),('comment-2','public','b',null,'published',now());
      insert into public.wf_profile_post_comments values('reply-1','public','c','comment-1','published',now());
      insert into public.wf_profile_post_shares values('share-1','public','b','share',now()),('share-2','public','b','repost',now());
      insert into public.wf_post_poll_ballots values('ballot-1','public','b',now());
      insert into public.wf_post_event_rsvps values('public','b','going',now(),now());
    `);
    const awards = (await db.query(`select recipient_user_id,actor_user_id,action_type,points from public.wf_pro_engagement_awards where active order by action_type`)).rows;
    assert.deepEqual(
      awards.map((row) => [row.recipient_user_id, row.actor_user_id, row.action_type, row.points]),
      [
        ["a", "b", "comment", 2],
        ["a", "b", "like", 1],
        ["a", "b", "poll_vote", 1],
        ["b", "c", "reply", 2],
        ["a", "b", "rsvp", 3],
        ["a", "b", "share", 3],
      ],
    );
    assert.equal((await db.query("select sum(points)::int total from public.wf_pro_engagement_awards where recipient_user_id='a' and active")).rows[0].total, 10);
  } finally {
    await db.close();
  }
});

test("withdrawal and moderation reversal restore the same logical award", async () => {
  const { db } = await fixture();
  try {
    await db.exec("insert into public.wf_profile_post_reactions values('like-1','public','b','like',now())");
    const id = (await db.query("select award_id from public.wf_pro_engagement_awards")).rows[0].award_id;
    await db.exec("delete from public.wf_profile_post_reactions where profile_post_reaction_id='like-1'");
    assert.equal((await db.query("select active from public.wf_pro_engagement_awards where award_id=$1", [id])).rows[0].active, false);
    await db.exec("insert into public.wf_profile_post_reactions values('like-2','public','b','like',now())");
    assert.equal((await db.query("select award_id from public.wf_pro_engagement_awards")).rows[0].award_id, id);
    await db.exec("update public.wf_profile_posts set status='removed' where profile_post_id='public'");
    assert.equal((await db.query("select active from public.wf_pro_engagement_awards where award_id=$1", [id])).rows[0].active, false);
    await db.exec("update public.wf_profile_posts set status='published' where profile_post_id='public'");
    assert.equal((await db.query("select active from public.wf_pro_engagement_awards where award_id=$1", [id])).rows[0].active, true);
    const events = (await db.query("select action from public.platform_audit_events order by created_at")).rows.map((row) => row.action);
    assert.deepEqual(events, ["PRO_ENGAGEMENT_AWARDED", "PRO_ENGAGEMENT_REVERSED", "PRO_ENGAGEMENT_AWARDED", "PRO_ENGAGEMENT_REVERSED", "PRO_ENGAGEMENT_AWARDED"]);
  } finally {
    await db.close();
  }
});

test("only natural-person public or public-group content qualifies", async () => {
  const { db } = await fixture();
  try {
    for (const post of ["private", "public-group", "private-group", "organization", "sponsored"])
      await db.query("insert into public.wf_profile_post_reactions values($1,$2,'b','like',now())", [`like-${post}`, post]);
    const rows = (await db.query("select source_post_id from public.wf_pro_engagement_awards where active")).rows;
    assert.deepEqual(rows.map((row) => row.source_post_id), ["public-group"]);
  } finally {
    await db.close();
  }
});

test("group, poll, event, and parent-comment state changes reconcile current awards", async () => {
  const { db } = await fixture();
  try {
    await db.exec(`
      insert into public.wf_profile_post_reactions values('group-like','public-group','b','like',now());
      insert into public.wf_post_poll_ballots values('poll-vote','public','b',now());
      insert into public.wf_post_event_rsvps values('public','b','going',now(),now());
      insert into public.wf_profile_post_comments values('parent','public','b',null,'published',now()),('child','public','c','parent','published',now());
      update public.wf_community_groups set visibility='private' where group_id='g-public';
      update public.wf_post_polls set status='cancelled' where profile_post_id='public';
      update public.wf_post_events set status='cancelled' where profile_post_id='public';
      update public.wf_profile_post_comments set status='removed' where profile_post_comment_id='parent';
    `);
    const active = (await db.query("select action_type,source_post_id from public.wf_pro_engagement_awards where active order by action_type")).rows;
    assert.deepEqual(active, []);
    await db.exec(`
      update public.wf_community_groups set visibility='public' where group_id='g-public';
      update public.wf_post_polls set status='open' where profile_post_id='public';
      update public.wf_post_events set status='published' where profile_post_id='public';
      update public.wf_profile_post_comments set status='published' where profile_post_comment_id='parent';
    `);
    assert.equal((await db.query("select count(*)::int n from public.wf_pro_engagement_awards where active")).rows[0].n, 5);
  } finally {
    await db.close();
  }
});

test("all active users receive combined totals and levels while rankings remain student-only", async () => {
  const { db, as } = await fixture();
  try {
    await db.exec(`
      insert into public.wf_profile_post_reactions values('a-like','public','b','like',now()),('c-like','nonstudent','b','like',now());
      insert into public.wf_profile_post_comments values('a-comment','public','b',null,'published',now());
      insert into public.wf_profile_post_shares values('a-share','public','b','share',now());
    `);
    await as("a");
    const student = (await db.query("select public.pro_engagement_self() result")).rows[0].result;
    assert.equal(student.seasonPoints, 11);
    assert.equal(student.lifetimePoints, 11);
    assert.equal(student.lifetimeLevel, 2);
    assert.equal(student.rankEligible, true);
    await as("c");
    const member = (await db.query("select public.pro_engagement_self() result")).rows[0].result;
    assert.equal(member.seasonPoints, 1);
    assert.equal(member.lifetimeLevel, 1);
    assert.equal(member.rankEligible, false);
  } finally {
    await db.close();
  }
});

test("migration performs no historical backfill and tables remain private", async () => {
  const { db, as } = await fixture({ historical: true });
  try {
    assert.equal((await db.query("select count(*)::int n from public.wf_pro_engagement_awards")).rows[0].n, 0);
    await as("b");
    await assert.rejects(db.query("select * from public.wf_pro_engagement_awards"), /permission denied/i);
  } finally {
    await db.close();
  }
});

test("post-finalization withdrawal records an audited season correction", async () => {
  const { db } = await fixture();
  try {
    await db.exec(`
      insert into public.wf_profile_post_reactions values('old-season-like','public','b','like','2026-06-10T12:00:00Z');
      insert into public.wf_pro_season_finalizations(season,season_ends,level_version,scoring_snapshot,student_count)
      values('2026-04-01','2026-06-30',1,'{}',1);
      delete from public.wf_profile_post_reactions where profile_post_reaction_id='old-season-like';
    `);
    const correction = (await db.query("select season::text,points_delta,reason from public.wf_pro_engagement_season_corrections")).rows[0];
    assert.equal(correction.season, "2026-04-01");
    assert.equal(correction.points_delta, -1);
    assert.match(correction.reason, /after season finalization/i);
    const audit = (await db.query("select action,metadata from public.platform_audit_events where action='PRO_ENGAGEMENT_REVERSED' limit 1")).rows[0];
    assert.equal(audit.action, "PRO_ENGAGEMENT_REVERSED");
    assert.equal(audit.metadata.pointsDelta, -1);
  } finally {
    await db.close();
  }
});

test("student summary adds engagement without widening rank eligibility", async () => {
  const { db } = await fixture();
  try {
    await db.exec("insert into public.wf_profile_post_reactions values('summary-like','public','b','like',now())");
    const summary = (await db.query("select security.pro_summary('student-a',false) result")).rows[0].result;
    assert.equal(summary.progress.points, 6);
    assert.equal(summary.progress.lifetime, 6);
    assert.equal(summary.progress.level, 1);
    assert.deepEqual(Object.keys(summary.progress.rankings).sort(), ["cohort", "institution", "txkpro"]);
  } finally {
    await db.close();
  }
});

test("contract keeps engagement outside the capped award path", () => {
  assert.doesNotMatch(migration, /perform\s+security\.pro_award|select\s+security\.pro_award/i);
  assert.match(migration, /PRO_ENGAGEMENT_AWARDED/);
  assert.match(migration, /PRO_ENGAGEMENT_REVERSED/);
  assert.match(migration, /wf_pro_engagement_season_corrections/);
});
