import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/staging/migrations/20261014060000_workforce_comm_03_public_content.sql", import.meta.url),
  "utf8",
);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema security;
    grant usage on schema public to anon,authenticated,service_role;
    create function security.new_legacy_id(prefix text) returns text language sql as $$select prefix||'-'||replace(gen_random_uuid()::text,'-','')$$;
    create table public.users(user_id text primary key,status text not null);
    create table public.wf_public_pages(
      public_page_id text primary key,owner_user_id text not null,display_name text not null,
      profile_image_url text,visibility text not null,publication_status text not null,
      canonical_path text not null,headline text,robots_index boolean not null default true,
      robots_follow boolean not null default true,updated_at timestamptz not null default now()
    );
    create table public.wf_profile_posts(
      profile_post_id text primary key,author_public_page_id text not null,author_user_id text not null,
      post_type text not null default 'post',title text,body text not null,media jsonb not null default '[]',
      visibility text not null,status text not null,published_at timestamptz,topic text,location_label text,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now()
    );
    create table public.wf_profile_post_comments(
      profile_post_comment_id text primary key,profile_post_id text not null,author_user_id text not null,
      author_public_page_id text not null,parent_comment_id text,body text not null,status text not null,
      created_at timestamptz not null default now()
    );
    create table public.wf_profile_post_reactions(profile_post_id text not null,reaction_type text not null);
    create table public.wf_profile_post_shares(profile_post_id text not null);

    insert into public.users values
      ('public-author','active'),('private-author','active'),('commenter','active'),('inactive-commenter','inactive'),('inactive-author','inactive');
    insert into public.wf_public_pages values
      ('PAGE-PUBLIC','public-author','Public Author','https://images.example/public.png','public','published','/students/public','Public headline',true,true,now()),
      ('PAGE-PRIVATE','private-author','Private Author','https://images.example/private.png','private','unpublished','/students/private','Private headline',true,true,now()),
      ('PAGE-COMMENTER','commenter','Helpful Commenter',null,'public','published','/students/commenter','Commenter headline',true,true,now()),
      ('PAGE-INACTIVE-C','inactive-commenter','Inactive Commenter',null,'public','published','/students/inactive-c',null,true,true,now()),
      ('PAGE-INACTIVE-A','inactive-author','Inactive Author',null,'public','published','/students/inactive-a',null,true,true,now());
    insert into public.wf_profile_posts(
      profile_post_id,author_public_page_id,author_user_id,post_type,title,body,visibility,status,published_at,topic,location_label,created_at,updated_at
    ) values
      ('POST-PUBLIC','PAGE-PUBLIC','public-author','article','Public article','Visible body','public','published',now(),'careers','Remote',now(),now()),
      ('POST-PRIVATE-AUTHOR','PAGE-PRIVATE','private-author','post',null,'Safe public post','public','published',now(),null,null,now(),now()),
      ('POST-PRIVATE','PAGE-PUBLIC','public-author','post',null,'Secret body','private','published',now(),null,null,now(),now()),
      ('POST-HIDDEN','PAGE-PUBLIC','public-author','post',null,'Hidden body','public','hidden',now(),null,null,now(),now()),
      ('POST-DRAFT','PAGE-PUBLIC','public-author','post',null,'Draft body','public','draft',null,null,null,now(),now()),
      ('POST-INACTIVE','PAGE-INACTIVE-A','inactive-author','post',null,'Inactive body','public','published',now(),null,null,now(),now());
    insert into public.wf_profile_post_comments values
      ('COMMENT-VISIBLE','POST-PUBLIC','commenter','PAGE-COMMENTER',null,'Public reply','published',now()-interval '2 minutes'),
      ('COMMENT-HIDDEN','POST-PUBLIC','commenter','PAGE-COMMENTER',null,'Hidden reply','hidden',now()-interval '1 minute'),
      ('COMMENT-INACTIVE','POST-PUBLIC','inactive-commenter','PAGE-INACTIVE-C',null,'Inactive reply','published',now());
    insert into public.wf_profile_post_reactions values('POST-PUBLIC','like'),('POST-PUBLIC','celebrate');
    insert into public.wf_profile_post_shares values('POST-PUBLIC'),('POST-PUBLIC');
  `);
  await db.exec(migration);
  return db;
}

test("public projection includes only eligible content and safe engagement", async () => {
  const db = await fixture();
  try {
    const result = (await db.query("select public.community_public_post('POST-PUBLIC') result")).rows[0].result;
    assert.equal(result.found, true);
    assert.equal(result.robotsIndex, true);
    assert.equal(result.authorProfilePath, "/students/public");
    assert.equal(result.likeCount, 1);
    assert.equal(result.shareCount, 2);
    assert.deepEqual(result.comments.map((comment) => comment.id), ["COMMENT-VISIBLE"]);
    for (const id of ["POST-PRIVATE", "POST-HIDDEN", "POST-DRAFT", "POST-INACTIVE", "DOES-NOT-EXIST"]) {
      const unavailable = (await db.query("select public.community_public_post($1) result", [id])).rows[0].result;
      assert.deepEqual(unavailable, { found: false });
    }
  } finally { await db.close(); }
});

test("public posts from private profiles expose a minimal non-indexable byline", async () => {
  const db = await fixture();
  try {
    const result = (await db.query("select public.community_public_post('POST-PRIVATE-AUTHOR') result")).rows[0].result;
    assert.equal(result.found, true);
    assert.equal(result.authorName, "Private Author");
    assert.equal(result.authorProfilePath, null);
    assert.equal(result.authorHeadline, null);
    assert.equal(result.robotsIndex, false);
  } finally { await db.close(); }
});

test("sitemap and execution grants fail closed", async () => {
  const db = await fixture();
  try {
    assert.deepEqual((await db.query("select path from public.community_public_sitemap()")).rows, [
      { path: "/community/posts/POST-PUBLIC" },
    ]);

    await db.exec("set role anon");
    await assert.rejects(db.query("select public.community_public_post('POST-PUBLIC')"), /permission denied/i);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(db.query("select * from public.community_public_sitemap()"), /permission denied/i);
    await db.exec("reset role; set role service_role");
    assert.equal((await db.query("select public.community_public_post('POST-PUBLIC') result")).rows[0].result.found, true);
  } finally { await db.close(); }
});
