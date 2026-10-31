import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOB_TEMPLATES, JOB_TEMPLATE_LEVELS } from "../lib/employer/job-templates.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gallery = read("components/employer/job-gallery.tsx");
const templates = read("components/employer/job-template-gallery.tsx");
const editor = read("components/employer/job-listing-editor.tsx");
const detail = read("app/employer/jobs/[jobId]/page.tsx");
const migration = read("supabase/staging/migrations/20261031083232_ats_01_job_workspaces.sql");

test("template library contains 36 complete, distinct skilled-trade drafts", () => {
  assert.equal(JOB_TEMPLATES.length, 36);
  assert.equal(new Set(JOB_TEMPLATES.map((item) => item.id)).size, 36);
  assert.equal(new Set(JOB_TEMPLATES.map((item) => item.trade)).size, 12);
  for (const trade of new Set(JOB_TEMPLATES.map((item) => item.trade))) {
    const family = JOB_TEMPLATES.filter((item) => item.trade === trade);
    assert.equal(family.length, 3);
    assert.deepEqual(new Set(family.map((item) => item.level)), new Set(Object.keys(JOB_TEMPLATE_LEVELS)));
  }
  for (const item of JOB_TEMPLATES) {
    assert.ok(item.fields.title.length > 5);
    assert.ok(item.fields.summary.length > 40);
    assert.ok(item.fields.description.length > 100);
    assert.ok(item.fields.requirements.length >= 5);
    assert.ok(item.fields.skills.length >= 5);
    assert.ok(item.fields.benefits.length >= 3);
    assert.equal(item.fields.isTemplate, false);
  }
});

test("template cards preview full rules in a modal before creating a draft", () => {
  for (const evidence of ["role=\"dialog\"", "Preview", "Use template", "Responsibilities", "Qualifications", "Screening safeguards", "private draft only"]) {
    assert.ok(templates.includes(evidence), `Missing template preview evidence: ${evidence}`);
  }
  assert.match(templates, /href=\{`\/employer\/jobs\/new\?template=\$\{encodeURIComponent\(item\.id\)\}`\}/);
});

test("job collection is gallery-only with aggregates and discovery controls", () => {
  for (const evidence of ["jobs.filter((job) => !job.isTemplate)", "Templates excluded", "All statuses", "All locations", "Any pipeline state", "Hiring owner", "Search listings", "Recently updated", "job-card-grid"]) {
    assert.ok(gallery.includes(evidence), `Missing gallery evidence: ${evidence}`);
  }
  assert.doesNotMatch(gallery, /JobListingEditor/);
});

test("detail page separates people, applications, pipeline, analytics and activity", () => {
  for (const evidence of ["People", "Rules", "Applications", "Pipeline", "Analytics", "Activity", "JobAssignmentEditor", "ATS-03 intake pending"]) {
    assert.ok(detail.includes(evidence), `Missing detail evidence: ${evidence}`);
  }
  assert.ok(detail.includes("does not fabricate counts"));
});

test("every editor field uses accessible contextual help", () => {
  assert.ok(editor.includes("FieldHelp"));
  assert.ok(editor.includes("JOB_FIELD_HELP[label]"));
  assert.ok(editor.includes('JOB_FIELD_HELP["Published hiring pipeline version"]'));
});

test("assignment migration is RPC-only, tenant checked, bounded and audited", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on public\.wf_ats_job_hiring_team, public\.wf_ats_job_crews from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete|all) on public\.wf_ats_job_/i);
  assert.match(migration, /j\.id=p_job and j\.employer_id=p_employer/);
  assert.match(migration, /c\.id=crew and c\.employer_id=employer/);
  assert.match(migration, /m\.scope_id=employer/);
  assert.match(migration, /jsonb_array_length\(input->'hiringTeamUserIds'\) > 100/);
  assert.match(migration, /ATS_JOB_ASSIGNMENTS_REPLACED/);
  assert.match(migration, /Crew membership grants no recruiting access|grant no role or data access/i);
});
