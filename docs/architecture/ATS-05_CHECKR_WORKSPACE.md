# ATS-05 / #331 — Checkr sandbox workspace increment

Owner authorized sandbox work and the issue-scoped Project-access exception on 2026-10-19. Continue without Cline per standing owner instruction. PROJECTS_TOKEN is unavailable; task-context/preflight did not pass and no Project status is asserted. Usage start failed (`spawnSync gh ENOENT`); actual model usage/cost is unavailable, not estimated as actual.

## Implemented scope

- Component library and selected Background check inspector expose Enable / manage Checkr. Owner/Admin connects its own account through Checkr-hosted signup or signin. Recruiter/read-only state cannot grant provider access.
- Hosted OAuth uses a random 256-bit state and encrypted HttpOnly, Secure, SameSite=Lax host-only cookie with ten-minute expiry, exact employer/actor binding, callback reauthorization and fixed staging return URL. Legacy state-less exchange endpoint returns 410. Checkr authorization codes are single-use; errors never reflect codes/secrets into the return URL.
- `/employer/checkr` reuses scoped catalog/order/review logic. Credentialing requires the account webhook plus independently checked provider account state; refreshing a catalog cannot manufacture credentialing.
- `/candidate/hiring`, linked from Student Career and Employee workspace, displays the signed-in user's own operational Checkr orders and provider-hosted invitation action. SQL derives identity through `security.pro_actor()`; clients cannot select another subject. No tokens, reports, results, prices or employer notes in candidate projection. An invitation is independently retrieved with the connected employer token, bound to its exact saved candidate/package/invitation, must still be pending, and must use an allowlisted Checkr HTTPS invite host/path.
- Existing Student interview and employment updates are read from their canonical scoped RPCs. They are not fabricated task progress. External applicant accounts and immutable per-node ATS task progress remain ATS-03/#330, a hard dependency for full ATS execution. Published graph nodes do not initiate checks.

## Configuration and boundaries

Vercel metadata confirms CHECKR_SANDBOX_CLIENT_ID, CHECKR_SANDBOX_CLIENT_SECRET and CHECKR_SANDBOX_APP_ORIGIN exist for Preview (also Development/Production); REWARDS_ENCRYPTION_KEY remains staging-scoped. Secret values were not printed. Presence does not prove validity or live provider authentication. All new outbound actions and callbacks are restricted to `https://staging-workforce.txkpro.com`. Production unchanged.

Partner application callback: `https://staging-workforce.txkpro.com/api/checkr/oauth/callback`. Webhook: `https://staging-workforce.txkpro.com/api/checkr/webhook`. Preserve deployment protection; provider-compatible delivery must be verified separately. CHECKR_SANDBOX_ORDERING_ENABLED remains gated until partner validation succeeds. Use synthetic adult mock candidates only; no real-person/minor screening is authorized.

Migration `20261019194612_ats_05_checkr_candidate_access.sql` adds two subject-scoped read functions only; private records retain existing RLS/no direct grants. Public wrapper is SECURITY INVOKER; private definer derives active Auth user. No workflow status/event, report result, raw PII or automatic decision is added.

## Staging release evidence — 2026-10-19

PR #341 merged into staging as `dc86b5392fb4fd9be63f23c27486029ca44f39f3` after full CI run 786 (`39313311986`) passed. Sixteen Checkr tests and eight pipeline regression tests pass locally, plus typecheck, lint (one unchanged baseline warning) and fresh-cache build. Sandbox credentials were confirmed present by Vercel metadata; sensitive values are not returned by the connector and validity is not asserted.

Supabase staging `qwxlgzlkaeaqfzjodtis` applied this migration once, recorded as `20261019194612 / ats_05_checkr_candidate_access`. Source filename was aligned to that server-assigned ledger version without changing the applied SQL. Do not replay either the original development filename (`20261019193600`) or this applied migration. Rollback-only live tests passed own/foreign/anonymous/service/private-table/disconnected-account checks; fixtures were rolled back. Reusable SQL is `supabase/staging/tests/checkr_candidate_workspace.sql`. Post-DDL security advisors show no new security findings and no candidate-function warnings. Existing private deny-all table and unused-index findings remain baseline.

Owner browser/provider UAT remains outstanding, and #331 remains OPEN with no Project status claim. Production is unchanged. Exact deployment state is recorded in the issue/PR release comment.

## Verification and remaining acceptance

Run `npm run checkr:qa`, typecheck, lint, build, ATS regression and required CI. Added executable tests exercise OAuth positive/negative state/session/expiry/revocation cases, candidate own/foreign/anonymous/service denial, private-table denial and disconnected invitation gating.

Owner UAT: connect two synthetic employers from Background check, verify separate accounts, pending/credentialed states and reconnect; test wrong-role denial, back/refresh, mobile/keyboard/focus and both themes. As each synthetic candidate open Career → My hiring progress & Checkr (or Employee workspace), verify only own records and exact own pending invitation. Complete consent with Checkr, then verify status through signed webhook/reconciliation. A provider account connection, candidate invitation email, live Checkr end-to-end test or certification is not established by local tests.

Full ATS-05 remains OPEN: ATS-03 canonical applications/tasks and external candidate access; complete supplied Checkr certification status/Assess/canceled-screening/ETA/report-link mapping and event ordering/replay hardening; approved canonical safe status contract; provider delivery/protection compatibility; complete partner validation workbook; local testing coordination and owner UAT. Do not call this increment a completed/certified Checkr integration or mark #331 Done.

Sources: owner-supplied Partner Validation Plan, Staging Dashboard Setup Instructions, Implementation Kickoff and Certification Requirements; #327/#331; ATS-00/02 contracts; canonical data ownership, role, status and event sources; shared UI standard. Provider OAuth reference: https://docs.checkr.com/partners/ .
