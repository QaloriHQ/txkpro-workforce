import test from "node:test";import assert from "node:assert/strict";import{readFile}from"node:fs/promises";
const migration=await readFile(new URL("../supabase/staging/migrations/20261014060000_workforce_comm_03_public_content.sql",import.meta.url),"utf8");
const page=await readFile(new URL("../app/community/posts/[postId]/page.tsx",import.meta.url),"utf8");
const sitemap=await readFile(new URL("../app/sitemap.ts",import.meta.url),"utf8");
const feed=await readFile(new URL("../components/community/community-feed.tsx",import.meta.url),"utf8");
test("anonymous projection fails closed at canonical publication boundaries",()=>{for(const value of ["p.status='published'","p.visibility='public'","lower(u.status)='active'","page.publication_status='published'","page.robots_index"])assert.match(migration,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.match(migration,/revoke all on function public\.community_public_post\(text\).*from public,anon,authenticated/);});
test("public pages provide canonical metadata without promising indexing",()=>{assert.match(page,/publicPageMetadata/);assert.match(page,/robots:\{index:false,follow:false\}/);assert.match(page,/PublicCommunityPostView/);});
test("only approved post URLs enter discovery and shares",()=>{assert.match(sitemap,/publicCommunitySitemap/);assert.match(feed,/community\/posts\/\$\{encodeURIComponent\(post\.id\)\}/);assert.doesNotMatch(migration,/comments.*sitemap/i);});
