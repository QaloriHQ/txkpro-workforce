import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Institution navigation receives server-derived roles and scopes", () => {
  const files = [
    "app/institution/page.tsx",
    "app/institution/[section]/page.tsx",
    "app/institution/learning/page.tsx",
    "app/institution/learning/[id]/assign/page.tsx",
    "app/institution/learning/assignments/page.tsx",
    "app/institution/learning/assignments/[assignmentId]/page.tsx",
    "app/institution/learning/badges/page.tsx",
    "app/institution/learning/production/page.tsx",
    "app/institution/students/page.tsx",
    "app/institution/students/[studentId]/page.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    if (!source.includes("<InstitutionWorkspaceNav")) continue;
    assert.match(source, /roles=\{context\.roles\}/, `${file} passes canonical roles`);
    assert.match(source, /scopes=\{context\.scopes\}/, `${file} passes canonical scopes`);
  }
});

test("Institution role policy preserves the source-of-truth role matrix", () => {
  const source = read("lib/institution/policy.ts");
  for (const role of [
    "institution_super_admin",
    "institution_admin",
    "department_head",
    "program_coordinator",
    "instructor",
    "assistant_instructor",
    "career_services",
    "read_only_analyst",
  ]) {
    assert.match(source, new RegExp(`${role}: \\{`), `${role} policy exists`);
  }

  assert.match(source, /assistant_instructor:[\s\S]*referrals: "draft"/);
  assert.match(source, /read_only_analyst:[\s\S]*reports: full/);
  assert.match(source, /team: none, audit: read, settings: none/);
  assert.match(source, /institutionCanView\([\s\S]*institutionHasServerScope/);
});

test("Production Institution auth avoids prototype role switching", () => {
  const files = [
    "components/institution/workspace-nav.tsx",
    "lib/institution/auth.ts",
    "lib/institution/policy.ts",
    "app/institution/page.tsx",
    "app/institution/[section]/page.tsx",
  ];
  const banned = /view as|role switcher|prototype role|demo mode/i;
  for (const file of files) {
    assert.doesNotMatch(read(file), banned, `${file} has no prototype role switcher`);
  }
});

test("W12 SQL keeps role and scope checks server-side", () => {
  const sql = read(
    "supabase/staging/migrations/20260928211726_workforce_wave12_institution_role_authorization.sql",
  );
  assert.match(sql, /create or replace function security\.institution_scope_contains/);
  assert.match(sql, /create or replace function public\.institution_learning_access_context/);
  assert.match(sql, /r\.auth_user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on public\.wf_institution_scope_bindings from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.institution_learning_access_context\(\)\s+to authenticated,service_role/);
});
