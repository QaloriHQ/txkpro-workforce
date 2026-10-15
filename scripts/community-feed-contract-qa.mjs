import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/staging/migrations/20261012120000_workforce_comm_02_home_feed.sql", import.meta.url), "utf8");
const feed = await readFile(new URL("../components/community/community-feed.tsx", import.meta.url), "utf8");
const createMenu = await readFile(new URL("../components/community/community-create-menu.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("community tables retain RLS and deny direct client access", () => {
  for (const table of ["wf_community_preferences", "wf_community_follows", "wf_community_saves", "wf_community_reports"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on table[\s\S]+from public, anon, authenticated/);
});

test("actor authorization and author privacy fail closed", () => {
  assert.match(migration, /security\.community_actor\(\)/);
  assert.match(migration, /lower\(u\.status\)='active'/);
  assert.match(migration, /app_role_memberships/);
  assert.match(migration, /case when page\.visibility='public' and page\.publication_status='published' then page\.canonical_path end/);
});

test("feed is public-content-only with stable pagination and explicit filters", () => {
  assert.match(migration, /p\.status='published' and p\.visibility='public'/);
  assert.match(migration, /\(p\.published_at,p\.profile_post_id\) </);
  for (const filter of ["recent", "following", "nearby", "topic"]) assert.match(migration, new RegExp(`'${filter}'`));
  assert.doesNotMatch(migration, /personalized|trending/i);
});

test("public acknowledgement and bounded content are enforced in the database", () => {
  assert.match(migration, /PUBLIC_ACKNOWLEDGEMENT_REQUIRED/);
  assert.match(migration, /jsonb_array_length\(v_media\)>4/);
  assert.match(migration, /char_length\(v_body\) not between 1 and 8000/);
  assert.match(createMenu, /visible on TXKPRO and search engines/);
});

test("Home routes to community and the UI exposes required states and actions", () => {
  for (const path of ["/student/community", "/institution/community", "/employer/community", "/community"]) assert.match(dashboard, new RegExp(path));
  for (const value of ["Loading community posts", "No posts here yet", "Try again", "Load more", "Follow", "Like", "Save", "Share", "Report post"]) assert.match(feed, new RegExp(value));
});
