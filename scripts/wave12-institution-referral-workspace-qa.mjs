import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sql = () =>
  read(
    "supabase/staging/migrations/20261003133327_workforce_wave12_institution_referral_workspace.sql",
  );

test("W12-03 ships Institution referral workspace routes and server API", () => {
  assert.match(read("app/institution/referrals/page.tsx"), /Referral workspace/);
  assert.match(
    read("app/institution/referrals/[id]/page.tsx"),
    /Employer-private candidate notes, interview messages, and evaluation/,
  );
  assert.match(
    read("components/institution/referral-create-form.tsx"),
    /Student referral visibility\s+consent|Consent:/,
  );
  assert.match(
    read("app/api/institution/referrals/route.ts"),
    /institutionCanManage\(context, "referrals"\)/,
  );
});

test("Institution referral API validates shared notes before creating referrals", () => {
  const route = read("app/api/institution/referrals/route.ts");
  assert.match(route, /validateReferralNotePolicy/);
  assert.match(route, /p_note|note: referralNote\.note/);
  assert.doesNotMatch(route, /slice\(0, 2000\)/);
});

test("W12-03 SQL restores Company Training snapshot and preserves D-05 and D-09 controls", () => {
  const text = sql();
  assert.match(text, /create or replace function public\.institution_create_referral/);
  assert.match(text, /security\.referral_company_training_snapshot/);
  assert.match(text, /company_training_snapshot/);
  assert.match(text, /security\.student_referral_consent_status/);
  assert.match(text, /Student referral consent required/);
  assert.match(text, /security\.referral_note_policy_violation/);
  assert.match(text, /institution_shared_referral_note_v1/);
});

test("Institution referral workspace RPCs are scoped and auditable", () => {
  const text = sql();
  for (const fn of [
    "institution_referral_create_context",
    "institution_referrals_list",
    "institution_referral_detail",
  ]) {
    assert.match(text, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(text, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(text, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(text, /security\.institution_learning_has_any_scope/);
  assert.match(text, /security\.institution_student_accessible/);
  assert.match(text, /security\.emit_workforce_event/);
});

test("Institution referral detail excludes Employer-private hiring data", () => {
  const text = sql();
  const detailStart = text.indexOf("create or replace function public.institution_referral_detail");
  const detailEnd = text.indexOf("revoke all on function public.institution_create_referral");
  assert.ok(detailStart > -1 && detailEnd > detailStart);
  const detail = text.slice(detailStart, detailEnd);
  assert.doesNotMatch(detail, /wf_employer_candidate_notes/);
  assert.doesNotMatch(detail, /wf_interview_evaluations/);
  assert.doesNotMatch(detail, /evaluation/i);
  assert.doesNotMatch(detail, /privateNotes/);
  assert.doesNotMatch(detail, /message/);
  assert.match(detail, /wf_interview_requests/);
  assert.match(detail, /wf_placements/);
});

test("Institution detail page renders evidence groups separately", () => {
  const page = read("app/institution/referrals/[id]/page.tsx");
  for (const expected of [
    "companyTrainingSnapshot",
    "technicalSnapshot",
    "operationalSnapshot",
    "Employer outcome visibility",
    "Verified Skills snapshot",
    "Company Training",
  ]) {
    assert.match(page, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
});

test("W12 QA includes Institution referral workspace regression coverage", () => {
  assert.match(
    read("package.json"),
    /scripts\/wave12-institution-referral-workspace-qa\.mjs/,
  );
});
