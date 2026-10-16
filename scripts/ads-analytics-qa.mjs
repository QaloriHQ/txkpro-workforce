import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20261016114637_workforce_ads_03_analytics.sql");
const dashboard=read("components/advertiser/advertiser-dashboard.tsx");
const analyticsRoute=read("app/api/ads/analytics/route.ts");
const admin=read("components/admin/advertiser-review-queue.tsx");

test("analytics are advertiser scoped, aggregate only and export audited",()=>{assert.match(migration,/security\.advertiser_can\(p_advertiser_id/);assert.match(migration,/count\(distinct actor_user_id\)/);assert.doesNotMatch(migration,/jsonb_build_object\([^)]*actor_user_id/);assert.match(migration,/'REPORT_EXPORTED'/);assert.match(analyticsRoute,/text\/csv/)});
test("invalid traffic and provider reconciliation stay append-only and idempotent",()=>{assert.match(migration,/'invalidated'/);assert.match(migration,/'provider_reconciled'/);assert.match(migration,/on conflict\(delivery_group_id,event_type\) do nothing/);assert.match(migration,/wf_ad_budget_ledger_spend_reference_idx/);assert.match(migration,/PROVIDER_RECONCILIATION_MISMATCH/);assert.match(migration,/'AD_DELIVERY_INVALIDATED'/);assert.match(migration,/'AD_PROVIDER_RECONCILED'/)});
test("dashboard explains telemetry, spend, pacing and correction boundaries",()=>{for(const text of ["Aggregate analytics","asset load alone is not viewability","Anonymous reach is not inferred","No spend evidence","Export CSV"])assert.match(dashboard,new RegExp(text,"i"));assert.match(admin,/append-only evidence/i);assert.match(admin,/Reconcile provider spend/)});
test("analytics RPC and correction RPC deny anonymous execution",()=>{assert.match(migration,/revoke all on function public\.advertiser_analytics[\s\S]*from public,anon,authenticated/);assert.match(migration,/grant execute on function public\.advertiser_analytics[\s\S]*to authenticated/);assert.match(migration,/security\.is_admin\(\)/)});
