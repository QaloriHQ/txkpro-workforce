# WAVE 9 — Interview + Hire Production Integration

Wave 9 connects Interview Request, Student response, Employer-private interview evaluation, Record Hire, Placement, and Day 30/60/90 retention milestone creation to the canonical TXKPRO Workforce backend.

## Source-of-truth rules

- Referral, Interview, Placement, and Retention Milestone remain separate canonical state machines.
- Employer creates Interview Requests; Student owns the response.
- Employer owns Interview scheduling and Employer-private evaluation.
- Employer-private evaluation never changes Instructor/Institution Verified Skills and is not exposed in Student or Institution read models.
- Placement owns the employment outcome.
- Recording a hire does not rewrite Interview history; the Interview remains `completed`.
- A linked Referral may advance to `hired`, while retaining its own history.
- Recording a new Placement creates exactly Day 30, Day 60, and Day 90 milestone records.
- Hiring Pipeline is a derived read model. It does not persist a universal pipeline status.
- Notifications are consequences of shared domain events, not workflow state.

## Canonical state vocabularies

Interview:
`draft, sent, accepted, declined, scheduling, scheduled, completed, cancelled, expired, no_response`

Placement:
`pending_start, active, ended, unknown`

Retention Milestone:
`pending, due, sending, sent, responded, skipped, failed, cancelled`

## Data model

Wave 9 adds:

- `wf_interview_requests`
- `wf_interview_evaluations`
- `wf_placements`
- `wf_retention_milestones`
- `wf_notifications`

The shared Wave 8 `wf_referrals`, `wf_hiring_needs`, `wf_student_profiles`, `wf_domain_events`, and `platform_audit_events` remain canonical dependencies.

## Interview Request

`employer_request_interview`:

1. verifies Employer approval;
2. checks Employer role/scope and Hiring Manager assignment;
3. verifies the Student is visible through Referral or authorized Talent scope;
4. creates `sent` Interview state;
5. moves a linked Referral to `interview_requested`;
6. creates an in-app notification consequence;
7. emits `INTERVIEW_REQUESTED` into the shared event/audit infrastructure.

Duplicate active requests for the same Employer / Student / Hiring Need / Referral return the existing Interview rather than creating competing state.

## Student response

`student_respond_interview` derives the Student from the authenticated account. Employer code cannot choose the Student response.

Supported responses:

- Accept → `accepted`
- Request follow-up → `scheduling`
- Decline → `declined`

A linked Referral becomes `interview_accepted` or `interview_declined` as appropriate. The response emits `INTERVIEW_RESPONDED`.

## Scheduling and completion

Employer may schedule only accepted/scheduling Interviews. A scheduled Interview can be marked completed. Completion itself does not create a hire.

## Employer-private evaluation

One private evaluation may be maintained per Interview:

- Not set
- Continue
- Hold
- Close
- Prepare Hire

The evaluation is Employer-only and audited.

## Record Hire / Placement

An authorized Employer records a hire only from a completed Interview.

Required:

- role title
- hire/start date

Optional:

- trade
- employment type

Placement status is:

- `pending_start` when the hire date is in the future;
- `active` when the hire date is today or earlier.

The function prevents duplicate active/pending Placements for the same Employer + Student.

## Day 30 / 60 / 90

Placement creation inserts exactly three unique retention milestone records:

- Day 30 = hire date + 30 days
- Day 60 = hire date + 60 days
- Day 90 = hire date + 90 days

The unique `(placement_id, day_number)` constraint and idempotent Record Hire behavior prevent duplicate milestone templates.

Ending a Placement cancels unsent pending/due/sending milestones while preserving history.

## UI

Employer:

- `/employer/interviews`
- `/employer/interviews/[id]`
- `/employer/pipeline`
- `/employer/placements`
- `/employer/placements/[id]`

Interview Request entry points:

- Candidate Profile
- Referral Detail

Student:

- `/student`
- production Interview response controls
- scheduled Interview details
- Placement status

## APIs

- `POST /api/interviews`
- `PATCH /api/interviews/[id]/respond`
- `PATCH /api/interviews/[id]/status`
- `PUT /api/employer/interviews/[id]/evaluation`
- `POST /api/placements`
- `PATCH /api/placements/[id]`

## Student onboarding hardening

Wave 9 also moves Student onboarding save/complete into authenticated, security-definer RPCs so the hosted staging flow does not depend on a browser-accessible or Vercel service-role secret. Student discoverability is written explicitly as `employer_discoverable` or `private`.

## Verification performed in staging

The rolled-back end-to-end database test verified:

- Employer creates Interview Request;
- Student identity alone responds;
- Employer schedules;
- Employer completes;
- Employer saves private evaluation;
- Employer records hire;
- Placement becomes `pending_start` for a future start;
- exactly 3 milestones are created;
- milestone days equal `[30,60,90]`;
- exactly one `INTERVIEW_REQUESTED`, `INTERVIEW_RESPONDED`, and `PLACEMENT_CREATED` event is emitted.

Security checks verify:

- cross-tenant Interview read is denied;
- anonymous execution of Interview/Record Hire RPCs is denied;
- seeded Kayla Placement contains exactly three milestone records.

## Verification commands

```bash
npm run typecheck
npm run lint
npm run build
npm run wave9:smoke
```

The existing legacy retention-pulse cron route still references the older pre-reconciliation retention tables. Wave 9 guarantees canonical milestone creation; scheduler/SMS migration to `wf_retention_milestones` should be handled as the next Retention production-integration step rather than creating a second source of truth here.
