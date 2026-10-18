# SEC-IMP — Full Super Admin impersonation (owner approval 2026-10-18)

## Approved product behavior

A platform-scoped, active Super Admin may select an existing user in All Users and
enter that user's **fully functional** account experience, without target consent,
manually entered reason, or notifications. Every ordinary user route, view and permitted non-high-risk mutation must behave according to the selected user's currently active role and organization scope. All high-risk actions must be blocked. A non-dismissible banner must identify the target and
show **Exit**; Exit immediately restores the authenticated Super Admin workspace.

**Owner amendment — 2026-10-18: high-risk actions are EXCLUDED.** During impersonation, deny payments, refunds, funding, payouts, account deletion/suspension, credential/security changes, MFA, role/permission grants, invitation approvals or revocations, verification, and irreversible operations. Ordinary profile editing, posts and messaging may remain available only with the target's own verified permissions. User consent, reason input and user notification are not required.

## Mandatory security invariants

1. The real actor is an authenticated active **platform super_admin** with
   a verified Supabase Auth **session_id** on every request, not just at entry.
2. The effective target is the selected, active user with an active membership.
   Supabase Auth subject, RLS, API routes and browser RPCs must agree on the target
   context. The original Super Admin's broad access must not leak into the
   impersonated workspace.
3. Every permitted ordinary action must carry both real
   actor and target identity, role/scope, impersonation registry id and correlation id
   to canonical auditable events and relevant external callbacks. High-risk operations are always DENIED at browser Supabase, Next.js API, database RLS and RPC boundaries. Ordinary-write attribution must fail closed if it cannot be durably committed.
4. No raw target-user access/refresh tokens, magic links, reusable sessions or
   passwords can be given to the browser in a way that grants unbound target
   credentials outside the actor-verified impersonation scope.
5. Support registry uses an unguessable 256-bit random opaque cookie whose SHA-256
   digest alone is stored in an RLS-closed database table. Bound to the verified
   actor auth session_id and 15-minute max TTL. Start and exit are same-origin.
6. The selected user is not notified, no user approval and no reason required;
   invisible automatic internal audit is still mandatory.
7. Session termination/revocation must immediately revoke all effective target
   access, including already-open tabs and API/Supabase browser access.
8. No production deployment or production DB migration without approval.

## Current architecture blocker

`lib/supabase/server.ts` uses @supabase/ssr bound to the real user's Auth cookie;
`lib/supabase/client.ts` sends direct browser Supabase requests; `lib/auth.ts`
authenticates using Supabase JWT claims and `auth.uid()` ties access to RLS.
There are at least 169 Next.js API routes. An independent impersonation cookie
does **not** change auth.uid(), target JWT, existing role checks, or external API
identity. Therefore a feature that only registers an impersonation token or renders
a banner is NOT full impersonation.

Native Supabase Auth generateLink is not sufficient: the resulting target session
is indistinguishable from a regular target login, and its refresh token could be
reused outside the actor-bound context. For the final production-grade bridge,
implement a verified issuer/auth-hook or locked-down server proxy with actor+target
claims across browser and server, RLS and RPC checks, session revocation, and
blocking financial and security operations in the data plane. Decide bridge mechanics with
tests; do not invent a JWT signing key or forward service role to browsers.

## Current gated deliverable: SEC-IMP-01

- Database migration creates an RLS-closed actor-session registry.
- Node-only registry functions can issue/revoke session capabilities and write
  platform audit events; there is no target-session credential in these records.
- Endpoints are **hard-disabled by a compile-time constant** until the native
  browser+server+database bridge and all high-risk deny controls have passed.
- The existing `View as` read-only preview is unchanged in this wave.
- No new credentials, no notification, no unauthorized user access.

## Certification evidence required before unlocking

- Direct browser Supabase table select/update and RPC with the selected target
  context, no bypass via ordinary actor client or stolen capability token;
- SSR, Server Actions, 169 API routes, authentication refresh and logout;
- Multi-tab, expiry, revocation, concurrent sessions, account removal, actor
  revocation, target membership/scope revocation; real user unaffected;
- Negative tests proving high-risk actions are rejected by API, browser/RLS/RPC and external-provider integrations, plus actor and target provenance for permitted ordinary writes;
- Test error behavior if audit, DB, issuer or proxy is unavailable;
- Manual signed-in staging UAT for Student, Institution, Employer, Advertiser
  and every other applicable role, mobile and desktop banner;
- Security review of #205 (legacy admin shortcut issue), #144 (audit coverage).

## Automated SEC-IMP-02 route coverage gate

`node --experimental-strip-types --test scripts/impersonation-coverage-gate.mjs`
reports dynamic counts of API routes, mutating handlers, high-risk candidates, and
browser Supabase entry points. It reads an explicit deny-by-default review ledger
(`SEC_IMP_02_ROUTE_REVIEW.json`). While certification is false, CI verifies the
gate itself and reports missing coverage. If a future commit changes the
compile-time certification flag, CI requires nonempty traceable evidence for each
mutating route and browser entry point plus verified issuer, RLS/RPC and high-risk
provider high-risk DENY enforcement. Adding a boolean alone is NOT authorization evidence.

## Ordinary-action policy contract

`lib/impersonation/action-policy.ts` classifies selected web API methods/paths into ordinary reads, explicitly reviewed ordinary writes, excluded high-risk operations and unreviewed mutations (deny). The classifier and its CI tests are not an enforcement boundary. Browser Supabase requests and RLS/RPCs must independently enforce identical actor+target scope and high-risk exclusions before the certification gate can be enabled.
