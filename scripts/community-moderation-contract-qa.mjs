import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../supabase/staging/migrations/20261013233000_workforce_comm_04_moderation.sql",import.meta.url),"utf8");
const admin=await readFile(new URL("../components/admin/moderation-workspace.tsx",import.meta.url),"utf8");
const feed=await readFile(new URL("../components/community/community-feed.tsx",import.meta.url),"utf8");
const auth=await readFile(new URL("../lib/auth.ts",import.meta.url),"utf8");

test("moderation records are RLS protected and RPC-only",()=>{
  for(const table of ["wf_community_blocks","wf_community_moderation_cases","wf_community_moderation_actions","wf_community_moderation_appeals","wf_community_user_restrictions"])
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration,/revoke all on table public\.wf_community_blocks[\s\S]+from public,anon,authenticated/);
  assert.match(migration,/security\.wf_community_moderation_evidence/);
  assert.doesNotMatch(migration,/grant execute on function security\.community_moderation_triage/);
});

test("reports do not prove violations and automation is bounded",()=>{
  assert.match(migration,/v_objective_spam:=v_reason in \('spam','scam'\)/);
  assert.match(migration,/automation_state='needs_review'/);
  assert.match(migration,/Repeat upheld spam pattern/);
  assert.doesNotMatch(migration,/report_count\s*>?=?.*suspend_user/i);
});

test("blocks are enforced across feed and interactions",()=>{
  assert.match(migration,/security\.community_content_visible\(v_actor,p\.author_user_id\)/);
  for(const fn of ["community_like_toggle","community_comment_create","community_share_toggle","community_follow_toggle"])
    assert.match(migration,new RegExp(`function public\\.${fn}`));
  assert.match(migration,/community_relationship_allowed/);
});

test("admin actions and suspended-member appeals remain attributable",()=>{
  assert.match(migration,/COMMUNITY_MODERATION_ACTIONED/);
  assert.match(migration,/COMMUNITY_MODERATION_APPEALED/);
  assert.match(migration,/COMMUNITY_MODERATION_APPEAL_RESOLVED/);
  assert.match(migration,/lower\(u\.status\) in \('active','suspended'\)/);
  assert.match(auth,/account\.userStatus\.toLowerCase\(\) !== "active"/);
});

test("enterprise moderation UI exposes priority, automation and reasons",()=>{
  for(const value of ["Priority queue","Automated activity","Report volume is never treated as proof","Decision reason"])
    assert.match(admin,new RegExp(value));
  for(const value of ["Report account instead","Policy automation is evaluating it now","Mute","Block"])
    assert.match(feed,new RegExp(value));
});
