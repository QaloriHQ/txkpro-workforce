# ADMIN-01 — Enterprise Admin and delegated support contract

Owner-approved scope: GitHub issue #319. This is a **staging-only** release. Production is not authorized.

## Core rule
**View as is not account impersonation.** The actual authenticated platform Super Admin remains
the actor on every read and write. The preview presents curated identity, role membership,
scope and expected navigation information without minting tokens, changing cookies,
switching Supabase users, or fetching private data with a target user's authority.

## Actor authorization
- Verified Supabase identity plus active account and active `super_admin` membership with `scope_type=platform`.
- Check at each page and API operation; no client-selected actor or scope may elevate access.
- Admin/support/analyst are not allowed to use this View as surface.
- Limit exposed data to account email, profile names/status and role/scope memberships,
  advertiser role memberships, and pending invitation metadata.
- Privacy exclusion: private messages, screening reports, assessment answers,
  Employer-private notes, payment credentials, authentication secrets, and raw tokens.

## Selected delegated support actions (allowlist)
- **Resend a pending invitation:** canonical `user_invitation_prepare_resend`
  then `deliverUserInvitation`, preserving its built-in rate limit and audit trail.
- **Revoke a pending invitation:** canonical `user_invitation_revoke` with
  `mode=revoked`, preserving its existing audit trail.
- Bind invitation to inspected identity by server-retrieved email/recipient ID.
- No arbitrary user profile mutation, account deletion, membership changes,
  password reset, credential access, publishing, payments or employer hiring decisions.
- These are platform-operator actions *for* the account; they are not actions *as*
  the account owner.

## Session, CSRF, throttling and audit
- POST with same-origin check, no-store, JSON size validation and a bounded support reason.
- All View-as attempts that reach the authorized preview are audited in
  `platform_audit_events` with actor auth ID, target auth ID, reason, result, time.
- Before a delegated mutation, write a **pre-action audit record**; refuse to
  mutate on audit failure. On mutation success/failure, record the outcome too.
  The existing invitation RPC provides the canonical target-change audit.
- Rate-limit sensitive operations via recent audit attempts by actor.
- Do not send audit details, recipient identity, tokens or upstream secrets to
  unauthorized clients. No new SQL or migrations needed in this slice.

## Post-release boundaries
This release adds a **support access preview**, not a live duplicate of Student,
Employer, Institution or Advertiser private workspaces. A true record-level
role-specific preview must be separately scoped to approved curated projections,
audited and reviewed by security. Legacy admin shortcut remediation remains
tracked by #205; this feature cannot claim to close #205.
