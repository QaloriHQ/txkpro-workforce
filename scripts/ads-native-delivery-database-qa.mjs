import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/staging/migrations/20261016025814_workforce_ads_01_native_delivery.sql", import.meta.url), "utf8");
const VIEWER = "00000000-0000-4000-8000-000000000001";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema security;
    grant usage on schema public,auth,security to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth',true),'')::uuid$$;
    create function security.new_legacy_id(prefix text) returns text language sql as $$select prefix||'-'||replace(gen_random_uuid()::text,'-','')$$;
    create table public.users(user_id text primary key,auth_user_id uuid,status text);
    create table public.app_role_memberships(auth_user_id uuid,status text,role text);
    create table public.wf_community_groups(group_id text primary key,visibility text,status text);
    create table public.wf_profile_posts(profile_post_id text primary key,author_user_id text,topic text,status text,visibility text);
    create table public.wf_community_post_audiences(profile_post_id text,group_id text);
    create table public.platform_audit_events(actor_auth_user_id uuid,actor_user_id text,action text,entity_type text,entity_id text,source text,metadata jsonb);
    create table public.wf_community_moderation_cases(
      case_id text primary key default security.new_legacy_id('CASE'),target_type text,target_id text,automation_state text,severity text,
      priority_score integer,last_reported_at timestamptz default now(),updated_at timestamptz default now(),closed_at timestamptz,status text default 'submitted',
      constraint wf_community_moderation_cases_target_type_check check(target_type in('post','comment','user','message')),unique(target_type,target_id)
    );
    create table security.wf_community_moderation_evidence(case_id text primary key,content_type text,content_snapshot jsonb,content_hash text,captured_at timestamptz default now());
    create table public.wf_community_reports(
      report_id text primary key default security.new_legacy_id('REPORT'),reporter_user_id text,reason text,case_id text,details text,
      target_type text,target_id text,status text default 'submitted',updated_at timestamptz default now(),
      constraint wf_community_reports_target_type_check check(target_type in('post','comment','user','message'))
    );
    create unique index report_actor_case on public.wf_community_reports(reporter_user_id,case_id) where case_id is not null;
    create function security.community_actor() returns text language sql stable security definer set search_path='' as $$
      select user_id from public.users where auth_user_id=auth.uid() and status='active'
    $$;
    insert into public.users values('viewer','${VIEWER}','active'),('admin',null,'active');
    insert into public.app_role_memberships values('${VIEWER}','active','student');
    insert into public.wf_profile_posts values('POST-1','viewer','Electrical','published','public');
  `);
  await db.exec(migration);
  await db.exec(`
    insert into public.wf_advertisers(advertiser_id,display_name,status) values('ADV-1','Safety Partner','active');
    insert into public.wf_ad_campaigns(campaign_id,advertiser_id,name,status,budget_minor,daily_frequency_cap) values('ADC-1','ADV-1','Fall safety','active',10000,2);
    insert into public.wf_ad_creatives(creative_id,campaign_id,status,headline,body,destination_url) values('CRV-1','ADC-1','approved','Tool safety','Practice safe work habits.','https://example.com/safety');
    insert into public.wf_ad_campaign_placements(campaign_id,creative_id,placement,enabled,priority) values('ADC-1','CRV-1','in_feed',true,10);
    insert into public.wf_ad_campaign_audiences(audience_id,campaign_id,role_family,topic) values('ADA-1','ADC-1','student','Electrical');
    insert into public.wf_ad_funding_authorizations(funding_authorization_id,campaign_id,amount_minor,evidence_reference,authorized_by_user_id) values('ADF-1','ADC-1',10000,'offline-invoice-1','admin');
  `);
  return db;
}

test("eligible direct inventory is idempotent and records distinct measurement events", async () => {
  const db = await fixture();
  const request = "10000000-0000-4000-8000-000000000001";
  try {
    const first = (await db.query("select public.ad_delivery_select('in_feed','POST-1',$1,$2) result", [request, VIEWER])).rows[0].result;
    const replay = (await db.query("select public.ad_delivery_select('in_feed','POST-1',$1,$2) result", [request, VIEWER])).rows[0].result;
    assert.equal(first.ad.advertiserName, "Safety Partner");
    assert.equal(first.ad.deliveryId, replay.ad.deliveryId);
    const viewed = (await db.query("select public.ad_delivery_record($1,$2,'viewable') result", [first.ad.deliveryId, request])).rows[0].result;
    const viewedReplay = (await db.query("select public.ad_delivery_record($1,$2,'viewable') result", [first.ad.deliveryId, request])).rows[0].result;
    await db.query("select public.ad_delivery_record($1,$2,'clicked')", [first.ad.deliveryId, request]);
    assert.equal(viewed.recorded, true);
    assert.equal(viewedReplay.recorded, false);
    const counts = (await db.query("select event_type,count(*)::int count from public.wf_ad_delivery_events group by event_type order by event_type")).rows;
    assert.deepEqual(counts, [{ event_type: "clicked", count: 1 }, { event_type: "served", count: 1 }, { event_type: "viewable", count: 1 }]);
    assert.equal((await db.query("select count(*)::int count from public.platform_audit_events where action='AD_DELIVERY_RECORDED'")).rows[0].count, 3);
  } finally { await db.close(); }
});

test("unsafe states, invalid context and frequency caps return no fill", async () => {
  const db = await fixture();
  try {
    const invalid = (await db.query("select public.ad_delivery_select('in_feed','PRIVATE-POST','20000000-0000-4000-8000-000000000001',$1) result", [VIEWER])).rows[0].result;
    assert.equal(invalid.reason, "invalid_context");
    await db.query("select public.ad_delivery_select('in_feed','POST-1','20000000-0000-4000-8000-000000000002',$1)", [VIEWER]);
    await db.query("select public.ad_delivery_select('in_feed','POST-1','20000000-0000-4000-8000-000000000003',$1)", [VIEWER]);
    const capped = (await db.query("select public.ad_delivery_select('in_feed','POST-1','20000000-0000-4000-8000-000000000004',$1) result", [VIEWER])).rows[0].result;
    assert.equal(capped.reason, "no_fill");
    assert.equal(capped.externalFallback, "disabled");
    await db.exec("update public.wf_ad_campaigns set status='paused'");
    const paused = (await db.query("select public.ad_delivery_select('in_feed',null,'20000000-0000-4000-8000-000000000005',null) result")).rows[0].result;
    assert.equal(paused.reason, "no_fill");
  } finally { await db.close(); }
});

test("direct tables are inaccessible while server delivery remains callable", async () => {
  const db = await fixture();
  try {
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.wf_ad_campaigns"), /permission denied/i);
    await assert.rejects(db.query("select public.ad_delivery_select('in_feed',null,'30000000-0000-4000-8000-000000000001',null)"), /permission denied/i);
    await db.exec("reset role; set role service_role");
    const result = (await db.query("select public.ad_delivery_select('in_feed',null,'30000000-0000-4000-8000-000000000002',null) result")).rows[0].result;
    assert.equal(result.reason, "no_fill");
    assert.equal(result.externalFallback, "disabled");
  } finally { await db.close(); }
});
