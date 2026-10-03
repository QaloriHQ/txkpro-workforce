import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration =
  "supabase/staging/migrations/20261003170000_workforce_wave12_invitation_convergence_hardening.sql";

test("W12-05A hardening stores canonical tenant context without guessing ambiguous scopes", () => {
  const sql = read(migration);
  assert.match(sql, /add column if not exists institution_id/);
  assert.match(sql, /add column if not exists employer_id/);
  assert.match(sql, /invitation_scope_institution_id/);
  assert.match(sql, /if v_count=1 then return v_id/);
  assert.match(sql, /Invitation Institution scope is ambiguous or invalid/);
  assert.match(sql, /trg_user_invitations_stamp_tenant/);
});

test("W12-05A platform provisioning blocks Admin to Super Admin escalation", () => {
  const sql = read(migration);
  assert.match(sql, /create or replace function security\.is_super_admin/);
  assert.match(sql, /'super_admin','admin','support','read_only_analyst'/);
  assert.match(
    sql,
    /if v_role='super_admin' then return security\.is_super_admin\(\)/,
  );
  assert.match(sql, /when 'platform_admin' then 'admin'/);
});

test("W12-05A acceptance proves email before idempotent accepted response", () => {
  const sql = read(migration);
  const accept = sql.slice(sql.indexOf("create or replace function public.invitation_accept"));
  const emailCheck = accept.indexOf("Invitation email does not match the signed-in account");
  const idempotent = accept.indexOf("if v_invitation.status='accepted'");
  assert.ok(emailCheck >= 0);
  assert.ok(idempotent > emailCheck);
  assert.match(accept, /Invitation already accepted by another identity/);
  assert.match(accept, /Invitation identity conflicts with an existing account/);
});

test("W12-05A records expiration and delivery transitions", () => {
  const sql = read(migration);
  assert.match(sql, /USER_INVITATION_EXPIRED/);
  assert.match(sql, /trg_user_invitation_expiration_audit/);
  assert.match(sql, /public\.invitation_mark_delivery/);
  assert.match(sql, /USER_INVITATION_DELIVERY_FAILED/);
  assert.match(sql, /grant execute on function public\.invitation_mark_delivery\(text,text,text\)\s+to service_role/);
  assert.match(sql, /from public,anon,authenticated/);
});

test("W12-05A quarantines the empty live-only invitation API", () => {
  const sql = read(migration);
  assert.match(sql, /p\.proname like 'workforce_invitation%'/);
  assert.match(sql, /revoke execute on function %I\.%I\(%s\) from authenticated/);
  assert.match(sql, /revoke all on table public\.wf_user_invitations/);
  assert.match(sql, /DEPRECATED W12-05A staging-only prototype table/);
});

test("W12-05A sends new-account invites and existing-account no-create links", () => {
  const delivery = read("lib/invitations/delivery.ts");
  assert.match(delivery, /inviteUserByEmail/);
  assert.match(delivery, /signInWithOtp/);
  assert.match(delivery, /shouldCreateUser:\s*false/);
  assert.match(delivery, /getAuthCallbackUrl\(result\.activationPath\)/);
  assert.match(delivery, /invitation_mark_delivery/);
  assert.match(delivery, /deliveryStatus:\s*"failed"/);
});

test("W12-05A repository delivers create bulk and resend through one service", () => {
  const repository = read("lib/invitations/repository.ts");
  assert.match(repository, /deliverInvitation\(withActivationUrl\(result\)\)/);
  assert.match(repository, /for \(const item of result\.results\)/);
  assert.match(repository, /deliverInvitation\(withActivationUrl\(item\)\)/);
});

test("W12-05A bounds bulk invites and surfaces delivery outcomes", () => {
  const api = read("app/api/invitations/route.ts");
  const manager = read("components/invitations/invitation-manager.tsx");
  assert.match(api, /MAX_BULK_INVITATIONS = 100/);
  assert.match(api, /At least one invitation is required/);
  assert.match(manager, /Invitation sent/);
  assert.match(manager, /email delivery failed/);
  assert.match(manager, /roleSet/);
  assert.match(manager, /scopeSet/);
});

test("Wave 12 QA includes invitation convergence regression coverage", () => {
  assert.match(read("package.json"), /scripts\/wave12-invitation-convergence-qa\.mjs/);
});
