import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003165000_workforce_wave12_canonical_user_invitations.sql";

test("W12-05A creates one canonical invitation lifecycle", () => {
  const sql = read(migration);
  assert.match(sql, /create table if not exists public\.wf_user_invitations/);
  for (const status of ["pending", "accepted", "expired", "revoked", "cancelled"]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /activation_policy/);
  assert.match(sql, /auto_activate/);
  assert.match(sql, /approval_required/);
  assert.match(sql, /wf_user_invitations_open_semantic_key/);
  assert.match(sql, /wf_user_invitations_idempotency_key/);
});

test("W12-05A validates target role families and tenant scope server-side", () => {
  const sql = read(migration);
  assert.match(sql, /user_invitation_actor_can_manage/);
  assert.match(sql, /canonical_institution_role/);
  assert.match(sql, /institution_scope_contains/);
  assert.match(sql, /can_invite_institution_member/);
  assert.match(sql, /has_employer_role/);
  assert.match(sql, /employer_owner','employer_admin/);
  assert.match(sql, /security\.is_super_admin/);
  assert.match(sql, /Invitation role or scope denied/);
});

test("W12-05A acceptance never takes role or scope from the client", () => {
  const sql = read(migration);
  assert.match(sql, /user_invitation_accept\(\s*p_invitation_id text/);
  assert.doesNotMatch(
    sql,
    /user_invitation_accept\([\s\S]*p_role text[\s\S]*\)\s*returns jsonb/,
  );
  assert.match(sql, /Invitation recipient mismatch/);
  assert.match(sql, /email_normalized/);
  assert.match(sql, /status=v_membership_status/);
  assert.match(sql, /canonical_invitation:/);
});

test("W12-05A preserves Institution invitation versus approval authority", () => {
  const sql = read(migration);
  assert.match(sql, /can_approve_institution_member/);
  assert.match(sql, /v_activation_policy:='approval_required'/);
  assert.match(sql, /v_membership_status:=case/);
  assert.match(sql, /pending_review/);
});

test("W12-05A lifecycle actions are audited and delivery failures remain visible", () => {
  const sql = read(migration);
  for (const action of [
    "USER_INVITATION_CREATED",
    "USER_INVITATION_SENT",
    "USER_INVITATION_DELIVERY_FAILED",
    "USER_INVITATION_RESEND_REQUESTED",
    "USER_INVITATION_ACCEPTED",
    "USER_INVITATION_EXPIRED",
    "USER_INVITATION_REVOKED",
    "ROLE_MEMBERSHIP_LINKED",
    "USER_ONBOARDING_HANDOFF",
  ]) {
    assert.match(sql, new RegExp(action));
  }
  assert.match(sql, /delivery_status/);
  assert.match(sql, /delivery_error_code/);
});

test("W12-05A APIs reuse one service for individual and bulk invitations", () => {
  const route = read("app/api/invitations/route.ts");
  const service = read("lib/invitations/service.ts");
  assert.match(route, /createAndDeliverUserInvitation/);
  assert.match(route, /MAX_BULK_INVITATIONS/);
  assert.match(service, /user_invitation_create/);
  assert.match(service, /inviteUserByEmail/);
  assert.match(service, /signInWithOtp/);
  assert.match(service, /shouldCreateUser:\s*false/);
  assert.match(service, /user_invitation_record_delivery/);
});

test("W12-05A activation uses server callback templates and recipient-only acceptance", () => {
  const invite = read("supabase/templates/invite.html");
  const magic = read("supabase/templates/magic-link.html");
  const page = read("app/invitations/activate/page.tsx");
  const accept = read("app/api/invitations/[id]/accept/route.ts");
  assert.match(invite, /\.RedirectTo/);
  assert.match(invite, /\.TokenHash/);
  assert.match(invite, /type=invite/);
  assert.match(magic, /type=email/);
  assert.match(page, /getRecipientInvitation/);
  assert.match(accept, /acceptUserInvitation/);
  assert.match(accept, /updateUser\(\{ password \}\)/);
});

test("W12-05A Student onboarding consumes accepted invitation scope", () => {
  const onboarding = read("app/api/onboarding/route.ts");
  assert.match(onboarding, /wf_user_invitations/);
  assert.match(onboarding, /accepted_by_user_id/);
  assert.match(onboarding, /invitedInstitutionId/);
  assert.match(onboarding, /invitedCohortId/);
  assert.match(onboarding, /STUDENT_LINKED_TO_COHORT/);
  assert.match(onboarding, /canonical_invitation_activation/);
});

test("W12-05A Institution Student directory exposes create resend and revoke controls", () => {
  const directory = read("app/institution/students/page.tsx");
  const form = read("components/institution/student-invitation-form.tsx");
  const actions = read("components/institution/pending-invitation-actions.tsx");
  assert.match(directory, /StudentInvitationForm/);
  assert.match(directory, /PendingInvitationActions/);
  assert.match(form, /role:\s*"student"/);
  assert.match(read("lib/invitations/service.ts"), /idempotencyKey/);
  assert.match(actions, /resend/);
  assert.match(actions, /revoke/);
});

test("W12 QA includes canonical invitation regression coverage", () => {
  assert.match(read("package.json"), /scripts\/wave12-user-invitation-qa\.mjs/);
});
