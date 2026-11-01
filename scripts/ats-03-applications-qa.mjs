import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("ATS-03 contract keeps invitations, applications and provider boundaries explicit",()=>{
  const sql=read("supabase/migrations/20261101090000_ats_03_invitations_lifecycle.sql");
  for(const table of ["wf_ats_candidate_invitations","wf_ats_applications","wf_ats_application_tasks","wf_ats_application_audit"])assert.match(sql,new RegExp(table));
  assert.match(sql,/enable row level security/g);assert.match(sql,/revoke all on public\.wf_ats_applications/);assert.match(sql,/applicant_auth_user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/pipeline_version_id/);assert.match(sql,/due_at remains empty|due_at is null|due_at/);assert.doesNotMatch(sql,/auto(?:matic)?_reject|automatically reject/i);
  const status=read("docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt");
  assert.match(status,/ATS_APPLICATION_STATUS: draft, submitted, withdrawn, employer_closed/);
  assert.match(status,/ATS_APPLICATION_TASK_STATUS: not_started, in_progress, submitted, completed, skipped, review_required/);
  const event=read("docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt");assert.match(event,/ATS_APPLICATION_SUBMITTED/);assert.match(event,/ATS_APPLICATION_WITHDRAWN/);
});
test("ATS-03 user surfaces expose apply, workspace and candidate progress without membership conflation",()=>{
  const publicJob=read("app/jobs/[id]/page.tsx");assert.match(publicJob,/Apply now/);
  const employer=read("app/employer/applications/page.tsx");assert.match(employer,/No task state makes an automatic hiring decision/);
  const candidate=read("app/candidate/hiring/page.tsx");assert.match(candidate,/No deadline assigned/);
  const access=read("components/ats/external-applicant-access.tsx");assert.match(access,/does not create an employer or Student membership/);
});
