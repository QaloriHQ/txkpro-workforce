import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = readdirSync(
  new URL("../supabase/staging/migrations", import.meta.url),
).find((name) => name.endsWith("_workforce_w12_07_retention_workspace.sql"));
const sql = read(`supabase/staging/migrations/${migration}`);
test("retention reuses canonical tables and keeps direct tables closed", () => {
  assert.match(sql, /alter table public.wf_retention_cases/);
  assert.match(sql, /insert into public.wf_retention_case_notes/);
  assert.match(
    sql,
    /revoke all on security.retention_mutation_receipts from public,anon,authenticated/,
  );
  assert.doesNotMatch(sql, /grant .* on .*wf_retention_cases/);
});
test("case authorization binds each membership role to scope and active account", () => {
  assert.match(sql, /lower\(u.status\)='active'/);
  assert.match(sql, /lower\(r.scope_type\)='platform'/);
  assert.match(
    sql,
    /retention_membership_matches\(r.id,s.school_id,s.cohort_id\)/,
  );
  assert.match(sql, /inv.institution_id=p_institution_id/);
  assert.match(sql, /count\(\*\).*public.wf_institutions/);
  assert.doesNotMatch(sql, /security.is_admin|raw_user_meta_data/);
});
test("replay requires current scope, a locked row, and the same request body", () => {
  const lock = sql.indexOf("for update;");
  const receipt = sql.indexOf("select request_body");
  const version = sql.indexOf("if v_case.version<>");
  assert.ok(lock < receipt && receipt < version);
  assert.match(sql.slice(lock, receipt), /retention_actor_access/);
  assert.match(sql, /if v_prior<>v_body/);
});
test("canonical lifecycle records closure and contact evidence atomically", () => {
  assert.match(sql, /Closure requires a resolution code and internal note/);
  assert.match(sql, /Record the contact outcome/);
  assert.match(sql, /Closed cases cannot be changed/);
  assert.match(sql, /RETENTION_CASE_RESOLVED/);
  assert.match(sql, /insert into public.platform_audit_events/);
});
test("retention payloads and mutations exclude employer-private and evidence domains", () => {
  assert.doesNotMatch(
    sql,
    /wf_employer_candidate_notes|wf_interview_evaluations|raw_response|sender_phone|wf_student_skills/,
  );
  assert.doesNotMatch(
    sql,
    /update public.wf_placements|insert into public.wf_notifications/,
  );
  assert.match(sql, /'retention_case',p_case_id,null,v_inst,v_student/);
});
test("public facades remain invokers with explicit grants", () => {
  for (const name of [
    "retention_cases_list",
    "retention_case_detail",
    "retention_case_update",
  ]) {
    assert.match(
      sql,
      new RegExp(`create function public.${name}[\\s\\S]*?security invoker`),
    );
  }
  assert.match(sql, /from public,anon;/);
});
test("API writes use verified authenticated RPC and private responses", () => {
  const api = read("app/api/retention/cases/[caseId]/route.ts");
  const repository = read("lib/retention/repository.ts");
  assert.match(repository, /client.auth.getUser\(\)/);
  assert.doesNotMatch(repository + api, /service.role|createAdmin/i);
  assert.match(api, /expectedVersion/);
  assert.match(api, /requestKey/);
  assert.match(api, /private, no-store/);
  assert.match(api, /Request origin denied/);
});
test("both operator workspaces expose queue and case detail", () => {
  for (const role of ["institution", "admin"])
    for (const suffix of ["page.tsx", "[caseId]/page.tsx"]) {
      assert.match(
        read(`app/${role}/retention/${suffix}`),
        /RetentionWorkspacePage/,
      );
    }
  const ui = read("components/retention/detail.tsx");
  assert.match(ui, /Retry same update/);
  assert.match(ui, /Internal notes/);
  assert.match(ui, /aria-live/);
  assert.match(ui, /item.canManage/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);
});
