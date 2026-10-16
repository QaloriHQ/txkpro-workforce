import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/staging/migrations/20261016020700_workforce_student_community_discovery_v3.sql", import.meta.url), "utf8");

test("gallery RPCs are gated to active Students", () => {
  assert.match(sql, /community_student_event_gallery/);
  assert.match(sql, /community_student_poll_gallery/);
  assert.equal((sql.match(/security\.community_student_actor\(\)/g) ?? []).length, 2);
  assert.match(sql, /grant execute[\s\S]*to authenticated/);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/);
});

test("event discovery preserves existing visibility, group, and block rules", () => {
  assert.match(sql, /security\.community_event_viewable\(event\.profile_post_id, actor\)/);
  assert.match(sql, /security\.community_content_visible\(actor, post\.author_user_id\)/);
  assert.match(sql, /event\.status in \('published', 'cancelled'\)/);
});

test("poll discovery exposes aggregate results without voter identities or selections", () => {
  assert.match(sql, /security\.community_poll_viewable\(poll\.profile_post_id, actor\)/);
  assert.match(sql, /'totalBallots', visible\.total_ballots/);
  assert.match(sql, /visible\.viewer_voted or visible\.display_status <> 'open'/);
  assert.doesNotMatch(sql, /'voterUserId'|'voterId'|'ballotId'|'selectionIds'/);
});

test("gallery functions are bounded read models and do not create competing state", () => {
  assert.equal((sql.match(/limit 200/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /insert into|update public\.|delete from|alter table|create table/i);
  assert.match(sql, /when poll\.status = 'open' and poll\.closes_at <= now\(\) then 'closed'/);
  assert.match(sql, /when event\.status = 'published' and event\.ends_at <= now\(\) then 'completed'/);
});
