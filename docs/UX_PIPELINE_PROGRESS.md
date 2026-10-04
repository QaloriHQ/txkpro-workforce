# UX-PIPELINE / #209 — Employer candidate hiring progress

The Talent candidate profile and referral, interview and placement detail pages show the current hiring journey. The Hiring Pipeline board uses the same derived view. Explicit referral/interview/placement links connect records; student and Hiring Need mismatches are rejected. Separate attempts remain separate. Detail pages focus on the selected record; the Talent profile can filter by Hiring Need.

## Source and scope

Sources: issue #209; PRD FR-MAT/INT/PLC/RET; TRD sections 8.3–8.5; canonical Status Dictionary; Data Ownership and Role Permissions sources; UI Design System Standard. The owner's D-10 decision requires actual employment start confirmation for official placement, with scheduled hires as `pending_start` and retention separate.

The tracker is a server-rendered read model over existing authenticated, employer-scoped referral, interview and placement list RPCs. It adds no database state, API, mutation, permission or form. Private notes, interview messages/evaluations and technical snapshots do not appear in the tracker output. Existing company and assigned Hiring Manager scope remains authoritative.

## Display contract

| Evidence | Current stage |
| --- | --- |
| Referral/new interview draft | New / Referred |
| Requested referral; sent/no-response interview | Interview Requested |
| Accepted/scheduling/scheduled interview | Interviewing |
| Completed interview | Decision |
| Pending start or active legacy placement without complete confirmation evidence | Hire Scheduled |
| Active placement with actual employment start date and confirmation timestamp | Employment Started |
| Declined/cancelled/expired interview, closed referral, ended placement | Closed |
| Unknown status or hired referral without visible placement evidence | Needs Review |

Linked placement evidence takes precedence over interview, then referral. Skipped stages do not gain fabricated evidence. Recorded steps and dates indicate available evidence; current state has a visible text label and `aria-current="step"`. Retention milestones never advance hiring progress. Loading, empty and recoverable read failure states are explicit. Layout stacks on narrow screens and uses existing theme tokens.

## Verification and owner UAT

Automated: `npm run pipeline:qa`, placement and authorization regression suites, typecheck, lint and build. Staging rollout needs no migration. Recovery is an application-code revert.

Owner manual UAT remains required (no automated staging browser tests):

1. Open a Talent profile with no activity: see the empty state; select a Hiring Need and verify only its attempts appear.
2. Open referral, scheduled interview, completed interview and recorded hire pages: verify the current labels match the table. Follow links between the same journey.
3. A past scheduled hire and legacy active placement without confirmation remain Hire Scheduled with confirmation required. Confirm an actual start using the existing modal: tracker advances to Employment Started after refresh.
4. Separate attempts for the same candidate stay separate; ending one placement closes only that journey. Retention check-ins do not alter hiring stage.
5. Use an assigned Hiring Manager and an unrelated-company user: verify existing visibility boundaries and detail denials; read-only users see no new mutation control.
6. At mobile width and in light/dark themes, check labels, dates, links and keyboard focus. Confirm current stage is understandable without color.

Implementation/staging completion does not close #209 until manual acceptance is recorded. Missing Project `Verification` status and unavailable local Project/usage credentials are tracking follow-ups, not proof of acceptance.
