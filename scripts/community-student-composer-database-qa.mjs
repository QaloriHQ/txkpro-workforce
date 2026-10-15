import assert from"node:assert/strict";import{readFile}from"node:fs/promises";const sql=await readFile(new URL("../supabase/staging/migrations/20261015144503_workforce_student_community_composer_v2.sql",import.meta.url),"utf8");
const checks=[
 ["Private restricted media bucket",/community-media','community-media',false,8388608/.test(sql)&&sql.includes("image/webp")],
 ["Draft and asset tables deny direct authenticated access",sql.includes("revoke all on table public.wf_community_drafts,public.wf_community_media_assets from public,anon,authenticated")],
 ["Only active Students can use composer RPCs",sql.includes("security.community_student_actor")&&sql.includes("lower(m.role)='student'")&&sql.includes("lower(m.status)='active'")],
 ["Asset count is capped at ten",sql.includes("count_assets>=10")&&sql.includes("expected>10")],
 ["Publishing attaches assets transactionally",sql.includes("security.community_student_attach")&&sql.includes("community_student_post_publish")&&sql.includes("community_student_event_publish")],
 ["Public media requires a published public post",sql.includes("community_public_media_access")&&sql.includes("p.status='published' and p.visibility='public'")],
];for(const[name,pass]of checks){assert.ok(pass,name);console.log(`PASS ${name}`);}console.log(`Student composer database QA passed (${checks.length}/${checks.length}).`);
