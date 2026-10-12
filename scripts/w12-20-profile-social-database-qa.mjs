import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/staging/migrations/20261012215315_workforce_w12_20_profile_social_controls.sql", import.meta.url), "utf8");
const actorA = "00000000-0000-4000-8000-000000000001";
const actorB = "00000000-0000-4000-8000-000000000002";
const inactive = "00000000-0000-4000-8000-000000000003";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema security; create schema auth;
    grant usage on schema public,security,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
    create function security.new_legacy_id(prefix text) returns text language sql as $$select prefix||'-'||replace(gen_random_uuid()::text,'-','')$$;
    create table public.users(user_id text primary key,auth_user_id uuid,status text,first_name text,last_name text);
    create table public.app_role_memberships(user_id text,auth_user_id uuid,status text,role text,scope_type text,scope_id text);
    create table public.wf_public_pages(public_page_id text primary key default security.new_legacy_id('PAGE'),owner_user_id text,entity_type text,display_name text,profile_image_url text,visibility text,publication_status text,canonical_path text,headline text,created_at timestamptz default now());
    create table public.wf_profile_posts(profile_post_id text primary key default security.new_legacy_id('POST'),author_public_page_id text,author_user_id text,post_type text default 'post',title text,body text,media jsonb default '[]',visibility text,status text,published_at timestamptz,topic text,location_label text,created_at timestamptz default now());
    create table public.wf_profile_post_comments(profile_post_comment_id text primary key default security.new_legacy_id('CMT'),profile_post_id text references public.wf_profile_posts(profile_post_id),author_user_id text,author_public_page_id text,body text,status text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.wf_profile_post_reactions(profile_post_reaction_id text primary key default security.new_legacy_id('REACT'),profile_post_id text,actor_user_id text,actor_public_page_id text,reaction_type text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,reaction_type));
    create table public.wf_profile_post_shares(profile_post_share_id text primary key default security.new_legacy_id('SHR'),profile_post_id text,actor_user_id text,actor_public_page_id text,share_type text,commentary text,created_at timestamptz default now(),unique(profile_post_id,actor_user_id,share_type));
    create table public.wf_community_preferences(user_id text primary key,nearby_location text);
    create table public.wf_community_follows(follower_user_id text,followed_user_id text);
    create table public.wf_community_saves(user_id text,profile_post_id text);
    create table public.platform_audit_events(actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,source text,metadata jsonb,after_json jsonb);
    create function security.community_actor() returns text language plpgsql stable security definer set search_path='' as $$declare v text;begin select u.user_id into v from public.users u where u.auth_user_id=auth.uid() and u.status='active' and exists(select 1 from public.app_role_memberships m where m.user_id=u.user_id and m.auth_user_id=auth.uid() and m.status='active');if v is null then raise exception 'COMMUNITY_ACCESS_DENIED' using errcode='42501';end if;return v;end$$;
    create function security.community_author_page(p_user_id text) returns text language sql volatile security definer set search_path='' as $$select public_page_id from public.wf_public_pages where owner_user_id=p_user_id order by created_at limit 1$$;
    insert into public.users values('a','${actorA}','active','Alex','A'),('b','${actorB}','active','Blair','B'),('off','${inactive}','inactive','Off','Line');
    insert into public.app_role_memberships values('a','${actorA}','active','student','self','a'),('b','${actorB}','active','instructor','institution','school'),('off','${inactive}','active','student','self','off');
    insert into public.wf_public_pages(public_page_id,owner_user_id,entity_type,display_name,visibility,publication_status,canonical_path,created_at) values('PAGE-A','a','student','Alex A','public','published','/students/alex',now()-interval '2 minutes'),('PAGE-B','b','educator','Blair B','private','unpublished','/educators/blair',now()-interval '1 minute'),('PAGE-OFF','off','student','Off Line','public','published','/students/off',now());
    insert into public.wf_profile_posts(profile_post_id,author_public_page_id,author_user_id,post_type,title,body,visibility,status,published_at) values('POST-PUBLIC','PAGE-A','a','article','Public article','Useful public content','public','published',now()),('POST-PRIVATE','PAGE-A','a','post',null,'Private content','private','published',now());
  `);
  await db.exec(migration);
  async function as(auth) { await db.exec(`reset role;select set_config('test.auth','${auth}',false);set role authenticated`); }
  return { db, as };
}

test("migration applies and enforces active actor plus public-post boundaries", async () => {
  const { db, as } = await fixture();
  try {
    await as(inactive);
    await assert.rejects(db.query("select public.community_comments('POST-PUBLIC')"), /COMMUNITY_ACCESS_DENIED/);
    await as(actorB);
    await assert.rejects(db.query("select public.community_comment_create('POST-PRIVATE','No',null)"), /POST_NOT_FOUND/);
    await db.query("select public.community_comment_create('POST-PUBLIC','Helpful reply',null)");
    const comments = (await db.query("select public.community_comments('POST-PUBLIC') result")).rows[0].result;
    assert.equal(comments.length, 1);
    assert.equal(comments[0].authorProfilePath, null);
  } finally { await db.close(); }
});

test("like/share/repost state is unique, reversible and auditable without content", async () => {
  const { db, as } = await fixture();
  try {
    await as(actorB);
    assert.equal((await db.query("select public.community_like_toggle('POST-PUBLIC') result")).rows[0].result.active, true);
    assert.equal((await db.query("select public.community_like_toggle('POST-PUBLIC') result")).rows[0].result.active, false);
    assert.equal((await db.query("select public.community_share_toggle('POST-PUBLIC','share','context') result")).rows[0].result.active, true);
    assert.equal((await db.query("select public.community_share_toggle('POST-PUBLIC','share',null) result")).rows[0].result.active, false);
    assert.equal((await db.query("select public.community_share_toggle('POST-PUBLIC','repost',null) result")).rows[0].result.active, true);
    await db.exec("reset role");
    const audit = (await db.query("select action,metadata,after_json from public.platform_audit_events order by action")).rows;
    assert.deepEqual(new Set(audit.map(row => row.action)), new Set(["COMMUNITY_REACTION_SET","COMMUNITY_REACTION_WITHDRAWN","COMMUNITY_SHARE_CONFIRMED","COMMUNITY_SHARE_WITHDRAWN"]));
    assert.equal(JSON.stringify(audit).includes("Useful public content"), false);
    assert.equal((await db.query("select count(*)::int count from public.wf_profile_post_shares where profile_post_id='POST-PUBLIC'")).rows[0].count, 1);
  } finally { await db.close(); }
});

test("feed projects explicit post type and private-profile-safe bylines", async () => {
  const { db, as } = await fixture();
  try {
    await as(actorB);
    const result = (await db.query("select public.community_feed('recent',null,null,null,20) result")).rows[0].result;
    assert.equal(result.items[0].postType, "article");
    assert.equal(result.items[0].authorProfilePath, "/students/alex");
    assert.equal(JSON.stringify(result).includes("Private content"), false);
  } finally { await db.close(); }
});
