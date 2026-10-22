# Zoho Bookings research scheduling — #357

Owner selected Zoho Bookings API in place of direct Google Calendar and supplied https://book.txkpro.com/txkpro. Native email links remain https://txkpro.com/booking; the owned redirect/native Workforce form is retained. No provider iframe, Apps Script or browser OAuth credential is introduced. The public booking URL did not yield usable service metadata in the implementation environment (HTTP 503), so no region/service/staff identity is inferred.

## Configuration

Add to **txkpro-workforce-marketing → Preview → staging**, with separate production values only after production approval:

| Variable | Source / purpose |
| --- | --- |
| ZOHO_BOOKINGS_CLIENT_ID | Zoho Self Client → Client Secret tab |
| ZOHO_BOOKINGS_CLIENT_SECRET | Same client; store as Secret |
| ZOHO_BOOKINGS_REFRESH_TOKEN | Self Client authorization-code exchange; store as Secret |
| ZOHO_BOOKINGS_REGION | Verified Zoho account data center: US, EU, IN, AU, CN, JP, CA or SA |
| ZOHO_BOOKINGS_WORKSPACE_ID | Authenticated workspaces API |
| ZOHO_BOOKINGS_SERVICE_ID | Authenticated services API; select research interview event type |
| ZOHO_BOOKINGS_STAFF_ID | Assigned staff identifier from services API |
| ZOHO_BOOKINGS_EMAIL_DISABLED | Set `true` only after administrator verifies all provider-generated email is disabled |

Existing staging Supabase server secret, Twilio Email credentials and enable flag are also required. Vercel variables in the authenticated `txkpro-workforce` project are not inherited by this project. Do not print, read back or copy production secrets for staging. Direct Google variables are no longer used; removal is optional after deployment acceptance.

Create a **free, one-to-one, 20-minute** research interview event type, with at least **10 minutes buffer**, Chicago timezone and assigned staff. API checks service type, duration, buffer, zero price, assigned staff and availability timezone. Only provider-returned slots within the existing weekday 09:00–16:00 Chicago schedule, half-hour starts, tomorrow through next 30 days are displayed. A date selector limits each public availability check to one day; the frontend drops stale results after a date change. Configure the staff's conflicting calendars in Zoho and verify that conflicts are actually blocked. Required custom fields/phone must be disabled for this event type: the form sends name and email only.

To honor **Twilio Email only**, disable all email notifications/reminders/workflows for both customers and users on this event type, and check any connected-calendar invitation emails. Bookings 2.0: Workspace → Event Types → Edit → Notifications Preferences → Email → To Customer and To Users. The appointment API has no documented per-request mail-suppression field; the environment flag is an explicit operator attestation, not an API verification. Do not set it until the configuration is confirmed. Do not send a live test appointment until it is confirmed. SMS is not enabled by this implementation.

## Secure setup utility

OAuth scope: `zohobookings.data.CREATE`. Use the Self Client authorization-code grant. Prepare a private environment file outside the git repository with Client ID, Client Secret, verified REGION and newly generated short-lived `ZOHO_BOOKINGS_AUTHORIZATION_CODE`. Use the regional Zoho API Console; a custom booking domain alone does not prove region. Do not paste secrets into chat, command arguments, GitHub or logs.

Run in a private operator environment with Node 24+:

```sh
node --env-file=/private/zoho-setup.env --experimental-strip-types scripts/zoho-bookings-setup.mjs exchange /private/zoho-refresh.env
```

The utility creates a new mode-0600 file exclusively before exchanging the code. It saves the refresh token there without printing tokens or provider payloads. It never overwrites a file, retries an exchange automatically, or logs authorization data. Store the resulting `ZOHO_BOOKINGS_REFRESH_TOKEN` in Vercel, then remove the code and temporary private files. A timeout can consume the code without returning a token; investigate and generate a fresh code rather than replaying blindly.

With the OAuth values in your private environment, discover IDs (service names and IDs only; no customer data or staff contact details):

```sh
node --env-file=/private/zoho-setup.env --env-file=/private/zoho-refresh.env --experimental-strip-types scripts/zoho-bookings-setup.mjs discover
```

Add the selected workspace/service/staff IDs, verify disabled emails, then run the read-only setup check:

```sh
node --env-file=/private/zoho-setup.env --env-file=/private/zoho-refresh.env --experimental-strip-types scripts/zoho-bookings-setup.mjs check
```

It reports date/timezone/duration/slot count only. A short-lived access token is refreshed server-side. OAuth/API domains are selected from a fixed regional allowlist and the token response's api_domain must match; no user-supplied arbitrary upstream URL is accepted. Credentials are POST body/header values, never URL query values. Remote response size, timeouts and redirects are bounded; errors are redacted.

## Persistence, booking safety and email

Source migration `20261022024229_marketing_zoho_bookings.sql` adds `booking_provider` and `provider_booking_id` with unique provider identity. Historical Google rows default to `google`. New rows explicitly use `zoho`. The old constrained `google_event_id` column is retained as a compatibility reservation hash and ICS UID; it is never used to call Google or store a Zoho identifier. This is additive and does not change historical archive or participant data, public grants or RLS.

Flow: validate request and restricted preview recipient → verified live Zoho slots → durable unique local slot claim → recheck provider availability → one appointment POST with local request reference in notes → validate provider ID/service/staff/start/end/duration/status/timezone → store provider booking ID → mark local reservation booked → separately claim/send Twilio confirmation and private TXKPRO ICS link. No provider booking is claimed successful before validation. Google has no calls in this flow.

Zoho does not document an idempotency key for appointment creation. On an uncertain POST, invalid confirmation or persistence failure, keep the local reservation as `needs_review`, retain the request reference, and do not retry creation automatically. An operator must reconcile the Zoho appointment using that reference. No cancellation, rescheduling webhook or recurring reminder campaign is installed; the participant uses the TXKPRO contact route for changes. Existing preview-template sends do not book appointments.

## Verification and activation

Focused tests cover date/DST and schedule bounds; genuine Zoho slot intersection; region/API-domain rejection; provider failures; service mismatch; notification attestation; exact multipart appointment fields; one POST on ambiguity; code exchange; public DB denial; provider identity and existing consent/send deduplication. Native deployed ESM startup is separately tested. Required CI runs typecheck, lint, build and the relevant suites.

After staging migration and credentials are configured, redeploy staging and enable `MARKETING_RESEARCH_ENABLED` plus Twilio only in the restricted test environment. Verify a blocked busy time, one confirmed appointment and retry, local/provider identity, receipt delivery, private ICS, survey, withdrawal, expired/wrong capabilities and no provider-generated email. Owner performs desktop/mobile, themes, keyboard and visual UAT. No browser staging QA is performed by the agent.

Production migration/release requires separate authorization under AGENTS.md. Keep the 117-message preview batch on hold until production CTA routes, real service/availability and email-only transport are verified. No production app release, historical import, campaign activation or deletion is authorized by this provider switch.

Official references: [authentication](https://www.zoho.com/bookings/help/api/v1/oauthauthentication.html), [Self Client](https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html), [workspaces](https://www.zoho.com/bookings/help/api/v1/fetch-workspaces.html), [services](https://www.zoho.com/bookings/help/api/v1/fetch-services.html), [availability](https://www.zoho.com/bookings/help/api/v1/fetch-availability.html), [appointment](https://www.zoho.com/bookings/help/api/v1/book-appointment.html), [notifications](https://help.zoho.com/portal/en/kb/bookings-2-0/event-types/event-type-settings/articles/email-and-sms-alerts).
