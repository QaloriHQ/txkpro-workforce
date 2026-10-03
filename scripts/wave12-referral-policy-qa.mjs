import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("D-05 and D-09 product decisions are documented", () => {
  assert.match(read("docs/decisions/D-05-referral-consent.md"), /Explicit student approval is required/);
  assert.match(read("docs/decisions/D-09-referral-notes.md"), /professional context only/);
});

test("Referral API validates shared notes before calling the RPC", () => {
  const route = read("app/api/referrals/route.ts");
  assert.match(route, /validateReferralNotePolicy/);
  assert.match(route, /p_note: referralNote\.note/);
  assert.doesNotMatch(route, /slice\(0, 2000\)/);
});

test("Application referral-note policy blocks prohibited employer-visible content", () => {
  const policy = read("lib/referrals/policy.ts");
  for (const term of [
    "social security",
    "medical",
    "background check",
    "drug screen",
    "retention case",
    "answer key",
  ]) {
    assert.match(policy, new RegExp(term.replace(" ", "\\s?"), "i"));
  }
  assert.match(policy, /MAX_REFERRAL_NOTE_LENGTH = 2000/);
});

test("Referral SQL requires consent and classifies shared notes", () => {
  const sql = read(
    "supabase/staging/migrations/20261003021500_workforce_d05_d09_referral_policy.sql",
  );
  assert.match(sql, /create table if not exists public\.wf_student_referral_consents/);
  assert.match(sql, /security\.student_referral_consent_status/);
  assert.match(sql, /Student referral consent required/);
  assert.match(sql, /security\.referral_note_policy_violation/);
  assert.match(sql, /institution_shared_referral_note_v1/);
  assert.match(sql, /referral_consent_checked_at/);
  assert.match(sql, /revoke all on table public\.wf_student_referral_consents from public, anon, authenticated/);
  assert.match(sql, /grant select on table public\.wf_student_referral_consents to authenticated/);
});

test("Referral SQL preserves Employer-private note boundaries", () => {
  const sql = read(
    "supabase/staging/migrations/20261003021500_workforce_d05_d09_referral_policy.sql",
  );
  assert.doesNotMatch(sql, /wf_employer_candidate_notes[\s\S]*institution_shared_note/);
  assert.match(sql, /Employer-private notes remain in wf_employer_candidate_notes/);
});
