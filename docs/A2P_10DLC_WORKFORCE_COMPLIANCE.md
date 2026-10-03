# TXKPRO Workforce A2P 10DLC Compliance Boundary

Status: implementation guardrail
Legal entity: **Qalori, LLC**
Customer-facing brand: **TXKPRO**
Relationship: **Qalori, LLC dba TXKPRO**

## Purpose

This document defines the messaging boundary for TXKPRO Workforce so carrier registration, application behavior, and consent records describe one consistent messaging program.

It does not replace legal review, the public Privacy Policy, or the public Terms and Conditions.

## Campaign separation

TXKPRO must not represent Home Services and Workforce messaging as one mixed A2P campaign.

### TXKPRO Workforce transactional campaign

Audience:
- Students and other Workforce participants who have provided the applicable SMS consent.

Permitted transactional purposes in this repository:
- account notifications;
- interview-request notifications;
- verification/status notifications;
- support communications;
- 30/60/90-day retention check-ins.

Runtime sender:
- `TWILIO_WORKFORCE_MESSAGING_SERVICE_SID`
- The Messaging Service must be attached to the TXKPRO Workforce A2P campaign.
- It must not be the Messaging Service used by TXK Home Services.

### TXK Home Services campaign

Homeowner/service-request messaging is a separate audience and message flow.

Its A2P registration, Messaging Service, consent evidence, message samples, and campaign description must be maintained outside the Workforce transactional campaign.

## Daily engagement and streak reminders

Daily engagement and streak reminders are not permitted on the Workforce transactional SMS sender.

For MVP1, W13-07 should use in-app and/or email reminders only.

SMS may be added to daily engagement in the future only after all of the following are intentionally approved and implemented:

1. The product owner classifies the messaging purpose.
2. A separate compliant consent path is implemented for that purpose.
3. The corresponding A2P campaign is registered/approved if required.
4. The sender uses the Messaging Service attached to that campaign.
5. Opt-out, preference, audit, delivery, and failure handling are implemented.
6. Transactional Workforce consent is not reused as a substitute.

## Consent enforcement

Outbound Workforce SMS requires:

- a phone number;
- a valid applicable SMS consent record;
- no active opt-out/revocation;
- an explicitly allowed transactional purpose.

The canonical SMS consent statuses are `unknown`, `consented`, `opted_out`, and `revoked`.

STOP/unsubscribe must be honored immediately for the relevant messaging category.

## Public legal identity requirement

The public Privacy Policy and Terms URLs submitted for the Workforce A2P registration must identify the business relationship clearly as:

**Qalori, LLC dba TXKPRO**

The Privacy Policy used for carrier review must also make the SMS-specific no-sharing rule explicit. At minimum, it must state in substance that SMS opt-in data and messaging consent are not sold or shared with third parties or affiliates for their marketing or promotional purposes.

The public Terms should identify the TXKPRO program, describe the applicable messaging program, explain message frequency and message/data-rate disclosures, provide HELP/STOP instructions and a support route, link the Privacy Policy, and include the applicable carrier-delivery disclaimer.

## Release blocker

This repository does not control the root `txkpro.com/privacy` and `txkpro.com/terms` publishing surface.

Before the Workforce A2P campaign is submitted or resubmitted, the exact public URLs used in the registration must be verified to:

- load without authentication;
- identify **Qalori, LLC dba TXKPRO**;
- contain the SMS no-sharing disclosure;
- match the links presented at the opt-in point;
- describe the same Workforce messaging program submitted to Twilio.

Until that publication is verified, A2P campaign resubmission remains blocked.

## Code guardrail

`lib/sms.ts` accepts only the approved Workforce transactional purpose vocabulary and sends through `TWILIO_WORKFORCE_MESSAGING_SERVICE_SID`.

Engagement/streak reminder purposes are intentionally absent from the transactional purpose vocabulary.

If a future implementation needs an additional purpose, it must be reviewed as a product/compliance change rather than silently added.
