# Workspace-funded rewards and screening controls — staging increment

Related roadmap: #226 W12-16D. Owner approved staging implementation with a scoped Project-access exception on 2026-10-06. Project access remains unavailable to this agent; no Project status is inferred. This increment does not complete the whole funded-rewards issue or authorize production transactions.

## Reward ownership and accounting

Institution administrators and employer owners/administrators connect a distinct Tremendous organization via OAuth. An organization cannot be linked to multiple workspaces or silently replaced. Workspaces create and fund their account in Tremendous's sandbox dashboard; TXKPRO does not charge cards, custody deposits or fabricate settled funding. OAuth onboarding requires Tremendous application credentials, separately from the existing global sandbox API key. Existing third-party webhooks are never overwritten.

Confirmed USD provider balance is cached and timestamped; pending deposits are excluded. Allocations require a provider refresh within two minutes. Program allocations are logical reservations, not provider escrow: spending directly in the provider dashboard can reduce available backing. Provider refusal never silently destroys earned credits.

Draft reward policies configure positive integer conversion blocks, minimum redemption, fee-free merchant gift-card product and administrator/automatic approval. Activation fixes the policy. Terms version increments when the draft policy changes, requiring acceptance of current terms. No historical point backfill occurs. Competition credits are awarded by an administrator after the cycle ends with an audit reason and disclosed tie treatment. Automatic winner payout/final-standings snapshots remain a follow-up acceptance item for #226.

Approved activity awards in earn/redeem or combined programs add monetary credits only while the allocated budget can cover them. Exhaustion preserves activity points and records zero monetary credits. Reversals remove only credits actually issued for the original award. Corrections after redemption can leave a negative credit balance that future earnings offset; ranking/lifetime ledgers are never debited by redemption. Credits have no automatic expiry in this increment. Cancelled/ended cycles keep earned liabilities reserved; only unallocated budget can be released.

Redemption reserves credits atomically. Whole-cent conversion, minimums, current accepted participation and eligible US adult status are checked server-side. Eligibility DOB is privately self-declared, not independently verified, and never projected to public profiles. Minors retain points and cannot directly redeem through Tremendous. Guardian-mediated delivery is not enabled. Recipient email/name comes from the canonical account and is snapshotted privately. Administrator approval requires a different user from the requester.

Each request has one immutable external provider order ID. An ambiguous timeout retains the reservation and retries the same order identity; no new ID is minted. Confirmed issuance is separate from delivery success. Refunds release credits only after a cancelled order and full USD refund are confirmed through a fresh provider read. Partial refunds, ambiguous outcomes and delivery failures retain reservations for reconciliation. Signed webhook receipts store only event/resource identifiers; raw provider payloads are not persisted. A provider account lease serializes token rotation and submission; reconnect is required if a process loses a rotated refresh token before saving it.

## Screening boundary

Employer administrators grant ordinary employees and operational users separate order/review permission, a monthly spending ceiling and an approval-above-price threshold. Both controls are independent: approval never increases the ceiling. The dormant reservation primitive locks the permission row, counts pending/issued reservations within the America/Chicago calendar month and binds retries to the same quote/subject. It is inaccessible to all application roles, including service_role. Public ordering is unconditionally blocked.

Saved bundles are draft labels, not a provider-approved catalog. No Authenticate request, screening order, report download, attachment or report email is executed by this increment. No SSNs, report contents, criminal flags or adjudication results are stored. TXKPRO must not infer hiring clearance from an order status.

Before enabling screening, Authenticate must confirm an employment-approved product, suitability/consent requirements for ages 13–17, authoritative consent collection, eligible applicant/employee relationship checks, provider price quotes, order reconciliation/webhooks, and secure initial employer email delivery. The general seven-year criminal activity endpoint explicitly excludes employment-eligibility use. The provider's approval is a prerequisite, not a setting an administrator can bypass.

## Staging configuration

Set these server-only environment variables for Vercel Preview **staging branch**, never production and never paste secrets into chat/issues:

- `TREMENDOUS_SANDBOX_CLIENT_ID`
- `TREMENDOUS_SANDBOX_CLIENT_SECRET`
- `REWARDS_ENCRYPTION_KEY`: random 32 bytes, base64 encoded; persist safely because rotating it without re-encrypting tokens breaks connections.
- `REWARDS_SANDBOX_APP_ORIGIN=https://staging-workforce.txkpro.com`

Register OAuth callback `https://staging-workforce.txkpro.com/api/rewards/callback` with the sandbox OAuth application. Provider calls are fixed to `https://testflight.tremendous.com`; there is no production switch. OAuth scope is `default team_management`. Workspaces use distinct sandbox organizations. A global `TREMENDOUS_SANDBOX_API_KEY` is insufficient for the per-workspace connection architecture and is not reused.

## Verification and remaining gates

`npm run rewards:qa` tests provider cryptography/contracts and executes the actual additive SQL migration in isolated PGlite Postgres with canonical owner/actor helpers. Tests exercise tenant denial, anonymous/private-table/service-facade denial, frozen policy, minor earning, redemption reservation/idempotency, issued-state preservation, refund credit release, monetary exhaustion/reversal, employee delegation, blocked ordering and budget/retry controls. Local isolated tests do not replace provider end-to-end verification or multi-session staging lock contention tests.

Required signed-in UAT owner: QaloriHQ. On mobile and desktop in both themes: create a draft policy, review modal focus/draft preservation, connect separate workspace sandbox accounts, refresh settled funding, reject insufficient allocations, activate/accept current terms, test adult redemption and minor denial, approve/reject as separate users, confirm gift-card receipt through Tremendous, replay webhooks, simulate timeout/refund/delivery failure, confirm account/cross-tenant boundaries. Test screening permission grants/revocation, ordinary employee access, draft bundles and unconditional order blocking. Review provider account revocation/reconnection behavior before funded launch.

No full Verification/Done transition is authorized by these partial results. Remaining full #226 gates include provider-funded lifecycle tests, multi-session contention, finalized winner/tie payout verification, reconciliation operations/alerting, independently validated eligibility approach and owner UAT. Production funding and real background checks require separate authorization after these gates.
