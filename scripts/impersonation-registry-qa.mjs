import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  IMPERSONATION_DATA_PLANE_CERTIFIED,
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  validMembershipKey,
  validUuid,
  registryIsActive,
} from "../lib/impersonation/session-contract.ts";

const text = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const actor = { authUserId: "11111111-1111-4111-8111-111111111111", authSessionId: "22222222-2222-4222-8222-222222222222" };
const active = {
  id: "33333333-3333-4333-8333-333333333333",
  token_hash: "a".repeat(64),
  actor_auth_user_id: actor.authUserId,
  actor_auth_session_id: actor.authSessionId,
  target_auth_user_id: "44444444-4444-4444-8444-444444444444",
  target_membership_key: "workforce:member-1",
  state: "active",
  created_at: new Date(1000).toISOString(),
  expires_at: new Date(1000 + 15 * 60 * 1000).toISOString(),
  revoked_at: null,
};

test("full impersonation is hard-disabled until browser, RLS and audit bridge is certified", () => {
  assert.equal(IMPERSONATION_DATA_PLANE_CERTIFIED, false);
  const c = text("lib/impersonation/session-contract.ts");
  assert.match(c, /IMPERSONATION_DATA_PLANE_CERTIFIED = false/);
  const route = text("app/api/admin/impersonation/session/route.ts");
  for (const method of ["POST", "GET", "DELETE"]) {
    assert.match(route, new RegExp(`export async function ${method}`));
  }
  assert.equal((route.match(/if \(!impersonationEnabled\(\)\)/g) ?? []).length, 3);
});

test("registry token is HttpOnly, Secure, host-only, hashed at rest, max 15 min", () => {
  const lib = text("lib/impersonation/registry.ts");
  const migration = text("supabase/migrations/20261018020000_super_admin_impersonation_sessions.sql");
  assert.ok(IMPERSONATION_COOKIE.startsWith("__Host-"));
  assert.equal(IMPERSONATION_TTL_SECONDS, 900);
  assert.match(lib, /randomBytes\(32\)/);
  assert.match(lib, /createHash\("sha256"\)/);
  assert.match(lib, /httpOnly: true/);
  assert.match(lib, /secure: true/);
  assert.match(lib, /sameSite: "lax"/);
  assert.doesNotMatch(lib, /domain:|magiclink|signInWithPassword|refresh_token|generateLink|access_token/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all.+from public,anon,authenticated/i);
  assert.match(migration, /grant select,insert,update,delete.+to service_role/);
  assert.match(migration, /interval '15 minutes'/);
});

test("registry enforces actor id, original auth session id, expiry and revocation", () => {
  assert.equal(registryIsActive(active, actor, 3000), true);
  assert.equal(registryIsActive(active, { ...actor, authUserId: active.target_auth_user_id }, 3000), false);
  assert.equal(registryIsActive(active, { ...actor, authSessionId: active.id }, 3000), false);
  assert.equal(registryIsActive({ ...active, state: "revoked", revoked_at: new Date(2000).toISOString() }, actor, 3000), false);
  assert.equal(registryIsActive(active, actor, 1000 + 900000), false);
  assert.equal(registryIsActive(active, actor, 500), false);
});

test("target selector requires trusted uuid and exact membership key structure", () => {
  assert.equal(validUuid(actor.authUserId), true);
  assert.equal(validUuid("../../../etc/passwd"), false);
  assert.equal(validMembershipKey("workforce:member-1"), true);
  assert.equal(validMembershipKey("advertiser:aBC_123"), true);
  assert.equal(validMembershipKey("platform:super_admin"), false);
  assert.equal(validMembershipKey("workforce:abc;delete"), false);
});

test("start requires real super admin and native auth claims session id", () => {
  const s = text("lib/impersonation/registry.ts");
  assert.match(s, /requirePlatformSuperAdmin\(\)/);
  assert.match(s, /supabase\.auth\.getClaims\(\)/);
  assert.match(s, /claims\?\.sub !== actor\.authUserId/);
  assert.match(s, /validUuid\(authSessionId\)/);
  assert.match(s, /m\.status\.toLowerCase\(\) === "active"/);
  assert.match(s, /writeSupportAudit/);
  assert.match(s, /await writeSupportAudit\([\s\S]*?const old =/);
});

test("same origin, exit cookie clear and no remote session issuance", () => {
  const api = text("app/api/admin/impersonation/session/route.ts");
  const lib = text("lib/impersonation/registry.ts");
  assert.match(api, /requireSameOrigin\(request\)/);
  assert.match(lib, /jar\.delete\(IMPERSONATION_COOKIE\)/);
  assert.match(lib, /state: "revoked"/);
  assert.doesNotMatch(lib, /generateLink|verifyOtp|signInWith|setSession|serviceRoleJwt/);
});

test("contract documents high risk inclusion, actor attribution and locked data plane", () => {
  const c = text("docs/governance/SEC_IMP_FULL_SESSION_CONTRACT.md");
  assert.match(c, /high-risk/);
  assert.match(c, /actor/);
  assert.match(c, /Supabase/);
  assert.match(c, /not.*full impersonation/i);
});

test("full-session banner is global, non-dismissible, and Exit revokes the registry", () => {
  const root = text("app/layout.tsx");
  const banner = text("components/admin/impersonation-banner.tsx");
  const styles = text("app/impersonation-banner.css");
  assert.match(root, /impersonationEnabled\\(\\)/);
  assert.match(root, /<body>\\{impersonationBanner\\}\\{children\\}<\\/body>/);
  assert.match(banner, /Viewing as \\{targetName\\}/);
  assert.match(banner, /Exit View as/);
  assert.match(banner, /method: "DELETE"/);
  assert.match(banner, /window.location.assign\\("\\/admin"\\)/);
  assert.doesNotMatch(banner, /onClose|dismiss|isOpen/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /z-index: 9999/);
  assert.match(styles, /safe-area-inset/);
});
