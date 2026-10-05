import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const file = readdirSync(new URL("../supabase/staging/migrations/", import.meta.url)).find(x => x.endsWith("_invitation_consolidation.sql"));
const sql = read(`supabase/staging/migrations/${file}`);
test("one canonical authority; unapplied competing table migration is retired", () => {
  assert.match(sql, /alter table public\.wf_user_invitations/);
  assert.doesNotMatch(sql, /create table.*public\.user_invitations/);
  assert.equal(existsSync(new URL("../supabase/staging/migrations/20261003161731_workforce_wave12_canonical_user_invitations.sql", import.meta.url)), false);
  assert.match(sql, /revoke all on function %s from public,anon,authenticated,service_role/);
});
test("recipient verification precedes lifecycle disclosure and acceptance", () => {
  const accept = sql.slice(sql.indexOf("function security.user_invitation_accept("), sql.indexOf("function security.user_invitation_claim_delivery("));
  assert.ok(accept.indexOf("Invitation recipient mismatch") < accept.indexOf("if v_inv.status='accepted'"));
  assert.match(sql, /email_confirmed_at is not null/);
  assert.doesNotMatch(sql, /raw_user_meta_data|auth\.jwt\(\)/);
  assert.match(accept, /institution_scope_matches/);
});
test("exposed RPCs are invokers; delivery is service-only; duplicate creation serializes", () => {
  for (const fn of sql.split(/create or replace function /).filter(x => x.startsWith("public."))) assert.doesNotMatch(fn.split(/end;\n\$\$;|\$wrapper\$;/)[0], /security definer/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Idempotency key conflicts/);
  assert.match(sql, /grant execute on function public\.user_invitation_claim_delivery\(text,text\) to service_role/);
});
test("delegated invitation acceptance remains subject to D-01 approval", () => {
  assert.match(sql, /when v_inv.activation_policy='approval_required' then 'pending'/);
  assert.match(sql, /Recipient acceptance required before approval/);
  assert.match(sql, /can_approve_institution_member/);
  assert.match(read("lib/admin/educator-approvals.ts"), /user_invitation_decide_approval/);
});
test("active Student onboarding binds accepted scope and emits canonical cohort event", () => {
  assert.match(sql, /security\.complete_student_onboarding_before_invitations\(v_profile\)/);
  assert.match(sql, /accepted_by_auth_user_id=\(select auth.uid\(\)\)/);
  assert.match(sql, /STUDENT_LINKED_TO_COHORT/);
  assert.match(sql, /school_id=v_inv.institution_id/);
});
test("Auth delivery is real, deduplicated, and compatible with default and custom links", () => {
  const service = read("lib/invitations/service.ts");
  assert.match(service, /user_invitation_claim_delivery/);
  assert.match(service, /inviteUserByEmail/);
  assert.match(service, /shouldCreateUser: false/);
  assert.doesNotMatch(service, /\.ilike\(/);
  const loader = read("components/invitations/activation-loader.tsx");
  assert.match(loader, /auth.setSession/);
  assert.match(loader, /auth.verifyOtp/);
  assert.match(loader, /history.replaceState/);
  assert.match(read("supabase/templates/invite.html"), /\.ConfirmationURL/);
});
test("all invitation surfaces use the canonical service and accessible feedback", () => {
  for (const page of ["app/institution/team/page.tsx", "app/employer/directory/page.tsx", "app/admin/invitations/page.tsx"]) assert.match(read(page), /listUserInvitations/);
  assert.match(read("app/employer/team/page.tsx"), /redirect\("\/employer\/directory"\)/);
  assert.match(read("app/api/invitations/route.ts"), /MAX_BULK_INVITATIONS = 100/);
  assert.match(read("components/invitations/invitation-manager.tsx"), /aria-live="polite"/);
  assert.match(read("app/api/invitations/[id]/accept/route.ts"), /getRecipientInvitation/);
});
