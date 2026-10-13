import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/staging/migrations/20261013184924_workforce_w12_16b_season_finalization.sql",
  "utf8",
);
const types = readFileSync("lib/pro-points/types.ts", "utf8");
const server = readFileSync("lib/pro-points/server.ts", "utf8");
const progress = readFileSync("components/pro-points/progress-card.tsx", "utf8");
const workspace = readFileSync("components/pro-points/workspace.tsx", "utf8");
const statuses = readFileSync(
  "docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt",
  "utf8",
);
const events = readFileSync(
  "docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt",
  "utf8",
);

test("finalization freezes scores, memberships, ranks, rules, and level version", () => {
  assert.match(migration, /create table public\.wf_pro_season_finalizations/);
  assert.match(migration, /create table public\.wf_pro_season_standings/);
  assert.match(migration, /scoring_snapshot jsonb not null/);
  assert.match(migration, /institution_id text/);
  assert.match(migration, /cohort_id text/);
  assert.match(migration, /rank\(\) over\(partition by s\.cohort_id/);
  assert.match(migration, /rank\(\) over\(order by s\.season_points desc\)/);
  assert.match(migration, /pro_immutable_record/);
  assert.match(migration, /PRO_SEASON_FINALIZED/);
});

test("late awards and reversals are separate immutable correction evidence", () => {
  assert.match(migration, /create table public\.wf_pro_season_corrections/);
  assert.match(migration, /after insert on public\.wf_pro_ledger/);
  assert.match(migration, /PRO_SEASON_CORRECTION_RECORDED/);
  assert.match(migration, /unique references public\.wf_pro_ledger\(id\)/);
});

test("level versions are admin-only, future-effective, exact, and immutable", () => {
  assert.match(migration, /create table public\.wf_pro_level_versions/);
  assert.match(migration, /create table public\.wf_pro_level_thresholds/);
  assert.match(migration, /if not coalesce\(security\.is_admin\(\),false\)/);
  assert.match(migration, /v_effective<=date_trunc\('quarter'/);
  assert.match(migration, /jsonb_array_length\(v_thresholds\)<>10/);
  assert.match(migration, /v_value<=v_previous/);
  assert.match(migration, /\(1,1,0\),\(1,2,250\),\(1,3,750\)/);
  assert.match(migration, /\(1,9,18000\),\(1,10,25000\)/);
});

test("direct table access stays closed and definer functions fix search_path", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.%I from public,anon,authenticated/);
  const definers = migration.match(/security definer set search_path=''/g) ?? [];
  assert.ok(definers.length >= 7);
  assert.match(migration, /grant execute on function security\.pro_season_admin\(jsonb\),public\.pro_season_admin\(jsonb\) to authenticated/);
  assert.doesNotMatch(migration, /grant .*wf_pro_season_/i);
});

test("Student and administrator surfaces expose the new contracts", () => {
  for (const field of [
    "levelVersion",
    "nextLevelPoints",
    "pastSeasons",
    "canManageLevels",
    "levelVersions",
  ]) {
    assert.match(types, new RegExp(field));
  }
  assert.match(server, /"pro_season_admin"/);
  assert.match(progress, /Finalized seasons/);
  assert.match(workspace, /Schedule lifetime level thresholds/);
  assert.match(workspace, /Finalize due seasons/);
});

test("canonical status and event maps document the lifecycle", () => {
  assert.match(statuses, /PRO_POINTS_SEASON_STATUS: open, finalized/);
  assert.match(statuses, /A finalized season never reopens/);
  for (const event of [
    "PRO_SEASON_FINALIZED",
    "PRO_SEASON_CORRECTION_RECORDED",
    "PRO_LEVEL_VERSION_CREATED",
  ]) {
    assert.match(events, new RegExp(event));
  }
});
