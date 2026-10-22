# Native research pages and email previews — #357

The owner chose dedicated working pages before sending all 117 email previews, and retained live Google Calendar scheduling. No preview batch is sent until the live routes and calendar pass the operator preflight.

## Sources and destinations

The supplied engagement workbook snapshot contains 117 active templates. Six roles have 19 templates each, plus three internal notifications. These templates are preserved as content only in `marketing/research/email-templates.json`. No participant/subscriber rows, calendar IDs or credentials are included. Template targets are symbolic `survey`, `booking` and `home`.

Survey questions come from the recovered owner-owned v7 engagement source `05_Survey.gs.txt`: six roles, seven questions each, identical choice/scale text and options. This is `legacy-v7` questionnaire provenance, not a new hiring assessment. Public responses are unrelated to student/hiring records and do not create Auth identities. The workbook scheduling settings are America/Chicago, weekdays Monday–Friday, 09:00–16:00, 20-minute interviews, 10-minute buffer, next 30 days, up to 120 available slots. The original calendar checks the interview calendar and the owner's primary calendar.

| Email CTA | Owned apex URL | Native destination |
| --- | --- | --- |
| Survey | `https://txkpro.com/survey?role=student` | `https://workforce.txkpro.com/survey`, role retained |
| Interview | `https://txkpro.com/booking?role=student` | `https://workforce.txkpro.com/booking`, role retained |
| Home | `https://txkpro.com/workforce` | Workforce homepage |
| Preferences | `https://txkpro.com/unsubscribe` | Native Workforce email preferences |

Apex redirects preserve query strings and browser fragments. Research pages are noindex, excluded from sitemap/llms and contain no personalized IDs/tokens in discovery files. Survey/booking/preference content is rendered using the existing shared marketing branding, themes, forms and responsive tokens. No Apps Script URL, iframe or fallback is introduced. Source Sheets and Apps Script remain unchanged.

## Backend and privacy

`/api/research` is an intentionally public, bounded intake API, enabled only by `MARKETING_RESEARCH_ENABLED=true`. It accepts approved HTTPS marketing origins, caps JSON at 16KB, sets no-store/CORS headers, validates all role-specific choices server-side, and uses service-only persistence with no anon/authenticated grants. IP/recipient rate buckets use HMAC with a separate private `RESEARCH_LINK_SECRET`; raw IPs are not stored. Public origin checks are not treated as authentication. Booking writes and receipts are throttled more tightly by recipient. In preview, booking/preference mail is restricted to the private `RESEARCH_EMAIL_TEST_TO` address.

The CLI-generated `20261022005356_marketing_research.sql` adds service-only research survey, booking, preference token, suppression and operator email-preview ledger tables, plus rate-limit/withdrawal functions and a trigger that prevents opt-out reversal. These are research domain records, not Workforce hiring interview states. Historical archive records remain untouched. Unsubscribe requests send a private 90-day confirmation link, return no subscription existence information, and require explicit confirmation. Tokens are random 256-bit capabilities, stored as hashes, carried in URL fragments and removed from the page address before API use. Repeated confirmation is idempotent. Opt-out affects Workforce marketing only; it does not cancel an interview or suppress necessary account/research receipts.

Survey request UUIDs deduplicate a retry and reject payload changes. Booking acquisition uses a unique slot constraint and stable request hash. All configured calendars must return valid live free/busy data, otherwise no slots are offered. Calendar availability is checked again after the reservation. Event IDs are deterministic, so a duplicate event can be reconciled without creating another. A provider/network/DB uncertainty leaves the reservation for manual review and never claims success or blindly retries a send. Other calendar clients can still create a conflicting event between the final free/busy check and Google insert; Google has no transaction spanning these operations. Review uncertain/conflicting reservations manually; do not delete them automatically.

Google events contain no attendee list and use `sendUpdates=none`. Email goes through Twilio Email only. The participant receives a Twilio confirmation and private TXKPRO link to an ICS download, rather than Google-generated invitation email. Video/phone interview details are provided separately, matching the source configuration. A durable receipt claim prevents automatic resend after uncertainty. `accepted` remains distinct from delivered; the existing Twilio operation checker supplies delivery evidence.

## Staging configuration and activation

Server and frontend project: `txkpro-workforce-marketing`, preview/staging branch. The native Vercel function shares the marketing origin, so protected staging app cookies or public authentication bypasses are not required. The authenticated Workforce application project is not released or reconfigured. This project now installs the locked root dependencies for its server function; the static site build itself still has no dependencies.

- `MARKETING_RESEARCH_ENABLED=true` on the server only.
- `RESEARCH_LINK_SECRET`: a private random value of at least 32 characters, different for production.
- `RESEARCH_EMAIL_TEST_TO`: private owner-approved test recipient in preview only.
- Dedicated `TWILIO_EMAIL_*` configuration from PR #361, enabled only in the authorized test environment.
- `GOOGLE_RESEARCH_CLIENT_ID`, `GOOGLE_RESEARCH_CLIENT_SECRET`, `GOOGLE_RESEARCH_REFRESH_TOKEN`: OAuth credentials stored as secrets. Use an offline refresh token with calendar event-write and free/busy permissions, not a browser access token. The authorized Google account must have event write access to the interview calendar and busy access to every blocking calendar.
- `GOOGLE_RESEARCH_CALENDAR_ID`: interview calendar ID, stored privately.
- `GOOGLE_RESEARCH_BUSY_CALENDAR_IDS`: comma-separated blocking calendars, including `primary` (the interview calendar is always included). Use a separate test calendar/Google OAuth configuration for staging.
- The frontend uses the same-origin `/api/research` function when `MARKETING_RESEARCH_ENABLED=true`. Missing configuration leaves form submission disabled with truthful availability text. Configure `NEXT_PUBLIC_SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` in this marketing project for the correct staging/production database. Never submit production forms to the staging database. Dedicated Twilio and Google credentials must also be set in this project; they are not copied from the authenticated app project or exposed in HTML.

Google Calendar API references: [free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [event insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [authorization scopes](https://developers.google.com/workspace/calendar/api/auth). OAuth credentials are absent at implementation time; no live availability/booking or production activation is claimed without verification. Do not reuse Supabase Auth Google credentials silently. No credentials belong in chat, git, HTML, or logs.

## Operator email preview batch

`scripts/research-email-preview.mjs --check|--send|--status <batch UUID>` runs only in a secure reviewed server environment. It requires `TXKPRO_EMAIL_PREVIEW_TO` to be the owner-approved recipient and the enabled dedicated Twilio transport. It renders all 117 as clearly labeled test emails with synthetic names/record IDs/dates/answers. Booking previews do not create an appointment and internal previews do not contain historical PII.

Every link must be HTTPS on the owned apex; redirects are followed manually only within the apex/Workforce hosts. Live research forms must have a nonstaging configured backend and verified live calendar response. No placeholder or 404 bypass is allowed. The batch ledger claims each template before sending, binds source and recipient hashes, and never sends that template twice for the same batch. Source/recipient changes reject the batch before sends. Ambiguous sends stop processing and retain the claim; inspect provider evidence, never remove the claim to force a resend. `--status` reads operation states only and stores aggregate provider counts, without logging recipients or credentials. No automatic campaign schedule is installed.

Production rollout requires explicit approval of this new schema/backend release after staging checks. Configure the verified production database, calendar and separate credentials, apply the reviewed migration, deploy server and marketing pages, then verify apex redirects and real submission/booking/withdrawal behavior. Existing marketing production release authorization does not silently release the authenticated Workforce app. Until that rollout is verified, the 117-message batch remains on hold.

Owner UAT: desktop/mobile and both themes; keyboard role and answer selection, validation/focus/status feedback; public survey submission/retry; live calendar slots and timezone, collision/retry handling; confirmation/ICS via Twilio; email preference request and explicit confirmation; wrong/missing capability denied; no subscription details exposed; all email CTA redirects remain on TXKPRO hosts. No browser staging QA is performed by the agent.
