import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003161731_workforce_wave12_canonical_user_invitations.sql";

test("W12-05A creates canonical invitation lifecycle schema", () => {
  const sql = read(migration);
  assert.match(sql, /create table if not exists public\.user_invitations/);
  assert.match(sql, /status text not null default 'pending'/);
  assert.match(sql, /check \(status in \('pending','accepted','expired','revoked','cancelled'\)\)/);
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /expires_at timestamptz not null/);
  assert.match(sql, /user_invitations_pending_semantic_key/);
  assert.doesNotMatch(sql, /raw_user_meta_data|user_metadata|requested_role/);
});

test("W12-05A enforces server-side role and scope authorization", () => {
  const sql = read(migration);
  for (const expected of [
    "canonical_invitation_role",
    "invitation_role_group",
    "invitation_scope_valid",
    "can_invite_user",
    "can_invite_institution_member",
    "institution_scope_contains",
    "has_employer_role",
    "security.is_admin()",
  ]) {
    assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sql, /when security\.canonical_invitation_role\(p_role\)='employer_owner'\s+then security\.is_admin\(\)/);
});

test("W12-05A exposes create bulk list resend revoke and accept RPCs safely", () => {
  const sql = read(migration);
  for (const fn of [
    "invitation_create",
    "invitation_bulk_create",
    "invitation_list",
    "invitation_resend",
    "invitation_revoke",
    "invitation_accept",
  ]) {
    assert.match(sql, new RegExp(`public\\.${fn}`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(sql, /digest\(v_token,'sha256'\)/);
  assert.match(sql, /Invitation email does not match the signed-in account/);
});

test("W12-05A activation links memberships to canonical identities idempotently", () => {
  const sql = read(migration);
  assert.match(sql, /ensure_invitation_user/);
  assert.match(sql, /ensure_invitation_membership/);
  assert.match(sql, /ensure_invitation_wf_membership/);
  assert.match(sql, /ensure_invited_student_profile/);
  assert.match(sql, /alreadyMember/);
  assert.match(sql, /status='accepted'/);
  assert.match(sql, /wf_onboarding_accounts/);
});

test("W12-05A audits trust-critical invitation transitions", () => {
  const sql = read(migration);
  for (const event of [
    "USER_INVITATION_CREATED",
    "USER_INVITATION_RESENT",
    "USER_INVITATION_REVOKED",
    "USER_INVITATION_ACCEPTED",
  ]) {
    assert.match(sql, new RegExp(event));
  }
  assert.match(sql, /security\.emit_workforce_event/);
});

test("W12-05A repository and APIs use canonical invitation RPCs", () => {
  const repo = read("lib/invitations/repository.ts");
  const api = [
    "app/api/invitations/route.ts",
    "app/api/invitations/[invitationId]/resend/route.ts",
    "app/api/invitations/[invitationId]/revoke/route.ts",
    "app/api/invitations/accept/route.ts",
  ].map(read).join("\n");
  for (const expected of [
    "invitation_create",
    "invitation_bulk_create",
    "invitation_list",
    "invitation_resend",
    "invitation_revoke",
    "invitation_accept",
  ]) {
    assert.match(repo, new RegExp(expected));
  }
  assert.match(api, /createBulkInvitations/);
  assert.match(api, /acceptInvitation/);
});

test("W12-05A UI exposes activation and scoped team invitation surfaces", () => {
  const activation = read("app/activate/[token]/page.tsx");
  const manager = read("components/invitations/invitation-manager.tsx");
  const institution = read("app/institution/team/page.tsx");
  const employer = read("app/employer/team/page.tsx");
  const signup = read("app/signup/page.tsx");
  const login = read("app/login/page.tsx");
  for (const expected of [
    "Activate your TXKPRO invitation",
    "Sign in to activate",
    "Create account",
  ]) {
    assert.match(activation, new RegExp(expected.replaceAll(" ", "\\s+")));
  }
  assert.match(manager, /Resend/);
  assert.match(manager, /Revoke/);
  assert.match(institution, /Team & Student invitations/);
  assert.match(employer, /team invitations/);
  assert.match(signup, /inviteToken/);
  assert.match(login, /next/);
});

test("W12 QA includes canonical invitation regression coverage", () => {
  assert.match(read("package.json"), /scripts\/wave12-canonical-user-invitations-qa\.mjs/);
});
