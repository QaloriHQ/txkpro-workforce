import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sql = () =>
  read(
    "supabase/staging/migrations/20261003150129_workforce_wave12_institution_employer_directory.sql",
  );

test("W12-04 ships static Institution Employer directory and detail pages", () => {
  assert.match(read("app/institution/employers/page.tsx"), /Employer directory/);
  assert.match(read("app/institution/employers/[id]/page.tsx"), /Employer detail/);
  assert.match(read("components/institution/workspace-nav.tsx"), /href: "\/institution\/employers"/);
});

test("W12-04 repository methods call narrow Institution Employer RPCs", () => {
  const repo = read("lib/institution/learning-repository.ts");
  assert.match(repo, /institution_employers_directory/);
  assert.match(repo, /institution_employer_detail/);
  assert.match(repo, /p_institution_id: context\.institutionId/);
});

test("W12-04 SQL scopes Employer access server-side", () => {
  const text = sql();
  assert.match(text, /create or replace function security\.institution_employer_accessible/);
  assert.match(text, /security\.institution_learning_has_any_scope/);
  assert.match(text, /security\.can_view_institution_employer_learning/);
  assert.match(text, /security\.employer_is_approved/);
  assert.match(text, /wf_employer_talent_scopes/);
});

test("W12-04 SQL exposes only shared Employer read models", () => {
  const text = sql();
  for (const fn of [
    "institution_employers_directory",
    "institution_employer_detail",
  ]) {
    assert.match(text, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(text, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(text, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(text, /visibility='institution_shared'/);
  assert.match(text, /wf_hiring_needs/);
  assert.match(text, /wf_employer_micro_certs/);
  assert.match(text, /wf_referrals/);
  assert.match(text, /wf_placements/);
  assert.match(text, /wf_retention_milestones/);
  assert.match(text, /wf_retention_cases/);
});

test("W12-04 Institution Employer detail excludes private hiring and retention data", () => {
  const text = sql();
  const detailStart = text.indexOf("create or replace function public.institution_employer_detail");
  const revokeStart = text.indexOf("revoke all on function security.institution_employer_accessible");
  assert.ok(detailStart > -1 && revokeStart > detailStart);
  const detail = text.slice(detailStart, revokeStart);
  assert.doesNotMatch(detail, /wf_employer_candidate_notes/);
  assert.doesNotMatch(detail, /wf_interview_evaluations/);
  assert.doesNotMatch(detail, /wf_retention_case_notes/);
  assert.doesNotMatch(detail, /raw_response/);
  assert.doesNotMatch(detail, /privateNotes/);
  assert.doesNotMatch(detail, /evaluation/i);
});

test("W12-04 pages render expected evidence groups and privacy boundary", () => {
  const detailPage = read("app/institution/employers/[id]/page.tsx");
  for (const expected of [
    "Hiring needs",
    "Employer Training",
    "Referral activity",
    "Placement outcomes",
    "Retention",
    "Employer exposure",
    "Privacy boundary",
  ]) {
    assert.match(detailPage, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
  assert.match(detailPage, /Employer-private candidate notes/);
  assert.match(detailPage, /raw retention responses/);
});

test("W12 QA includes Institution Employer directory regression coverage", () => {
  assert.match(
    read("package.json"),
    /scripts\/wave12-institution-employer-directory-qa\.mjs/,
  );
});
