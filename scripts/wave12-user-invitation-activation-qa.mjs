import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003162000_workforce_wave12_user_invitation_activation.sql";

test("W12-05A creates a canonical invitation lifecycle with RLS", () => {
  const sql = read(migration);
  assert.match(sql, /create table if not exists public\.wf_user_invitations/);
  assert.match(sql, /'pending','accepted','expired','revoked','cancelled'/);
  assert.match(sql, /wf_user_invitations_pending_semantic_key/);
  assert.match(sql, /enable row level security/);
  assert.match(
    sql,
    /revoke all on table public\.wf_user_invitations from public, anon, authenticated/,
  );
  assert.doesNotMatch(sql, /token_hash|plaintext_token|raw_token/i);
});

test("W12-05A reuses server role and scope authorization", () => {
  const sql = read(migration);
  assert.match(sql, /security\.can_invite_institution_member/);
  assert.match(sql, /security\.can_invite_student/);
  assert.match(sql, /security\.has_employer_role/);
  assert.match(sql, /security\.institution_scope_contains/);
  assert.match(sql, /security\.invitation_target_valid/);
  assert.match(sql, /lower\(r\.role\)='super_admin'/);
  assert.match(sql, /Invitation scope denied/);
});

test("W12-05A acceptance requires Auth email match and activates membership idempotently", () => {
  const sql = read(migration);
  assert.match(sql, /from auth\.users a/);
  assert.match(sql, /Invitation does not belong to this account/);
  assert.match(sql, /app_role_memberships/);
  assert.match(sql, /status='active'/);
  assert.match(sql, /ROLE_MEMBERSHIP_APPROVED/);
  assert.match(sql, /role_membership_approved:/);
  assert.match(sql, /idempotent',true/);
});

test("W12-05A delivery uses Supabase one-time Auth links without creating duplicate existing users", () => {
  const service = read("lib/invitations/service.ts");
  assert.match(service, /auth\.admin\.inviteUserByEmail/);
  assert.match(service, /auth\.signInWithOtp/);
  assert.match(service, /shouldCreateUser:\s*false/);
  assert.match(service, /workforce_invitation_resolve_identity/);
  assert.match(service, /workforce_invitation_link_identity/);
  assert.match(service, /workforce_invitation_mark_delivery/);
  assert.doesNotMatch(service, /service_role|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});

test("W12-05A exposes reusable individual, bulk, resend, revoke, and accept APIs", () => {
  for (const path of [
    "app/api/invitations/route.ts",
    "app/api/invitations/bulk/route.ts",
    "app/api/invitations/[invitationId]/route.ts",
    "app/api/invitations/accept/route.ts",
  ]) {
    assert.doesNotMatch(read(path), /user_metadata.*role|requested_role/i);
  }
  assert.match(read("app/api/invitations/route.ts"), /createAndSendInvitation/);
  assert.match(read("app/api/invitations/bulk/route.ts"), /MAX_BULK_INVITATIONS/);
  assert.match(read("app/api/invitations/[invitationId]/route.ts"), /resendInvitation/);
  assert.match(read("app/api/invitations/[invitationId]/route.ts"), /closeInvitation/);
  assert.match(read("app/api/invitations/accept/route.ts"), /acceptMyInvitation/);
});

test("W12-05A Student directory provides scoped invite lifecycle controls", () => {
  const page = read("app/institution/students/page.tsx");
  assert.match(page, /Invite a Student/);
  assert.match(page, /Send invitation/);
  assert.match(page, /Resend/);
  assert.match(page, /Revoke/);
  assert.match(page, /name="scopeType" value="cohort"/);
  assert.match(page, /institution_super_admin/);
  assert.match(page, /program_coordinator/);
  assert.match(page, /user_invitation:/);
});

test("W12-05A preserves invited Student affiliation and additive memberships", () => {
  const auth = read("lib/auth.ts");
  const onboarding = read("app/api/onboarding/route.ts");
  const onboardingPage = read("app/onboarding/page.tsx");
  assert.match(auth, /hasRoleMembership/);
  assert.match(onboarding, /syncAcceptedStudentInvitationAffiliation/);
  assert.match(onboarding, /wf_user_invitations/);
  assert.match(onboarding, /cohort_id/);
  assert.match(onboarding, /hasRoleMembership\(account\.memberships, role\)/);
  assert.match(onboardingPage, /requestedMembershipRole/);
  assert.match(onboardingPage, /hasRoleMembership/);
});

test("W12-06 unapplied migration uses the five-argument Institution scope contract", () => {
  const sql = read(
    "supabase/staging/migrations/20261003152455_workforce_wave12_institution_student_directory_profile.sql",
  );
  assert.match(
    sql,
    /institution_scope_contains\(\s*p_institution_id,\s*lower\(r\.scope_type\),\s*r\.scope_id,/,
  );
});

test("Wave 12 QA includes invitation activation coverage", () => {
  assert.match(
    read("package.json"),
    /scripts\/wave12-user-invitation-activation-qa\.mjs/,
  );
});
