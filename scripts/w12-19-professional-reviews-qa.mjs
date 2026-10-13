import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/staging/migrations/20261013121316_workforce_w12_18_19_21_public_trust.sql", "utf8");
const composer = readFileSync("components/professional/review-composer.tsx", "utf8");

test("review authorization uses canonical server-side roles and relationships", () => {
  assert.match(migration, /professional_review_eligibility/);
  assert.match(migration, /lower\(m\.role\)='student'/);
  assert.match(migration, /'instructor','assistant_instructor'/);
  assert.match(migration, /'institution_super_admin','institution_admin','department_head','program_coordinator'/);
  assert.match(migration, /retention_membership_matches/);
  assert.match(migration, /You cannot review your own profile/);
});

test("one review is revised in place and only moderation publishes it", () => {
  assert.match(migration, /on conflict\(target_public_page_id,reviewer_user_id\)/);
  assert.match(migration, /status='pending'/);
  assert.match(migration, /p_status not in \('published','hidden','removed'\)/);
  assert.match(migration, /security\.is_admin\(\)/);
  assert.match(composer, /Revisions return to moderation/);
});

test("reports and audit history are canonical and private", () => {
  assert.match(migration, /wf_profile_review_reports/);
  assert.match(migration, /PROFESSIONAL_REVIEW_SUBMITTED/);
  assert.match(migration, /PROFESSIONAL_REVIEW_REPORTED/);
  assert.match(migration, /PROFESSIONAL_REVIEW_MODERATED/);
  assert.match(migration, /revoke all on table public\.wf_profile_review_reports from public, anon, authenticated/);
});
