import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migrationFiles = [
  "../supabase/staging/migrations/20261016025814_workforce_ads_01_native_delivery.sql",
  "../supabase/migrations/20261016033519_workforce_ads_02_advertiser_dashboard.sql",
  "../supabase/migrations/20261016160027_ads_account_funding_review_gate.sql",
  "../supabase/migrations/20261016211032_ads_06_enterprise_foundation.sql",
  "../supabase/migrations/20261016220738_ads_06_enterprise_indexes.sql",
  "../supabase/migrations/20261017052219_ads_06_review_indexes.sql",
  "../supabase/migrations/20261017123136_ads_07_10_manager_workspace.sql",
  "../supabase/migrations/20261017205500_ads_draft_audience_identity.sql",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const OWNER = "00000000-0000-4000-8000-000000000010",
  OTHER = "00000000-0000-4000-8000-000000000020";
async function fixture() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema security;create schema storage;grant usage on schema public,auth,security,storage to anon,authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',coalesce(current_setting('test.email',true),''))$$;create function security.new_legacy_id(prefix text) returns text language sql as $$select prefix||'-'||replace(gen_random_uuid()::text,'-','')$$;create table public.users(user_id text primary key,auth_user_id uuid,status text);create table public.app_role_memberships(auth_user_id uuid,status text,role text);create table public.wf_community_groups(group_id text primary key,visibility text,status text);create table public.wf_profile_posts(profile_post_id text primary key,author_user_id text,topic text,status text,visibility text);create table public.wf_community_post_audiences(profile_post_id text,group_id text);create table public.platform_audit_events(id bigserial primary key,actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,source text,metadata jsonb,before_json jsonb,after_json jsonb,created_at timestamptz default now());create table public.wf_community_moderation_cases(case_id text primary key,target_type text,target_id text,constraint wf_community_moderation_cases_target_type_check check(target_type in('post','comment','user','message')));create table public.wf_community_reports(report_id text primary key,target_type text,target_id text,constraint wf_community_reports_target_type_check check(target_type in('post','comment','user','message')));insert into auth.users values('${OWNER}','owner@example.com'),('${OTHER}','other@example.com');insert into public.users values('OWNER','${OWNER}','active'),('OTHER','${OTHER}','active');create function security.is_admin() returns boolean language sql stable security definer set search_path='' as $$select false$$;`,
  );
  for (const sql of migrationFiles) await db.exec(sql);
  return db;
}
async function actor(db, id, email) {
  await db.exec(
    `select set_config('test.auth','${id}',false),set_config('test.email','${email}',false)`,
  );
}

test("reusable audiences, assets and creative variations remain advertiser scoped", async () => {
  const db = await fixture();
  try {
    await actor(db, OWNER, "owner@example.com");
    const advertiser = (
      await db.query(
        "select public.advertiser_register('Workspace Co',null,'https://workspace.example','owner@example.com') result",
      )
    ).rows[0].result;
    const audience = (
      await db.query(
        "select public.advertiser_audience_save($1,null,'Electrical learners','student','Electrical','Texarkana','neighborhood.1','Downtown',-94.04,33.42,5000) result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    assert.match(audience.audienceId, /^AUA-/);
    const asset = (
      await db.query(
        "select public.advertiser_asset_register($1,'Crew photo','image',$1||'/00000000-0000-4000-8000-000000000099.jpg','image/jpeg',1000,'Crew at work') result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    const set = (
      await db.query(
        "select public.advertiser_creative_set_save($1,null,'Hiring variations',jsonb_build_array(jsonb_build_object('name','Variation A','assetId',$2::text,'headline','Start your career','body','Paid apprenticeship openings','destinationUrl','https://workspace.example/jobs','ctaLabel','Apply now'))) result",
        [advertiser.advertiserId, asset.assetId],
      )
    ).rows[0].result;
    assert.match(set.creativeSetId, /^CRS-/);
    const context = (
      await db.query("select public.advertiser_manager_context($1) result", [
        advertiser.advertiserId,
      ])
    ).rows[0].result;
    assert.equal(context.audiences.length, 1);
    assert.equal(context.assets.length, 1);
    assert.equal(context.creativeSets[0].variations.length, 1);
    await actor(db, OTHER, "other@example.com");
    await assert.rejects(
      db.query("select public.advertiser_manager_context($1)", [
        advertiser.advertiserId,
      ]),
      /ADVERTISER_ACCESS_DENIED/,
    );
  } finally {
    await db.close();
  }
});
test("daily caps and audience attachments update only editable drafts", async () => {
  const db = await fixture();
  try {
    await actor(db, OWNER, "owner@example.com");
    const advertiser = (
      await db.query(
        "select public.advertiser_register('Draft Co',null,null,'owner@example.com') result",
      )
    ).rows[0].result;
    const campaign = (
      await db.query(
        "select public.advertiser_campaign_save_v2($1,null,'Draft campaign','traffic',50000,now(),now()+interval '5 days',3,array['in_feed'],'{}') result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    await db.query(
      "select public.advertiser_campaign_budget_save($1,$2,10000)",
      [advertiser.advertiserId, campaign.campaignId],
    );
    assert.equal(
      (
        await db.query(
          "select daily_spend_cap_minor::int value from public.wf_ad_campaigns where campaign_id=$1",
          [campaign.campaignId],
        )
      ).rows[0].value,
      10000,
    );
    await assert.rejects(
      db.query("select public.advertiser_campaign_budget_save($1,$2,60000)", [
        advertiser.advertiserId,
        campaign.campaignId,
      ]),
      /INVALID_DAILY_SPEND_CAP/,
    );
  } finally {
    await db.close();
  }
});

test("campaign draft reload preserves the linked audience identity", async () => {
  const db = await fixture();
  try {
    await actor(db, OWNER, "owner@example.com");
    const advertiser = (
      await db.query(
        "select public.advertiser_register('Identity Co',null,null,'owner@example.com') result",
      )
    ).rows[0].result;
    const campaign = (
      await db.query(
        "select public.advertiser_campaign_save_v2($1,null,'Identity campaign','traffic',50000,now(),now()+interval '5 days',3,array['in_feed'],'{}') result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    const audience = (
      await db.query(
        "select public.advertiser_audience_save($1,null,'Identity campaign audience','student','Electrical','Texarkana',null,null,null,null,null) result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    const group = (
      await db.query(
        "select public.advertiser_ad_group_save($1,$2,null,'Primary audience','fixed_cpm',1000,'even',3,'student','Electrical','Texarkana','UTC','[]'::jsonb,array['in_feed']) result",
        [advertiser.advertiserId, campaign.campaignId],
      )
    ).rows[0].result;
    await db.query(
      "select public.advertiser_ad_group_audience_set($1,$2,$3)",
      [advertiser.advertiserId, group.adGroupId, audience.audienceId],
    );

    const context = (
      await db.query("select public.advertiser_enterprise_context($1) result", [
        advertiser.advertiserId,
      ])
    ).rows[0].result;
    assert.equal(context.adGroups[0].audienceId, audience.audienceId);

    await db.query(
      "select public.advertiser_audience_save($1,$2,'Identity campaign audience','student','Electrical','Texarkana',null,null,null,null,null)",
      [advertiser.advertiserId, context.adGroups[0].audienceId],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int value from public.wf_ad_audiences where advertiser_id=$1 and name='Identity campaign audience'",
          [advertiser.advertiserId],
        )
      ).rows[0].value,
      1,
    );
    // Editing targeting should fork the reusable audience with a distinct name.
    const forked = (
      await db.query(
        "select public.advertiser_audience_save($1,null,'Identity campaign audience (2)','student','Plumbing','Texarkana',null,null,null,null,null) result",
        [advertiser.advertiserId],
      )
    ).rows[0].result;
    await db.query(
      "select public.advertiser_ad_group_audience_set($1,$2,$3)",
      [advertiser.advertiserId, group.adGroupId, forked.audienceId],
    );
    const afterEdit = (
      await db.query("select public.advertiser_enterprise_context($1) result", [
        advertiser.advertiserId,
      ])
    ).rows[0].result;
    assert.equal(afterEdit.adGroups[0].audienceId, forked.audienceId);
    assert.notEqual(forked.audienceId, audience.audienceId);
    assert.deepEqual(
      (
        await db.query(
          "select name,topic from public.wf_ad_audiences where advertiser_id=$1 order by name",
          [advertiser.advertiserId],
        )
      ).rows,
      [
        { name: "Identity campaign audience", topic: "Electrical" },
        { name: "Identity campaign audience (2)", topic: "Plumbing" },
      ],
    );
  } finally {
    await db.close();
  }
});
