import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLANK_JOB, canCreateJob, canEditJob, canManageJobStatus,
  parseJobPatch, jobToDatabase, mapJob,
} from "../lib/employer/job-listings.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261018193301_ats_01_job_listings.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/employer/job-listings-repository.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/employer/job-listing-editor.tsx", import.meta.url), "utf8");
const publishRoute = readFileSync(new URL("../app/api/employer/jobs/[id]/publish/route.ts", import.meta.url), "utf8");

test("roles obey employer owner/admin, recruiter, assigned-manager and read-only boundaries", () => {
  for (const role of ["employer_owner", "employer_admin", "recruiter"]) {
    assert.equal(canCreateJob(role), true);
    assert.equal(canEditJob(role, "actor", null), true);
  }
  assert.equal(canCreateJob("hiring_manager"), false);
  assert.equal(canEditJob("hiring_manager", "actor", "actor"), true);
  assert.equal(canEditJob("hiring_manager", "actor", "other"), false);
  assert.equal(canEditJob("employer_read_only", "actor", "actor"), false);
  assert.equal(canManageJobStatus("recruiter"), false);
  assert.equal(canManageJobStatus("employer_admin"), true);
});

test("editable content is whitelisted and validated", () => {
  const patch = parseJobPatch({ title: " Apprentice Electrician ", payMin: 15, payMax: 22, requirements: [" OSHA 10 "], isTemplate: true });
  assert.deepEqual(patch, { title: "Apprentice Electrician", payMin: 15, payMax: 22, requirements: ["OSHA 10"], isTemplate: true });
  assert.deepEqual(jobToDatabase(patch), { title: "Apprentice Electrician", pay_min: 15, pay_max: 22, requirements_json: ["OSHA 10"], is_template: true });
  for (const field of ["employerId", "status", "revision", "pipelineVersionId", "createdByUserId", "sourceJobListingId"]) {
    assert.throws(() => parseJobPatch({ title: "Example", [field]: "attacker" }), /not editable/);
  }
  assert.throws(() => parseJobPatch({ payMin: -5 }), /Invalid/);
  assert.throws(() => parseJobPatch({ remotePolicy: "teleport" }), /Invalid/);
  assert.throws(() => parseJobPatch({ payMin: 50, payMax: 10 }), /cannot exceed/);
  assert.throws(() => parseJobPatch({ title: "x".repeat(181) }), /too long/);
  assert.throws(() => parseJobPatch({ benefits: Array(31).fill("X") }), /at most 30/);
  assert.throws(() => parseJobPatch({ status: "published" }), /not editable/);
  assert.throws(() => parseJobPatch({}), /No editable/);
});

test("draft defaults and returned values are stable for wizard/advanced modes", () => {
  assert.equal(BLANK_JOB.title, "");
  assert.equal(BLANK_JOB.isTemplate, false);
  assert.deepEqual(BLANK_JOB.requirements, []);
  const job = mapJob({
    id: "uuid", job_listing_id: "JOB-123", employer_id: "tenant",
    title: "Electrician", status: "draft", revision: 4,
    requirements_json: ["OSHA", 42], pay_min: "22.50", pay_max: null,
    remote_policy: "onsite", employment_type: "full_time", pay_period: "hour",
  });
  assert.equal(job.employerId, "tenant");
  assert.equal(job.revision, 4);
  assert.deepEqual(job.requirements, ["OSHA"]);
  assert.equal(job.payMin, 22.5);
  assert.equal(job.payMax, null);
});

test("migration isolates tenants and audit, fails closed until ATS-02", () => {
  const dollarPair = String.fromCharCode(36, 36);
  assert.equal(migration.split("as " + dollarPair).length - 1, 2);
  assert.equal(migration.split(dollarPair + ";").length - 1, 2);
  assert.match(migration, /references public\.contractors\(contractor_id\)/);
  assert.match(migration, /alter table public\.wf_ats_job_listings enable row level security/i);
  assert.match(migration, /security\.member_of_employer\(employer_id\)/);
  assert.match(migration, /security\.wf_ats_has_employer_role\(employer_id/i);
  assert.match(migration, /Hiring Need must belong to the same employer/);
  assert.match(migration, /Job source must belong to the same employer/);
  assert.match(migration, /Assigned manager requires an active scoped employer membership/);
  assert.ok(migration.includes("new.revision := 1"));
  assert.match(migration, /created_by_user_id = security\.current_legacy_user_id\(\)/);
  assert.match(migration, /on public\.wf_ats_job_listings\(employer_id, status,/);
  assert.match(migration, /security\.wf_ats_job_audit/);
  assert.match(migration, /revoke all on security\.wf_ats_job_audit from public, anon, authenticated/);
  assert.match(migration, /if new\.status in \('published','paused','closed'\) or new\.pipeline_version_id is not null then/);
  assert.match(migration, /revoke all on public\.wf_ats_public_jobs from anon, authenticated/);
  assert.match(migration, /grant select on public\.wf_ats_public_jobs to anon, authenticated/);
  assert.doesNotMatch(migration, /grant (?:all|insert|update|delete) on public\.wf_ats_public_jobs to anon/i);
});

test("repository enforces exact tenant, ownership and compare-and-swap revisions", () => {
  assert.match(repository, /canEditJob\(context\.role, context\.legacyUserId, original\.assignedHiringManagerUserId\)/);
  assert.match(repository, /\.eq\("employer_id", context\.employerId\)\.eq\("id", id\)\.eq\("revision", revision\)/);
  assert.match(repository, /source_job_listing_id: source\.id/);
  assert.match(repository, /status: "draft"/);
  assert.match(repository, /Never copy an active pipeline binding/);
  assert.match(publishRoute, /publishEmployerJob/);
  assert.match(publishRoute, /pipelineVersionId/);
  assert.match(publishRoute, /requireEmployerContext/);
  assert.match(publishRoute, /requireEmployerContext/);
});

test("editor serializes unsaved revisions when switching records", () => {
  for (const evidence of [
    "revisionRef.current = payload.job.revision",
    "editGeneration.current === generation",
    "for (let attempt = 0; attempt < 5;",
    "inFlight.current && !(await inFlight.current)",
    "beforeunload",
    "Guided wizard",
    "Advanced editor",
  ]) {
    assert.ok(editor.includes(evidence), "Missing editor invariant: " + evidence);
  }
});
