# D-10: Official placement

Owner decision approved 2026-10-03, tracked in #202:

An official placement is counted when an authorized Employer or permitted workforce operator confirms the Student started employment. Scheduled starts are `pending_start`. Retention milestones keep their own lifecycle and never become placement statuses.

Recording a hire creates a pending start and exactly three retention templates, even when its scheduled date has passed. Explicit confirmation captures the actual employment start date, confirmation timestamp and authenticated actor, and changes pending employment to `active`. No timer, offer, interview outcome, training completion or retention response confirms employment.

Official totals count explicitly confirmed employment records, including subsequently ended employment. Active totals additionally require `active`. Ending a pending start does not create an official placement. Totals count employment records, not unique Students or a causal readiness score. Scheduled starts appear separately. Future reports must state scope and time window; use actual employment start date for start-based windows.

Employer owners, admins and recruiters may confirm their approved Employer's placements; hiring managers require the associated hiring need assignment. Permitted operators are active TXKPRO platform admins or Institution Super Admin, Institution Admin, Career Services and Program Coordinator memberships with matching Student scope. Each membership's role and scope must match together. Department Heads, instructors, assistants, analysts, employer read-only users and Students cannot confirm through those roles. SQL enforces this independently of UI visibility.

`hire_date` remains the scheduled date. `employment_start_date`, `start_confirmed_at` and `start_confirmed_by_auth_user_id` are canonical confirmation evidence. The actor ID stays server-side. Confirmation locks the placement, checks current authorization before accepting a retry, returns the existing result for the same date, and rejects a changed date. The existing `PLACEMENT_STATUS_CHANGED` audit records provenance; `PLACEMENT_CREATED` remains the hire-recording event.

Legacy active rows remain intact and are excluded from official totals until explicitly confirmed. Neither the old `started_at` timestamp nor the scheduled date proves confirmation. Authorized users may confirm legacy active or ended records; an ended record must have an end date on or after the actual start. No automatic backfill asserts employment happened.

Confirmation anchors unsent pending/due retention templates to actual start +30/+60/+90 days. Already messaged and responded history is preserved. The scheduler requires confirmed active employment and still applies existing consent, delivery and idempotency rules. Closing a retention case never changes placement status.

## Staging UAT

At https://staging-workforce.txkpro.com:

1. As an approved Employer recruiter/admin, complete an interview and use **Record hire**. Choose a past scheduled date: the result must still be pending_start, absent from official totals, with three templates.
2. Open **Confirm employment started**. Cancel/Escape preserves the draft and returns focus. A future actual start is rejected. Confirm today's or a past actual date: employment becomes active and official exactly once; pending count decreases.
3. Retry the same date: no duplicate audit or templates. A different date is rejected. Verify retention dates follow actual start and retention never changes placement status.
4. As an authorized Institution admin/Career Services/Program Coordinator, confirm a scoped Student placement from the Student profile or Employer detail. Wrong Employer, unassigned hiring manager, read-only and out-of-scope roles must be denied, including direct API access.
5. End a pending start: official total stays unchanged. End confirmed employment: historical official total remains and active total decreases. Delivered retention history stays visible.
6. Verify the modals on phone, tablet and desktop, with keyboard/visible focus and light/dark themes. Report role, record, failing step and error text for any difference.

No production deployment or external test messages are included. Signed-in visual UAT remains owner-run. Application rollback must not restore the pre-D-10 auto-activation RPC; use a forward correction to retain confirmation evidence.
