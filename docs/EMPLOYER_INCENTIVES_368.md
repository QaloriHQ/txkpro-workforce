# Employer Incentives #368 — implementation and activation contract

Owner approved the design and employer-defined conversion, expiry/departure and safety-redemption settings in the active conversation. The owner explicitly extended the Project-access exception to #368. This is a direct implementation increment on a feature branch from staging; no automated Definition-of-Ready PASS, canonical Project status, live funding activation or production authorization is claimed.

## Delivered in this increment

- Employer-only program gallery at `/employer/incentives`: all matching lifecycle states, search, status/blueprint filters, name/ending/updated/budget sort; per-company full program read (no inherited global 50-program truncation), unique participant aggregation, planned budgets and existing scoped reward accounting.
- Program operations at `/employer/incentives/[programId]`: Overview, People, Rules & milestones, Activity, Rewards, Analytics. Editor lives at `/new` or `/[programId]/edit`; no inline gallery forms.
- Guided and Advanced authoring share a structured definition. Autosave after first explicit create; optimistic revision check, recoverable failure and conflict reload. A required name is not silently fabricated for abandoned new forms. No browser persistence of private drafts.
- Typed AND/OR conditions, individual/crew routing, equal integer split simulation, required safety/quality checks and approval-sequence configuration. Server validates the same allowed metric vocabulary. No arbitrary JavaScript/SQL execution.
- Employer-defined USD conversion blocks, minimum, expiry/indefinite availability, departure window/retention, safety reward mode, giving allowances, recipient caps, communication preferences and crew rosters are saved as configuration. These are not automatically applied to the existing funded reward policy. Published crew assignments can be maintained separately with revision checks and active accepted participant validation; changing a roster does not overwrite published terms.
- Publish creates immutable definition history and canonical evidence-review activities, with zero private score. Proposed monetary points must never become PRO Points or private competition points accidentally. Existing operations remain backed by canonical program/participant/submission/score/reward records.
- Published terms cannot be silently overwritten after activation or participant acceptance. Active-program edits remain unpublished; a new program is required for changed participant terms in this increment. Full multi-version participant enrollment is not implemented here.
- Confidential safety, own declined-submission disputes within 48 hours of recorded review, private text recognition, independent review, immutable original evidence, single appeal and append-only review history. Pending/verified safety cases stay open past the 24-hour remediation target until explicit resolution. No safety countdown is reset or fabricated.
- Program pause/archive metadata; direct legacy activity mutations are blocked while paused/archived. Archive requires ending an active program; existing financial rights are not removed.
- Read-only points-banking API reuses existing reward credits/requests, distinguishes available/reserved/issued without subtracting reservations twice, returns only the authenticated recipient's accounts and bounded transaction history.
- ROI scenario calculator and rule simulator are explicitly estimates/dry runs. They create no awards. Invalid/zero denominators and unavailable evidence do not produce success.

## Exact RPC/API surface

Private checked RPCs: `incentive_action(jsonb)`, `incentive_workspace()`, `incentive_employer_workspace(text)`, `incentive_bank()`. Public wrappers are SECURITY INVOKER; private functions use canonical active actor/owner checks, empty search_path and explicit grants. Direct API-role table access is revoked with RLS enabled. Service role is not a client authorization shortcut.

`POST /api/employer/incentives` handles the bounded owner/participant actions. The versioned surfaces include:

- `GET /v1/rewards/accounts/me` and `/transactions` (own account summaries with bounded history).
- `POST /v1/rewards/peer-nomination` (private recognition text, no point transfer).
- `POST /v1/rewards/safety-reports`.
- `POST /v1/rewards/metric-decisions/[id]/disputes` (ID is the canonical declined submission).
- `POST /v1/rewards/disputes/[id]/resolution` (independent owner/admin verifies or declines).
- `POST /v1/rewards/redemptions` (expanded engine fails closed pending activation).
- `GET /v1/rewards/redemptions/[id]` (existing authorized reward history only).

All mutation HTTP routes bound request bodies and reject a mismatched Origin. Database RPC authorization is authoritative even when a caller bypasses the UI.

## Not delivered / not activated — retain #368 open

This increment is not full epic acceptance. Remaining work is explicit:

1. Operational rule evaluation from authenticated verified source events, fixed milestone crew snapshots, multi-step approval execution and atomic funded individual/crew entitlement issuance. The current test simulator is not a production rule evaluator.
2. Lot-level financial terms/expiry/departure enforcement on actual credits, provider-specific catalog validation and immediate safety redemption override. Configuration alone is not a redeemable promise.
3. Safety payout reservation and actual safety-streak engine integration, duplicate hazard policy and escalation delivery. Current cases preserve evidence and open remediation state; no new monetary entitlement is minted.
4. Funded monthly peer allowances/expiration, point transfers, sender/recipient caps and collusion detection. Current endpoint provides confidential nomination validation only.
5. Automatic retention scheduler with verified employment/HRMS/project sources, anniversary/DST/leap-day policies and actual reward issuance. Current rule definitions/simulator can describe retention conditions.
6. Opt-in shared recognition feed/crew boards, status tiers and real gear/truck/scheduling perk fulfillment. No public recognition is inferred from a program flag.
7. ERP/HRMS authenticated mapping/ingestion, multi-version participant enrollment, delegated team/location governance, real notification delivery, richer ROI scenario comparison and gallery location/team/owner filters.

The unresolved funded launch contract remains employer sponsorship/custody, approved funded catalog and provider operation/refund/reconciliation validation. Existing legacy sandbox rewards remain on their original contracts. No production deployment or production migration is authorized.

## Migration and recovery

Additive migration generated with Supabase CLI: `20261028004805_employer_incentive_engine.sql`. Four new RPC-only RLS tables, a nullable activity mapping column/index, checked RPCs and a legacy action wrapper. Never rewrite it once applied. Rollback strategy: revert application increment while keeping additive tables/history; operational forward fix if needed. Before deploying app code, apply/confirm its migration so new RPCs exist. Do not reverse existing financial ledgers or drop earned records.

## Verification

`npm run incentives:qa` executes typed logic plus PGlite against the actual new migration and canonical program/helper/action SQL. Tests cover scope/anonymous/direct-table denial, revision races, immutable publication, disabled monetary mutation, pause bypass, confidentiality, independent safety review, open remediation after deadline, duplicate reports, 48-hour dispute window, single appeal, own bank reservation accounting and more than 50 scoped gallery programs. Also run typecheck/lint/build and existing reward suites.

Owner signed-in UAT (no automated staging browser run):

- Gallery matches chosen employer only; search/filter/sort, counts and empty states.
- Create/save/reopen both editor modes; publish with valid terms/milestones; verify a stale editor cannot overwrite another save.
- Inspect program sections; legacy invitations/review and existing sandbox reward management remain reachable inside the program.
- Separate participant account submits a confidential hazard, nomination or eligible dispute; separate admin reviews; other tenant/peer cannot see the confidential case.
- Verify pause blocks direct submissions and archive preserves records. No new funded reward claims or live provider actions should be available.
- Keyboard/focus, screen-reader labels, narrow widths, light/dark themes and save/error feedback.

Do not mark #368 Done until remaining scope, deployment/SQL checks and owner UAT meet the full issue contract. Project state remains unverified under the approved access exception. Exact provider token/cost telemetry is unavailable; report unavailable rather than zero.
