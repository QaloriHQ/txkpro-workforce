import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ui = read("components/advertiser/advertiser-dashboard-v2.tsx");
const api = read("app/api/advertiser/route.ts");
const migration = read(
  "supabase/migrations/20261017123136_ads_07_10_manager_workspace.sql",
);

test("campaign wizard follows the approved six-step sequence", () => {
  for (const label of [
    "Campaign name",
    "Objective",
    "Audience",
    "Ad creative & preview",
    "Budget & duration",
    "Overview",
  ])
    assert.match(ui, new RegExp(`\\"${label}\\"`));
  assert.match(ui, /Step \{start\} of 6/);
  assert.match(ui, /objective-card/);
  assert.match(ui, /role="tooltip"/);
  assert.match(ui, /Update draft/);
  assert.match(api, /p_campaign_id: body\.campaignId \|\| null/);
  assert.match(ui, /a\.id === existingGroup\?\.audienceId/);
});
test("draft audience edits safely fork unique names and reuse saved identity", () => {
  assert.match(ui, /function nextCampaignAudienceName\(/);
  assert.match(ui, /existingNames\.map\(\(value\) => value\.toLowerCase\(\)\)/);
  assert.match(ui, /const suffix = number === 1 \? "" :/);
  assert.match(ui, /nextCampaignAudienceName\(draft\.name,/);
  assert.match(ui, /setLocalAudience\(\{ id: audienceId, name \}\)/);
  assert.match(ui, /update\(\{ audienceId \}\)/);
  assert.match(ui, /audienceId: ""/); // Manual targeting edits detach the shared source.
});
test("standalone managers and reusable selections are present", () => {
  for (const label of ["Ad groups", "Audiences", "Creative library"])
    assert.match(ui, new RegExp(label));
  assert.match(ui, /Use a saved audience/);
  assert.match(ui, /Saved creative set/);
  assert.match(ui, /Saved variation/);
  assert.match(ui, /Upload photo or video/);
  assert.match(ui, /PlacementPreviews/);
});
test("privacy and enterprise storage controls are database enforced", () => {
  for (const table of [
    "wf_ad_audiences",
    "wf_ad_assets",
    "wf_ad_creative_sets",
    "wf_ad_creative_variations",
    "wf_ad_group_variations",
    "wf_ad_rate_cards",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
  assert.match(migration, /values\('ad-assets','ad-assets',false/);
  assert.match(migration, /futureAudienceCapabilities/);
  assert.doesNotMatch(migration, /futureAudienceCapabilities'.*true/);
  assert.match(migration, /audience_type <> 'contextual'/);
  assert.match(
    migration,
    /CRM, behavioral retargeting, and lookalikes remain disabled|crmUploads',false/,
  );
});
test("budget estimates are rate-card driven", () => {
  assert.match(ui, /Rate card required/);
  assert.match(ui, /estimatedCpm/);
  assert.match(ui, /plannedMinor/);
  assert.match(migration, /wf_ad_rate_cards/);
  assert.doesNotMatch(migration, /insert into public\.wf_ad_rate_cards/);
});
