import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003152455_workforce_wave12_institution_student_directory_profile.sql";

test("W12-06 exposes scoped Institution Student directory and profile RPCs", () => {
  const sql = read(migration);
  assert.match(sql, /institution_student_directory/);
  assert.match(sql, /institution_student_profile/);
  assert.match(sql, /institution_can_view_student_invitation/);
  assert.match(sql, /institution_student_accessible/);
  assert.match(sql, /institution_scope_contains/);
  assert.match(sql, /lower\(r\.role\)='student'/);
  assert.match(sql, /revoke all on function public\.institution_student_directory/);
  assert.match(sql, /grant execute on function public\.institution_student_profile/);
});

test("W12-06 directory covers canonical roster and pending Student invitations", () => {
  const sql = read(migration);
  assert.match(sql, /'student'::text as record_type/);
  assert.match(sql, /'invitation'::text as record_type/);
  assert.match(sql, /app_role_memberships/);
  assert.match(sql, /lower\(r\.status\) in \('pending','invited'\)/);
  assert.match(sql, /'membershipKey'/);
  assert.match(sql, /'acceptedAt'/);
  assert.match(sql, /'studentId'/);
});

test("W12-06 profile distinguishes verified and self-attested evidence", () => {
  const sql = read(migration);
  assert.match(sql, /'technicalSkills'/);
  assert.match(sql, /'evidenceClass'/);
  assert.match(sql, /'verified'/);
  assert.match(sql, /'self_attested'/);
  assert.match(sql, /'in_progress'/);
  assert.match(sql, /student_profile_readiness_evidence/);
});

test("W12-06 profile derives outcomes from canonical workforce records", () => {
  const sql = read(migration);
  for (const table of [
    "public.wf_student_profiles",
    "public.wf_student_skills",
    "public.wf_micro_cert_assignments",
    "public.wf_referrals",
    "public.wf_interview_requests",
    "public.wf_placements",
    "public.wf_retention_milestones",
    "public.wf_retention_cases",
  ]) {
    assert.match(sql, new RegExp(table.replaceAll(".", "\\.")));
  }
  assert.match(sql, /'activity'/);
  assert.match(sql, /'retention'/);
});

test("W12-06 excludes private Employer, interview, and retention internals", () => {
  const sql = read(migration);
  for (const forbidden of [
    "wf_employer_candidate_notes",
    "wf_interview_evaluations",
    "wf_retention_case_notes",
    "raw_response",
  ]) {
    assert.doesNotMatch(sql, new RegExp(forbidden));
  }
});

test("W12-06 repository methods call scoped Student RPCs", () => {
  const repo = read("lib/institution/learning-repository.ts");
  assert.match(repo, /listInstitutionStudents/);
  assert.match(repo, /institution_student_directory/);
  assert.match(repo, /getInstitutionStudentProfile/);
  assert.match(repo, /institution_student_profile/);
});

test("W12-06 Student pages render invitation state and evidence boundaries", () => {
  const directory = read("app/institution/students/page.tsx");
  const profile = read("app/institution/students/[studentId]/page.tsx");
  for (const expected of [
    "Pending invitations",
    "Self-attested or in review",
    "Awaiting acceptance",
    "Open profile",
  ]) {
    assert.match(directory, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
  for (const expected of [
    "Identity and membership",
    "Self-attested and in review",
    "Referrals",
    "Retention",
    "Activity history",
    "Evidence boundary",
  ]) {
    assert.match(profile, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
});

test("W12 QA includes Student directory/profile regression coverage", () => {
  assert.match(
    read("package.json"),
    /scripts\/wave12-institution-student-directory-profile-qa\.mjs/,
  );
});
