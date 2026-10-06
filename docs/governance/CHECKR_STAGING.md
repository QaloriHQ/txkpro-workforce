# Checkr staging integration — #244

## Scope and confirmations

User authorized Checkr implementation, staging only. Branch `feat/checkr-sandbox` targets `staging`; Supabase `qwxlgzlkaeaqfzjodtis`; Vercel TXKPRO Workforce staging alias. Production remains untouched. Project context/preflight scripts could not run because PROJECTS_TOKEN is unavailable in this execution environment. Continue the existing approved Project-access exception; do not claim an automated Ready pass, change Project status, or declare Done. Other verification gates remain. Agent usage telemetry start failed because `gh` is unavailable; usage was not fabricated.

Affected roles: active approved employer owner/admin manages connection and screening permissions. Ordering and independent review require explicit existing screening permission records and active operational membership; ordinary employees inherit no screening authority. Applicant scope follows canonical referral, current sharing consent, and assigned hiring manager scope. Employee subjects require active membership in the same employer. Inactive/foreign subjects and cross-employer orders are denied.

Canonical ownership: contractors and role memberships own employer identity; users own recipient identity; referral/student/hiring-need records own applicant scope. Existing wf_screening_orders and wf_screening_permissions own orders and spending policies. New private security-schema tables hold encrypted employer tokens, server-issued quotes, dispatch leases, and webhook IDs. Session actors come from security.pro_actor; service RPC is server-only. Existing recipient DOB/country eligibility is reused only to enforce adult US availability, never as screening consent.

IA/design: docs/ui/TXKPRO_WORKFORCE_UI_DESIGN_STANDARD.md and shared ActionModal, cards, buttons, contrast tokens. Gallery/order review and document summaries are opened by buttons. Checkr JavaScript embedded signup runs within the workspace; Checkr obtains candidate disclosures/consent in its hosted candidate flow. A fully custom candidate flow requires provider approval and is not claimed here.

## Implemented behavior

- Embedded employer signup/OAuth code exchange. Each employer has its own account-bound encrypted token; browser receives only public partner ID.
- Gallery of account-authorized packages and base prices, filtered by Checkr division/node; US work location captured. No hardcoded public retail prices. Arbitrary component carts are not supported by this release: combinations must first exist as Checkr packages.
- Ten-minute server quotes, same-quote/same-order reservation, existing monthly base-price limits and per-order independent approval. Reviewer permission is checked again before dispatch.
- Stable provider idempotency keys, database lease, canonical subject/account/package revalidation before submission. After 23 hours an uncertain submission stops for reconciliation instead of risking replay beyond Checkr’s 24-hour idempotency window.
- Signed webhooks and authorized manual refresh reconcile only invitation and operational report status. Report clear/consider are both mapped to complete. Reports, findings, SSNs, consent documents and raw provider payloads are never persisted or exposed in TXKPRO. No automated employment decision.
- Unsubmitted orders can be cancelled. Expired/cancelled provider invitations retain reservations until billing/refund reconciliation is verified; automatic release would incorrectly imply a refund.
- Printable order summaries are explicitly not invoices/receipts. This sandbox release does not collect a screening payment. Provider invoices, TXKPRO screening fees/resale and pass-through reconciliation require a confirmed billing contract. Reward-funding fees do not automatically apply to screening. Spending controls currently bound package base cost, not unknown provider access fees.

## Activation configuration

Add server-only Checkr partner sandbox credentials to the Vercel **staging branch** environment, never paste secrets into chat:

- CHECKR_SANDBOX_CLIENT_ID
- CHECKR_SANDBOX_CLIENT_SECRET
- CHECKR_SANDBOX_APP_ORIGIN=https://staging-workforce.txkpro.com
- Existing REWARDS_ENCRYPTION_KEY (32-byte base64 key) protects account tokens; preserve it.

Leave CHECKR_SANDBOX_ORDERING_ENABLED unset/false until Checkr partner setup, account/package configuration and sandbox end-to-end verification are complete. This variable gates quote/reserve/provider submission. Employer credentialing additionally requires API account authorized=true, api_authorized=true and purpose=employment. No production API origin is implemented.

Configure Checkr sandbox webhook at `/api/checkr/webhook` after credentials exist. Signature uses partner client secret, compact JSON and X-Checkr-Signature. Subscribe to account.credentialed, token.deauthorized, invitation lifecycle and report lifecycle. Verify delivery through existing Vercel staging deployment protection using a provider-compatible approved bypass; do not remove protection or put bypass credentials in client code.

Unknown age and ages 13–17 remain blocked pending provider confirmation. Employer setup credentials are missing at implementation time; no real provider connection, candidate email delivery, live check, payment, invoice or report email has been verified. Checkr sandbox test-key invitation email behavior differs from production.

## Verification and owner UAT

Automated: `npm run checkr:qa` exercises signature integrity, account/node catalog filtering, safe status projection, role/tenant/subject denial, RPC grants, quote expiry, adult eligibility, monthly limits, independent approvals, leases, ambiguous retry timeout, webhook replay/binding and mocked provider request/response contracts. Run typecheck, lint, build and full CI. Database tests use PGlite with canonical migration foundation and fixture consent helper; they do not substitute for live signed-in UAT or Checkr sandbox contract testing.

Manual owner: QaloriHQ. After credentials/provider setup: connect two sandbox employers; verify isolated catalogs/tokens; configure permitted orderer and distinct reviewer; choose active adult applicant and employee; verify division/location/package review; submit and retry the same order; complete candidate consent in Checkr; verify signed webhook/manual refresh converge; confirm no raw findings enter TXKPRO. Test denied ordinary employee, revoked reviewer/orderer, foreign applicant, unassigned hiring manager, unknown age/minor and inactive employer. Review gallery on mobile and desktop. Keep issue open until provider activation, billing/document decisions and owner UAT are resolved.

Primary provider references: https://docs.checkr.com/partners/ ; https://docs.checkr.com/embeds/ ; https://docs.checkr.com/ .
