# WAVE 10 — Retention Pulse Production Integration

Wave 10 connects the canonical Day 30/60/90 Retention Milestones created in Wave 9 to consent-aware Student SMS delivery, inbound response normalization, and human intervention cases.

## Source-of-truth rules

- `wf_retention_milestones` remains the authoritative Day 30/60/90 state machine.
- Outbound messages, responses, and intervention cases are separate records. They do not replace milestone state.
- SMS is sent only to a Student with a mobile number and active `retention` consent.
- Scheduler claims are atomic and idempotent. A milestone has at most one SMS message record.
- Provider message IDs are persisted.
- A response of `3` opens a human intervention case; it never triggers an automatic Employer or employment action.
- Employer-private interview evaluation remains separate from retention.
- STOP immediately changes the Student's retention SMS consent to `opted_out`.
- Ambiguous inbound replies are never guessed or attached to an arbitrary milestone.

## Canonical state vocabularies

Retention Milestone:
`pending, due, sending, sent, responded, skipped, failed, cancelled`

Retention SMS Consent:
`unknown, consented, opted_out, revoked`

Retention Response:
- `1` → `going_well`
- `2` → `some_friction`
- `3` → `needs_help`

Retention Case:
`open, assigned, contacted, monitoring, resolved, closed_no_response, cancelled`

## Data model

Wave 10 adds:

- `wf_sms_consents`
- `wf_retention_messages`
- `wf_retention_responses`
- `wf_retention_cases`
- `wf_retention_case_notes`

Wave 9 remains canonical for:

- `wf_placements`
- `wf_retention_milestones`
- `wf_notifications`
- `wf_domain_events`
- `platform_audit_events`

## Scheduler

`POST /api/retention/run` is protected by `CRON_SECRET`.

The service-only `retention_claim_due_milestones` RPC:

1. selects `pending/due` milestones whose `scheduled_for <= now()`;
2. requires the Placement to still be `active`;
3. uses row locks with `SKIP LOCKED`;
4. changes the milestone to `sending`;
5. creates exactly one SMS message record for the milestone;
6. emits `RETENTION_MILESTONE_DUE`.

The Next.js route then:

- skips missing-phone or non-consented messages;
- sends through Twilio in live mode;
- records the provider message ID and moves the milestone to `sent`;
- marks failed sends explicitly instead of silently creating fake provider IDs.

`TXKPRO_SMS_MODE=mock` exists only for controlled non-production tests. Default/live mode requires real Twilio credentials.

## Student consent

Student onboarding keeps the existing mobile-number field and adds an unchecked, optional retention-SMS consent control.

When selected:

- `wf_sms_consents.category = retention`
- `status = consented`
- consent timestamp and phone snapshot are persisted.

When the Student does not opt in, an existing `opted_out` or `revoked` state is never overwritten.

## Inbound SMS

`POST /api/twilio/inbound` validates the Twilio request signature before recording any response.

The service-only `retention_record_sms_response` RPC:

- deduplicates inbound provider message IDs;
- maps only 1/2/3 safely;
- matches exactly one outstanding retention message by normalized sender phone;
- returns `ambiguous` instead of guessing when more than one open message matches;
- changes the milestone to `responded`;
- emits `RETENTION_RESPONSE_RECEIVED`.

STOP-family keywords immediately set retention consent to `opted_out`. START/UNSTOP can explicitly restore consent.

## Human intervention

A response of `3`:

1. creates exactly one `wf_retention_cases` row per milestone;
2. starts the case at `open / high`;
3. emits `RETENTION_CASE_OPENED`;
4. queues in-app notifications for eligible TXKPRO Admin and Institution/Career Services roles.

Employers do not receive the sensitive retention-case notification by default, and no employment action is automated.

## Security

- All new Wave 10 tables have RLS enabled.
- Direct `anon` and `authenticated` table privileges are revoked.
- Wave 10 scheduler and inbound RPCs are `SECURITY INVOKER` and executable only by `service_role`.
- Twilio webhook requests require valid provider signatures.
- Cron execution requires `CRON_SECRET`.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm run build
npm run wave10:smoke
```

A rolled-back staging database test verified:

- exactly one due milestone claim;
- successful send-state transition;
- `3` maps to `needs_help`;
- exactly one response;
- exactly one open intervention case;
- scheduler replay cannot reclaim the responded milestone;
- duplicate inbound provider ID is idempotent;
- STOP changes retention consent to `opted_out`;
- repeated delivery of the same STOP provider message is idempotent.

No test data from that transaction was retained.

## Operational configuration

Required for hosted live SMS:

```text
CRON_SECRET
TXKPRO_SMS_MODE=live
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
TWILIO_INBOUND_WEBHOOK_URL
```

The existing GitHub Actions retention scheduler remains the single scheduler for this wave.
