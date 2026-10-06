# W12-16D — Central TXKPRO rewards, staging acceptance

Owner approval supersedes customer OAuth and 180-day expiration proposals. Staging only; the scoped Project-access exception remains in effect. #226 remains open pending provider configuration, end-to-end sandbox verification and owner UAT. Authenticate ordering remains disabled (#244).

## Product contract

- PRO-Mode programs use the TXKPRO sponsor wallet; Intra-Mode uses the institution/employer sponsor wallet. Both participation types can coexist. PRO employee invitations require an active ordinary employee membership in an active approved employer; program participation never grants operational workspace access.
- Achievement points, seasonal ranks and lifetime levels are unchanged. Purchased Reward Credits fund prizes and cannot buy scores, badges or levels.
- Funding and awarded-credit ledgers have no expiry job. Workspace funds never expire. Recipient balances remain while accounts are open and in good standing; holds preserve balances and freeze spending rather than forfeit them.
- Earn-and-redeem, top-winner and combined program structures remain supported. Conversion/minimum/approval rules freeze on activation. Winner rules disclose positive-score rank cutoff and credits per winner; ties share rank and each winner gets a full prize. Finalization snapshots all winners atomically, or awards nobody if the budget is insufficient. Retry cannot award twice. Released budget keeps earned liabilities and issued rewards reserved.
- Only approved canonical workspace owners/admins can set up or fund a pool. TXKPRO platform administrators alone can initiate/reconcile provider backing. No workspace provider accounts, provider members or external OAuth redirects are created. Credentials and recipient payment data never appear in projections.

## Money contract

Immutable server-priced quotes separate principal, 10% platform fee ($5 minimum), and configured third-party fees. The fee is charged once at funding. Stripe Payment Element collects tokenized card/ACH details inside the TXKPRO modal. Server-bound Checkout Session IDs, principal, currency, total and test-mode state are checked against signed webhook events and retrieved Stripe objects. ACH pending/completed-unpaid events do not create available credits. Refunds/disputes place sponsor funding on hold and preserve all balances. Holds need finance resolution; there is deliberately no self-service unfreeze.

Customer `paid` is distinct from provider `backed`. TXKPRO finance can create an API topup using TXKPRO's saved sandbox funding source. The source and idempotency key are immutable per funding request. Partial/created topups never release credits; a retrieved `fully_credited` USD topup plus fresh provider balance is required. Reversed/rejected topups freeze the sponsor. With no saved source configured, the invoice fallback creates a prefunding invoice; TXKPRO finance must fund it separately. Neither invoice creation nor a browser return confirms money. Invoice timeouts reconcile by purchase-order reference and never blindly create a replacement.

Allocations require both sponsor-specific backed principal and fresh aggregate provider coverage. Central account locking/leases serialize provider orders and allocations. Funding and score ledgers are separate. Raw funding/payment-event tables and service RPCs are inaccessible to anonymous/authenticated clients.

## Staging configuration (values must not be placed in GitHub or logs)

Vercel Preview, branch `staging`, exact origin `https://staging-workforce.txkpro.com`:

- Existing `TREMENDOUS_SANDBOX_API_KEY`, `REWARDS_ENCRYPTION_KEY` (32-byte base64), `REWARDS_SANDBOX_APP_ORIGIN`.
- `STRIPE_SANDBOX_SECRET_KEY` (`sk_test_` or restricted `rk_test_`), `STRIPE_SANDBOX_PUBLISHABLE_KEY` (`pk_test_`), `STRIPE_SANDBOX_WEBHOOK_SECRET`.
- `REWARDS_PRICING_VERSION`: published approved pricing revision.
- For each `CARD` and `ACH`: `REWARDS_<METHOD>_THIRD_PARTY_BPS`, `REWARDS_<METHOD>_THIRD_PARTY_FIXED_CENTS`, `REWARDS_<METHOD>_PAYMENT_METHOD_CONFIGURATION`. Pricing includes all applicable third-party charges; do not invent provider rates. Stripe `pmc_` configurations must respectively expose only the quoted card or US ACH method, with no incompatible currencies/methods. Zero rates require an explicit approved zero-fee configuration.
- Optional `TREMENDOUS_SANDBOX_FUNDING_SOURCE_ID`: saved TXKPRO sandbox source with `balance_funding` permission; required for funding Tremendous through API topups. Without it, finance uses invoice reconciliation.

Stripe webhook URL: `/api/rewards/funding/webhook`; subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`. Successful payment fulfillment is webhook-only. Configure keys, method profiles and pricing before collecting even sandbox payments, then redeploy staging. Live keys and live webhook events are rejected.

Workspace setup registers one central Tremendous webhook using the provider-returned private key, encrypted in the platform account. An existing unknown receiver is not overwritten; finance must coordinate its reconciliation. API requests use the fixed Testflight host. Obsolete customer OAuth routes return 410.

## Owner UAT and release gate

1. Employer and institution admins: open Incentives → Set up reward funding modal. Terms, fees and separate balances are clear on mobile and both themes; Cancel/Escape/focus work. Ordinary employees and unrelated tenants cannot manage funding.
2. Review a configured card/ACH quote. Verify principal + platform fee + third-party fee = total. Secure payment fields remain in the workspace. During confirmation, the modal cannot be dismissed or another request substituted. Resume the same pending request, including after refresh/timeout.
3. Test card success/failure and ACH pending/success/failure. Verify customer-payment confirmation alone leaves funds unavailable. Replay signed events; credits appear only once after provider backing.
4. TXKPRO finance at `/incentives`: create/reconcile provider backing. Pending/partially credited funds remain unavailable. Reverse a sandbox topup/refund/dispute; spending freezes and balances remain.
5. Allocate one sponsor's confirmed balance to a program. Other sponsors cannot spend it. Lifetime scores do not change when funds are purchased or redeemed.
6. Configure each challenge structure, conversion minimum, approval and positive-score winner rule before activation. End a cycle with a tie: all tied winners receive equal prizes once, or none when underfunded. Redeem an adult's earned balance after cycle end; minor users can earn but cannot directly redeem.
7. Join PRO-Mode and Intra-Mode programs concurrently; filters reveal existing authorized participation and do not grant access. Invite a canonical employee to a PRO program; a nonemployee cannot be designated as an employee.

Automated checks cover cryptography/signatures, integer quotes, actual SQL role/scope/transition/replay/hold invariants and winner ties. Missing credentials prevent signed-in sandbox payment/provider end-to-end verification. No production deployment, real payment, provider order or screening execution is claimed.

## Automated staging evidence (2026-10-06)

- CI #590 passed the full repository suite before applying the database migration. Final merge requires CI on the aligned migration filename as well.
- Supabase staging `qwxlgzlkaeaqfzjodtis` ledger: version `20261006040640`, name `workforce_central_reward_funding`, SQL MD5 `e1a2b76a93f839621ea52d7181c1a5db`. The repository filename matches this recorded version; SQL contents are unchanged by alignment.
- `supabase/staging/tests/central_reward_funding.sql` passed against the actual staging database; all claims, funding fixtures, audits and score data rolled back. It verifies canonical employer/student scope, minors, customer-payment/backing separation, replay, holds retaining funds, private projections and closed screening execution.
- New raw funding and payment-event tables have RLS enabled and no authenticated/anonymous table access; private service and legacy helpers have no authenticated execute grant.
- Advisor warning categories/counts unchanged: authenticated public security-definer warnings 123, leaked-password protection 1; duplicate-index warnings 3. Informational RLS-with-no-policy increased 82→84 for the intentionally RPC-only tables, and unused indexes 87→91 for new cold indexes. Remediation context: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- No real payments, topups, invoices, gift cards, screening orders or production mutations were performed. Provider/Stripe signed-in end-to-end checks remain blocked by configuration. Actual agent token/cost telemetry is unavailable (`gh` runtime absent); counts have not been fabricated.

## Funding UI correction — 2026-10-06

Owner screenshots establish successful setup with ambiguous feedback, an attempted quote failing because Stripe configuration is missing, and invisible field borders. Setup now presents completed details instead of another confirmation form; operation-specific feedback resets when funding dialogs open. Add Reward Credits projects only server-derived boolean card/ACH configuration readiness. Unconfigured methods are not offered and an unavailable-payment notice appears before submission. Server payment validation remains authoritative and unchanged; readiness is configuration availability, not provider or settlement verification. Shared form controls use defined TXKPRO tokens for contrasting field fill, borders, placeholders and focus in both themes; checkbox/radio controls retain compact native sizing.

No new migrations, statuses, fees, access grants or payment bypass. Existing scoped Project-access exception retained: task-context/preflight still fail for missing local PROJECTS_TOKEN. Telemetry start still fails with gh ENOENT; no fabricated usage. Test account webhook is saved, but Stripe test keys, method configurations and approved pricing remain absent from Vercel metadata. No sandbox payment or funding activation is claimed.

Owner UAT: on Employer and Institution Incentives, open funding setup details and confirm completed state; Add Reward Credits must explain unavailable payments without accepting a quote; opening another dialog must clear earlier feedback. Inspect text, number, date/time, file, select and textarea fields in both themes and on mobile; checkbox labels align inline and keyboard focus remains visible. After finance configuration and redeployment, only configured card/ACH methods should appear; run the existing signed-payment/backing checklist above.


## Funding modal and ambiguous payment recovery — 2026-10-06

Owner reported an unconfirmed payment result and requested a sleek funding modal. Stripe read-only inspection found the matching $16,500 test Checkout Session open/unpaid with no PaymentIntent; this is evidence of no confirmed payment at inspection, not a diagnosis of the browser exception.

- Compact 620px dialog, Amount/Review/Payment steps, aligned fee summary, prominent total, shared tokens and theme-aware Stripe fields; no card-saving prompt.
- Mount a payment provider only in the open funding dialog, preventing the current request and hidden history dialog from mounting the same session simultaneously.
- `POST /api/rewards/funding` `op: status` reuses existing funding authority and reads the stored Stripe Session with expanded PaymentIntent. Validate session/request identity, reference, amount, USD and test mode before returning only safe feedback and resume eligibility. No database mutation, no browser-based fulfillment, no provider backing, no new quote/session/payment created by a status check.
- Confirmation validates fields, checks status after success/exception, locks another Pay submission after an ambiguous result and offers Check payment status / Resume payment. Reload uses the existing stored Session; submitted/expired sessions do not reload payment fields. Reopening checks status before enabling Pay.
- Signed webhooks remain the canonical payment transition path. ACH processing and provider backing remain separate gates.
- Prior approved scoped Project-access exception retained; local preflight/task context still fail for absent PROJECTS_TOKEN. Usage script cannot access gh; actual token/cost telemetry unavailable.
- Manual owner UAT: card happy path and decline, ambiguous response/check/resume, close/reopen current request, history resume, ACH pending, mobile/narrow layout, both themes, keyboard/focus. Verify same funding/session identity and no duplicate credit before provider backing.
- No migrations or authorization changes; issue #226 remains open and Project status is not manually advanced.
