import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/staging/migrations/20261016025814_workforce_ads_01_native_delivery.sql");
const placement = read("components/ads/sponsored-placement.tsx");
const feed = read("components/community/community-feed.tsx");
const article = read("components/community/public-community-post.tsx");
const preview = read("app/admin/ads/preview/page.tsx");
const deliveryRoute = read("app/api/ads/delivery/route.ts");
const statuses = read("docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt");
const events = read("docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt");
const permissions = read("docs/product-sources/core/TXKPRO_ROLE_PERMISSIONS_MATRIX.txt");
const ownership = read("docs/product-sources/core/TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt");

test("all four placements have preview and live surfaces", () => {
  for (const name of ["in_feed", "in_comments", "in_article", "multiplex"]) {
    assert.match(migration, new RegExp(`'${name}'`));
    assert.match(preview, new RegExp(name));
  }
  assert.match(feed, /placement="in_feed"/);
  assert.match(feed, /placement="in_comments"/);
  assert.match(feed, /placement="multiplex"/);
  assert.match(article, /placement="in_article"/);
});

test("delivery fails closed and external fallback remains disabled", () => {
  assert.match(deliveryRoute, /ADS_DELIVERY_ENABLED !== "true"/);
  assert.match(deliveryRoute, /externalFallback: "disabled"/);
  assert.match(migration, /'no_fill','externalFallback','disabled'/);
  assert.match(migration, /adv\.status='active'/);
  assert.match(migration, /c\.status='active'/);
  assert.match(migration, /cr\.status='approved'/);
  assert.match(migration, /cp\.enabled/);
  assert.match(migration, /f\.revoked_at is null/);
  assert.match(migration, /c\.ends_at is null or c\.ends_at>now\(\)/);
});

test("database access and targeting contract fail closed", () => {
  for (const table of ["wf_advertisers", "wf_ad_campaigns", "wf_ad_creatives", "wf_ad_campaign_placements", "wf_ad_campaign_audiences", "wf_ad_reviews", "wf_ad_funding_authorizations", "wf_ad_delivery_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.ad_delivery_select[\s\S]*to service_role/);
  assert.match(migration, /grant execute on function public\.ad_delivery_report[\s\S]*to authenticated/);
  assert.match(migration, /role_family text/);
  assert.match(migration, /topic text/);
  assert.match(migration, /broad_geography text/);
  assert.match(migration, /public_group_id text/);
  assert.doesNotMatch(migration, /target_(?:message|interview|placement|screening|retention)/i);
});

test("sponsored UI is clearly labeled and offers controls", () => {
  assert.match(placement, />Sponsored</);
  assert.match(placement, /ad\.advertiserName/);
  assert.match(placement, /> Hide</);
  assert.match(placement, /> Report</);
  assert.match(placement, /rel="noopener noreferrer sponsored"/);
  assert.match(placement, /intersectionRatio >= 0\.5/);
  assert.match(placement, /setTimeout[\s\S]*1000/);
  assert.match(placement, /preview \? <span>Preview only<\/span>/);
});

test("governance sources define lifecycle, event and privacy boundaries", () => {
  assert.match(statuses, /ADVERTISER_STATUS: pending_review, active, rejected, suspended/);
  assert.match(statuses, /AD_DELIVERY_EVENT_TYPE: served, viewable, clicked, invalidated, provider_reconciled/);
  assert.match(events, /AD_DELIVERY_RECORDED/);
  assert.match(permissions, /service-role-only functions/);
  assert.match(ownership, /Messages, private groups, private Workforce records/);
  assert.match(ownership, /External-network no-fill remains disabled/);
});
