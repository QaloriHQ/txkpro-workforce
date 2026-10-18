import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyImpersonationRequest, ordinaryImpersonationActionAllowed,
} from "../lib/impersonation/action-policy.ts";

const candidate = (verb, pathname) => classifyImpersonationRequest(verb, pathname);
test("read-only ordinary pages remain possible", () => {
  assert.equal(candidate("GET", "/student"), "ordinary_read");
  assert.equal(candidate("GET", "/api/community/posts"), "ordinary_read");
});
test("ordinary writing is explicitly listed and unknown mutation fails closed", () => {
  for (const path of [
    "/api/community/posts",
    "/api/community/conversations/abc/messages",
    "/api/student/portfolio",
    "/api/professional/profile",
    "/api/skills/self-attest",
    "/api/employer/talent/123/notes",
    "/api/classes/join",
    "/api/student/employer-training/assignments/123/lessons/abc/complete",
  ]) {
    assert.equal(candidate("POST", path), "ordinary_write", path);
  }
  assert.equal(candidate("POST", "/api/unreviewed/action"), "deny_unreviewed");
  assert.equal(candidate("DELETE", "/api/community/posts/1"), "deny_unreviewed");
});
test("finance, identity, access control and irreversible operations are denied", () => {
  for (const path of [
    "/api/rewards/funding",
    "/api/rewards/funding/webhook",
    "/api/advertiser",
    "/api/ads/analytics",
    "/api/auth/session-login",
    "/api/authcard",
    "/api/checkr",
    "/api/screening",
    "/api/admin/users/123/support",
    "/api/invitations/123/revoke",
    "/api/placements/123",
    "/api/community/groups/123/invites",
    "/api/community/groups/123/members/456",
    "/api/community/groups/123/posts/456/moderate",
    "/api/community/moderation/blocks/123",
    "/api/employer/learning/certifications/awards/123/revoke",
    "/api/employer/referrals/123/close",
    "/api/organization/public-profile",
    "/api/account/delete",
    "/api/settings/security",
    "/api/stripe/checkout",
    "/api/onboarding",
  ]) {
    assert.equal(candidate("POST", path), "deny_high_risk", path);
  }
});
test("encoded paths and unreviewed verbs must not bypass exclusions", () => {
  assert.equal(candidate("POST", "/api/%61dmin/users"), "deny_high_risk");
  assert.equal(candidate("POST", "/api/community/posts/%2e%2e/%2e%2e/admin"), "deny_unreviewed");
  assert.equal(candidate("TRACE", "/api/community/posts"), "deny_unreviewed");
  assert.equal(candidate("POST", "/api/community/posts/revoke"), "deny_high_risk");
});
test("policy cannot itself authorize direct Supabase RPC or browser access", () => {
  const text = readFileSync(new URL("../docs/governance/SEC_IMP_FULL_SESSION_CONTRACT.md", import.meta.url), "utf8");
  assert.match(text, /browser Supabase.*RLS.*RPC/s);
  assert.equal(ordinaryImpersonationActionAllowed("ordinary_write"), true);
  assert.equal(ordinaryImpersonationActionAllowed("deny_high_risk"), false);
  assert.equal(ordinaryImpersonationActionAllowed("deny_unreviewed"), false);
});
