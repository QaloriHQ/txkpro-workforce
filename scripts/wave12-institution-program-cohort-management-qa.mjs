import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003151201_workforce_wave12_institution_program_cohort_management.sql";

test("W12-05 exposes scoped Program/Cohort read and mutation RPCs", () => {
  const sql = read(migration);
  assert.match(sql, /institution_program_cohort_management/);
  assert.match(sql, /institution_cohort_upsert/);
  assert.match(sql, /can_manage_institution_program_cohort/);
  assert.match(sql, /institution_learning_has_any_scope/);
  assert.match(sql, /institution_scope_contains/);
  assert.match(sql, /lower\(p_target_scope_type\)='program'/);
  assert.match(sql, /lower\(r\.scope_type\)='institution'/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /revoke all on function public\.institution_cohort_upsert/);
  assert.match(sql, /grant execute on function public\.institution_cohort_upsert/);
});

test("W12-05 metrics derive from canonical workforce records", () => {
  const sql = read(migration);
  for (const table of [
    "public.wf_student_profiles",
    "public.wf_student_skills",
    "public.wf_micro_cert_assignments",
    "public.wf_referrals",
    "public.wf_placements",
    "public.wf_retention_milestones",
    "public.wf_retention_cases",
  ]) {
    assert.match(sql, new RegExp(table.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(sql, /external_benchmark/i);
  assert.doesNotMatch(sql, /readiness_score/i);
});

test("W12-05 repository methods call scoped RPCs", () => {
  const repo = read("lib/institution/learning-repository.ts");
  assert.match(repo, /getInstitutionProgramCohortManagement/);
  assert.match(repo, /institution_program_cohort_management/);
  assert.match(repo, /upsertInstitutionCohort/);
  assert.match(repo, /institution_cohort_upsert/);
});

test("W12-05 Programs UI renders lifecycle and canonical evidence sections", () => {
  const page = read("app/institution/programs/page.tsx");
  for (const expected of [
    "Programs & Cohorts",
    "CohortEditor",
    "Student affiliation",
    "Readiness",
    "Employer Training",
    "Referral and placement outcomes",
    "Open retention",
  ]) {
    assert.match(page, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
  assert.match(page, /institutionCanManage\(context, "programs"\)/);
  assert.match(page, /saveAction=\{saveCohort\}/);
  const editor = read("components/institution/cohort-editor.tsx");
  assert.match(editor, /WorkspaceForm/);
  assert.match(editor, /useActionState/);
  assert.match(editor, /name="cohortId"/);
  assert.match(editor, /name="tradeId"/);
});

test("W12 QA includes Program/Cohort management regression coverage", () => {
  assert.match(
    read("package.json"),
    /scripts\/wave12-institution-program-cohort-management-qa\.mjs/,
  );
});
