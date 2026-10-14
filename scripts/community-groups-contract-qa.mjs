import test from"node:test";import assert from"node:assert/strict";import{readFileSync}from"node:fs";
const sql=readFileSync("supabase/staging/migrations/20261014130000_workforce_comm_07_groups.sql","utf8");
test("private groups remain invite-only",()=>assert.match(sql,/visibility='private' and join_policy='invite_only'/));
test("group roles and membership states are constrained",()=>{assert.match(sql,/role in \('admin','moderator','member'\)/);assert.match(sql,/status in \('pending','active','left','removed','banned'\)/)});
test("moderators cannot grant roles",()=>assert.match(sql,/p_action in \('make_admin','make_moderator','make_member'\) and r<>'admin'/));
test("last administrator is protected",()=>assert.match(sql,/LAST_GROUP_ADMIN/));
test("private group posts do not enter public feed",()=>assert.match(sql,/case when visibility='public' then 'unlisted' else 'private'/));
test("sensitive tables deny direct authenticated access",()=>assert.match(sql,/revoke all on table[\s\S]*from public,anon,authenticated/));
