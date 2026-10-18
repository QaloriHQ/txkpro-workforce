import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const layout = read("app/admin/layout.tsx");
const shell = read("components/admin/admin-workspace-shell.tsx");
const css = read("app/admin/admin-workspace.css");
const home = read("app/admin/page.tsx");
const directory = read("app/admin/users/page.tsx");
const detail = read("app/admin/users/[userId]/page.tsx");
const accounts = read("lib/admin/platform-users.ts");
const auth = read("lib/admin/platform-support.ts");
const preview = read("app/api/admin/users/[userId]/preview/route.ts");
const action = read("app/api/admin/users/[userId]/support/route.ts");
const client = read("components/admin/platform-user-support.tsx");
const contract = read("docs/governance/ADMIN_01_SUPPORT_PREVIEW_CONTRACT.md");

test("Admin shell replaces button nav with responsive collapsible sidebar", () => {
  assert.match(layout, /requireRole\(\["admin"\]\)/);
  assert.match(layout, /AdminWorkspaceShell/);
  assert.match(shell, /usePathname/);
  assert.match(shell, /aria-current=\{active \? "page"/);
  assert.match(shell, /aria-label="Open administration menu"/);
  assert.match(shell, /aria-expanded=\{drawerOpen\}/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /isSuperAdmin/);
  assert.match(shell, /stagingMgid/);
  assert.match(css, /\.txk-admin-backdrop/);
  assert.match(css, /background: rgba\(8,15,27,\.64\)/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(home, /<Link className="button button-ghost"/);
  assert.match(home, /txk-admin-grid/);
});

test("All Users covers authenticated Workforce and advertiser-only identities with bounded paging", () => {
  assert.match(directory, /isPlatformSuperAdmin\(actor\)/);
  assert.match(detail, /isPlatformSuperAdmin\(actor\)/);
  assert.match(accounts, /auth\.admin\.listUsers\(\{ page, perPage \}\)/);
  assert.match(accounts, /perPage = 40/);
  assert.match(accounts, /getUserById\(authUserId\)/);
  assert.match(accounts, /"app_role_memberships"/);
  assert.match(accounts, /"wf_advertiser_memberships"/);
  assert.match(accounts, /"auth_user_id"/);
  assert.match(accounts, /"pending"/);
  assert.match(accounts, /target_auth_user_id/);
});

test("Only active platform Super Admin passes support operations", () => {
  assert.match(auth, /getAccountContext\(\)/);
  assert.match(auth, /isPlatformSuperAdmin\(actor\)/);
  assert.match(auth, /status: 403/);
  assert.match(preview, /requirePlatformSuperAdmin\(\)/);
  assert.match(action, /requirePlatformSuperAdmin\(\)/);
  assert.match(preview, /isUuid\(userId\)/);
  assert.match(action, /isUuid\(userId\)/);
});

test("View as is one-click and preserves platform authorization without impersonation", () => {
  assert.match(preview, /requirePlatformSuperAdmin\(\)/);
  assert.match(preview, /m\.status\.toLowerCase\(\) === "active"/);
  assert.match(preview, /writeSupportAudit/);
  assert.match(preview, /reason: ""/);
  assert.match(preview, /request\.headers\.get\("origin"\)/);
  assert.match(preview, /supportPreviewSections/);
  assert.match(preview, /read-only preview audit unavailable/);
  assert.doesNotMatch(preview, /requireSupportRequest|enforceSupportRateLimit|signInWith|setSession|exchangeCodeForSession/);
  assert.match(client, /Support preview — not impersonation/);
  assert.match(client, /onClick=\{\(\) => void openPreview\(\)\}/);
  const viewMarkup = client.slice(client.indexOf("<h2>View as"), client.indexOf("<h3>Delegated invitation support"));
  assert.doesNotMatch(viewMarkup, /required support reason|textarea|reason\.trim\(\)\.length/i);
  assert.match(contract, /never.*Supabase Auth session/i);
});

test("Delegated actions only resend/revoke pending invitation through canonical service", () => {
  assert.match(action, /action !== "resend_pending_invitation" && action !== "revoke_pending_invitation"/);
  assert.match(action, /getPendingTargetInvitation\(target, invitationId\)/);
  assert.match(action, /prepareUserInvitationResend\(invitationId\)/);
  assert.match(action, /deliverUserInvitation\(invitationId/);
  assert.match(action, /revokeUserInvitation\(invitationId, "revoked"\)/);
  assert.match(accounts, /i\.email\.toLowerCase\(\) === email/);
  assert.match(accounts, /i\.target_auth_user_id === account\.authUserId/);
  assert.match(action, /platform_support_action_requested/);
  assert.match(action, /platform_support_action_completed/);
  assert.match(contract, /No arbitrary user profile mutation/);
});

test("Delegated mutations still require reason, origin, and fail-closed audit", () => {
  assert.match(auth, /request\.headers\.get\("origin"\)/);
  assert.match(auth, /reason\.length < 12 \|\| reason\.length > 240/);
  assert.match(auth, /"platform_audit_events"/);
  assert.match(auth, /actor_auth_user_id: input\.actor\.authUserId/);
  assert.match(auth, /"Cache-Control": "private, no-store"/);
  assert.match(action, /requireSupportRequest\(request, body\)/);
  assert.match(action, /await writeSupportAudit\([\s\S]*?await prepareUserInvitationResend/);
  assert.match(action, /enforceSupportRateLimit/);
  assert.doesNotMatch(action, /auth\.admin\.updateUserById/);
});

test("No production changes or unapproved privileged actions", () => {
  assert.match(contract, /Staging-only|staging-only/i);
  assert.doesNotMatch(action, /auth\.admin\.deleteUser|updateUserById|service_role.*cookie/);
  assert.doesNotMatch(preview, /auth\.admin\.generateLink|signInWithPassword/);
});

test("View as performs no target consent or notification calls", () => {
  assert.match(preview, /requirePlatformSuperAdmin\(\)/);
  assert.doesNotMatch(preview, /requireSupportRequest|notifyUser|deliverUserInvitation|signInAs|setSession/);
  assert.match(client, /No request or notification was sent to this user/);
  assert.match(contract, /No user consent, support reason, or user notification is required/);
});
