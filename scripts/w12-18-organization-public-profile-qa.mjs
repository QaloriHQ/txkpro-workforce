import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/staging/migrations/20261013121316_workforce_w12_18_19_21_public_trust.sql", "utf8");
const publicPage = readFileSync("components/public/organization-page.tsx", "utf8");
const editor = readFileSync("components/public/organization-profile-editor.tsx", "utf8");

test("organization publication is limited to approved organization administrators", () => {
  assert.match(migration, /organization_manage_allowed/);
  assert.match(migration, /employer_owner','employer_admin/);
  assert.match(migration, /institution_super_admin','institution_admin/);
  assert.match(migration, /approval_status\)='approved'/);
  assert.match(migration, /Organization profile management denied/);
});

test("public organization output is a curated projection", () => {
  assert.match(migration, /organization_public_read/);
  assert.doesNotMatch(publicPage, /business_email|private|hiring_need|student/);
  assert.match(publicPage, /EducationalOrganization/);
  assert.match(publicPage, /Published courses/);
  assert.match(publicPage, /Employer Certifications/);
});

test("slugs redirect and public controls remain explicit", () => {
  assert.match(migration, /wf_public_page_redirects/);
  assert.match(migration, /visibility not in \('public','private'\)/);
  assert.match(editor, /robotsIndex/);
  assert.match(editor, /visibility/);
});
