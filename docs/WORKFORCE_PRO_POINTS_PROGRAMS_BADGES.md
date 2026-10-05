# PRO Points, private programs and System badges

Owner-approved staging implementation for #224 W12-16B, #225 W12-16C, #239 W16-05 and the authorized non-funded portions of #77–79. The Project-access exception does not bypass authorization, source, CI, migration or UAT checks. Production, SMS, checkout, cash conversion, reward issuance and redemption are not authorized by this change. #226 remains the funded-activation gate.

## Authority and scope

The live issue contracts include the owner's approved numeric schedule and exact badge tiers. Canonical sources are the MVP PRD/TRD, ownership/scope rules, role matrix, status dictionary, event map and UI design standard under `docs/product-sources/`. This feature promotes points from the historical post-MVP deferral by explicit owner instruction.

New technical contracts below implement those decisions. Platform administrators may create TXKPRO programs; institution super admins/admins with active institution scope may manage their own institution; approved active employer owners/admins manage their employer. Students and other activated users see their own program invitations and accepted activity. Participation never creates an employer staff membership. Employees are employer-asserted, program-specific affiliates; this is not verified employment. Canonical organization/team/location employee management remains #76, not inferred from a program invitation. New-account activation continues to use canonical invitation/onboarding; this release's program invitation requires an activated account.

## Separate systems

* `wf_pro_rules` and append-only `wf_pro_ledger`: shared Student achievement scoring.
* `wf_incentive_programs`, participants, activities, submissions and private score ledger: organization-owned programs; private scores do not add PRO Points or create credentials.
* `wf_pro_activity_days` and System badges: source-backed activity achievements, distinct from instructor verified skills, employer training, company badges and formal certifications.
* `wf_incentive_pool_ledger`: inaccessible funding-provenance scaffolding. No writer or redeemable balance.
* `wf_incentive_audit`: program lifecycle, acceptance, submissions, decisions and corrections.

Every new table has RLS and direct anonymous/authenticated privileges revoked. Bounded invoker RPCs call checked private helpers with an empty search path. Raw source-award/reversal helpers cannot be invoked by authenticated users. Public progress is service-only, checks canonical public profile publication first, and separately respects existing `show_progress` and `show_badges` preferences. Public output contains only aggregates/ranks and badge issuer/tier, never ledger/source/participant records or answer keys.

## Approved scoring v1

| Event | Category | Points | Event limit |
|---|---|---:|---|
| Validated check-in, any topic | Reliability | 5 | 1/day |
| Passed trivia, any topic | Reliability | 5 | 1/day, no retry |
| Verified attendance | Reliability | 5 | 1/day |
| Newly instructor verified competency | Skill Mastery | 75 | 2 distinct/week |
| Eligible employer training completion | Skill Mastery | 50 | 2 distinct courses/week |
| Approved lab | Skill Mastery | 15 | 3 distinct/week |
| Approved milestone | Skill Mastery | 25 | Once per defined milestone |
| Verified mentoring | Community | 20 | 2/week |
| Approved trade tip | Community | 10 | 1/week |

| Category | Daily cap | Weekly cap |
|---|---:|---:|
| Reliability | 15 | 75 |
| Skill Mastery | 150 | 250 |
| Community | 20 | 50 |
| Total | 185 | 375 |

Periods use America/Chicago. Weeks begin Monday; seasons are calendar quarters. Source deduplication precedes caps. Excess is retained with zero points and no carryover. Advisory transaction locks serialize Student awards; private program row/participant locks serialize activity awards. Rule version is copied into each award. Source invalidation adds an idempotent negative reversal in the original scoring period. Lifetime totals are never reduced by season changes, spending or missed streak days.

Initial shared awards activate only new canonical institution-verified skills with an active scoped verifier and canonical passed completions for an active, live-version employer course. The skill provenance dictionary's value is `institution_verified`, not an invented `instructor_verified` database status. Course versions use `live`, not `published`. Source timestamps are accepted server-side transition times; client backdating is unavailable. Cosmetic edits, retries, course versions, automatic company badges and historical records do not create extra awards. Remaining shared rules are seeded disabled: custom/private activity evidence cannot silently qualify for shared points.

Lifetime levels: L1 0, L2 250, L3 750, L4 1,500, L5 3,000, L6 5,000, L7 8,000, L8 12,000, L9 18,000, L10 25,000. Same points feed Cohort, Institution and TXKPRO rankings; competition ranks preserve ties (1,1,3). Default preferred ranking is Cohort using the existing profile editor; selecting the rank opens all three.

## Program lifecycle

Program: `draft → active → ended|cancelled`; draft may cancel directly. Activities and terms freeze on activation; changed definitions require a new program/cycle. The templates Competition / Earn and redeem / Combined are supported structurally; no template activates payment or redemption.

Participation: `pending → active|declined|expired|cancelled`; active may cancel. Pending invitations expire at 14 days or cycle end. Acceptance stores exact terms version/time. Employee and sponsored-Student audiences are separate; institution invitations require matching canonical Student institution. Participant leaderboards default private and must be disclosed in accepted terms when enabled.

Submission: `pending → approved|declined`; approved may become `reversed` with an audited negative score. Trivia is validated automatically against a server-only answer key, with one attempt per activity period; others require an administrator reason. Self approval is denied. Evidence, review and private score remain distinct records. No completion generates a verified credential. Dates, schedule weekdays, evidence instructions, private point values, audience and caps are captured before activation. Schedules use America/Chicago, regardless of a browser's local input timezone.

Owner-only activity CSV exports include participation type, private points and approved completion counts; they are audited and formula-escaped. This is not a payroll payout report.

New program audit events: PROGRAM_CREATED, CREATE_ACTIVITY, SET_STATUS, INVITE, ACCEPT, DECLINE, CANCEL_PARTICIPANT, SUBMIT, APPROVE, REJECT, REVERSE, PROGRAM_REPORT_EXPORTED. Ledger source transitions are independently retained as award/reversal entries. New states/events are feature-specific contracts, not aliases of hiring/placement/retention states.

## System badges

Exact tiers: **3, 7, 15, 30, 90, 180, 395, 650, 1000 days**. No replacement of 395 with 365. Source family is visit/check-in/engagement; current and longest are separate. Earned badges persist through an ordinary miss. No streak multiplier or badge point bonus.

Visit collection requires a visible, focused signed-in Student workspace interaction after page load; loading, refreshing or backgrounding alone records nothing. Repeated visits deduplicate per day. This source is enabled. Administrator-approved TXKPRO-owned daily check-ins scheduled on all seven weekdays also feed the System check-in family; other private programs do not. Reversing invalid check-in evidence removes that qualifying day and revokes only tiers no longer supported by any valid run. Engagement is visibly Coming soon until a canonical social source exists. The implementation does not fabricate likes/comments/shares or treat a share-sheet/copy intent as completed sharing. Non-daily or shorter-week check-in schedules need a scheduled-day streak source before activation; this release only counts the curated every-day platform schedule.

## Surfaces and verification

Student Home/profile and `/student/points`; `/institution/incentives`, `/employer/incentives`; generic activated-account `/incentives`; private `GET/POST /api/pro-points`; curated public profile aggregates. Forms are button-opened native modals with focus containment, pending state, retained drafts and accessible feedback. Compact layouts preserve mobile bottom navigation.

Run `scripts/pro-points-staging-qa.sql` together with the migration inside BEGIN/ROLLBACK before deployment. It exercises caps, duplicate awards, source separation, source reversal, next-season history, student denied authoring, pending/accepted participation, rule freeze, trivia, answer-key exclusion, direct privileges, visit deduplication and the exact 3-day tier. No fixture award or program survives. Required app gates: typecheck, lint, build, CI. After deployment confirm migration ledger, exact Vercel staging SHA, anonymous API denial and advisors against baseline.

Owner UAT: create a draft, add custom activities (including trivia), activate, invite both supported employer audiences/institution Student, accept/decline with a separate account, submit correct/incorrect trivia, review non-trivia evidence as a different administrator, reverse an award, end the cycle, test private leaderboard disclosure; verify mobile modals and ranking modal; change profile sharing and inspect public/private outcomes. Rewards must remain unavailable. New-account invitations, #76 affiliation integration, team/location reviewer delegation, funded governance/payroll payout reports and source-unbuilt badges are follow-ups; the original broader #77–79/#239 acceptance must not be marked Done on this evidence alone.
