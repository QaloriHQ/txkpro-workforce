# D-01 — Educator approval authority

Decision: **TXKPRO Admin and scoped Institution Admin/Super Admin can approve educator access.**

Implementation guardrails:

- Approval is a server-side authorization decision, not a client-only UI permission.
- TXKPRO platform admins may approve educator access across institutions.
- Institution Super Admin and Institution Admin may approve educator access only inside their active institution scope.
- The approval activates canonical `app_role_memberships` and keeps the legacy `wf_role_memberships` bridge aligned.
- Every approval or rejection writes a `platform_audit_events` record with actor, institution, target membership, decision, and authority provenance.
- Educator onboarding remains `pending_review` until approval; rejected requests become blocked and do not grant access.

This resolves the PRD §18 open question: “Who approves educators: institution admin, TXKPRO admin, or either?”
