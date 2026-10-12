import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/staging/migrations/20261012215315_workforce_w12_20_profile_social_controls.sql", import.meta.url), "utf8");
const foundation = await readFile(new URL("../supabase/staging/migrations/20260925190851_workforce_public_identity_seo_foundation.sql", import.meta.url), "utf8");
const feed = await readFile(new URL("../components/community/community-feed.tsx", import.meta.url), "utf8");
const repository = await readFile(new URL("../lib/community/repository.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/community/posts/[postId]/comments/route.ts", import.meta.url), "utf8");
const ownership = await readFile(new URL("../docs/product-sources/core/TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt", import.meta.url), "utf8");
const statuses = await readFile(new URL("../docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt", import.meta.url), "utf8");
const events = await readFile(new URL("../docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt", import.meta.url), "utf8");

test("canonical social tables are extended rather than duplicated", () => {
  assert.match(migration, /alter table public\.wf_profile_post_comments/);
  assert.match(migration, /public\.wf_profile_post_reactions/);
  assert.match(migration, /public\.wf_profile_post_shares/);
  assert.doesNotMatch(migration, /create table/i);
});

test("only active public posts are interactable and direct table access stays closed", () => {
  assert.match(migration, /security\.community_post_publishable/);
  assert.match(migration, /lower\(u\.status\)='active'/);
  assert.match(migration, /p\.status='published'/);
  assert.match(migration, /p\.visibility='public'/);
  assert.match(migration, /revoke all on function[\s\S]+from public,anon/);
  assert.doesNotMatch(migration, /grant .* on table[\s\S]+authenticated/i);
});

test("post formats, comments, replies, shares and reposts are bounded and attributable", () => {
  for (const value of ["'post'", "'article'", "'update'", "'share'", "'repost'"]) assert.match(migration, new RegExp(value));
  assert.match(migration, /char_length\(v_body\) not between 1 and 2000/);
  assert.match(migration, /c\.profile_post_id=p_post_id and c\.status='published'/);
  assert.match(foundation, /unique\(profile_post_id, actor_user_id, share_type\)/);
  assert.match(repository, /community_comment_create/);
  assert.match(repository, /community_share_toggle/);
  assert.match(route, /parentId/);
  assert.match(repository, /p_parent_comment_id/);
});

test("audit payloads exclude authored content and preserve canonical events", () => {
  for (const event of ["COMMUNITY_COMMENT_PUBLISHED", "COMMUNITY_REACTION_SET", "COMMUNITY_REACTION_WITHDRAWN", "COMMUNITY_SHARE_CONFIRMED", "COMMUNITY_SHARE_WITHDRAWN"]) {
    assert.match(migration, new RegExp(event));
    assert.match(events, new RegExp(event));
  }
  const auditValues = [...migration.matchAll(/values\(auth\.uid\(\)[\s\S]*?\);/g)].map(match => match[0]).join("\n");
  assert.doesNotMatch(auditValues, /v_body|commentary|title|media/);
});

test("privacy remains presentation-only and UI exposes complete interaction states", () => {
  assert.match(ownership, /hiding all activity or an individual category never deletes canonical interaction/i);
  assert.match(statuses, /Hiding public activity history changes presentation only/i);
  for (const label of ["Post", "Update", "Article", "Comment", "Reply", "Share", "Repost", "Loading comments", "No comments yet"]) {
    assert.match(feed, new RegExp(label));
  }
  assert.match(feed, /role="status"/);
});
