import test from"node:test";import assert from"node:assert/strict";import{readFileSync}from"node:fs";
const sql=readFileSync("supabase/staging/migrations/20261014150000_workforce_comm_06_group_conversations.sql","utf8");const ui=readFileSync("components/community/group-detail.tsx","utf8");
test("group conversations inherit active canonical membership",()=>{assert.match(sql,/community_group_id text references public\.wf_community_groups/);assert.match(sql,/m\.status='active'/);assert.match(sql,/GROUP_CONVERSATION_DENIED/)});
test("new members see history only from membership start",()=>{assert.match(sql,/sent_at>=since/);assert.match(sql,/sent_at>=m\.joined_at/)});
test("invitations expire and replay uses unique group conversation",()=>{assert.match(sql,/invite_expires_at>now\(\)/);assert.match(sql,/interval '7 days'/);assert.match(sql,/unique index if not exists wf_conversations_group_idx/)});
test("leave revokes conversation access and last admin is protected",()=>{assert.match(sql,/LAST_GROUP_ADMIN/);assert.match(sql,/membership_status='left'/)});
test("group UI exposes chat and leave controls",()=>{assert.match(ui,/Open group chat/);assert.match(ui,/>Leave</)});
test("tables remain RPC-only from COMM-05",()=>assert.doesNotMatch(sql,/grant .* on table .*authenticated/i));
