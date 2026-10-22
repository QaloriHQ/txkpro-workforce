# Native research pages and email previews — #357

The owner chose dedicated working pages before sending all 117 email previews, and subsequently selected Zoho Bookings for live scheduling. No preview batch is sent until the live routes and calendar pass the operator preflight.

## Sources and destinations

The supplied engagement workbook snapshot contains 117 active templates. Six roles have 19 templates each, plus three internal notifications. These templates are preserved as content only in `marketing/research/email-templates.json`. No participant/subscriber rows, calendar IDs or credentials are included. Template targets are symbolic `survey`, `booking` and `home`.

Survey questions come from the recovered owner-owned v7 engagement source `05_Survey.gs.txt`: six roles, seven questions each, identical choice/scale text and options. This is `legacy-v7` questionnaire provenance, not a new hiring assessment. Public responses are unrelated to student/hiring records and do not create Auth identities. The workbook scheduling settings are America/Chicago, weekdays Monday–Friday, 09:00–16:00, 20-minute interviews, 10-minute buffer, next 30 days, up to 120 available slots. The original calendar checked the interview calendar and the owner's primary calendar. Zoho now owns availability; configure its calendar conflicts accordingly.

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

Survey request UUIDs deduplicate a retry and reject payload changes. Booking uses a unique local slot reservation and stable request hash before exactly one Zoho appointment POST. The new additive provider migration preserves legacy Google identifiers, adds provider and appointment identity, and leaves service-only RLS intact. Provider/network uncertainty remains `needs_review`; it never triggers a blind provider retry. Confirmed receipts use Twilio Email and a private native ICS download. An accepted email remains distinct from delivered.

## Staging configuration and activation

The provider is Zoho Bookings. Direct Google OAuth and calendar calls have been removed from the native research backend. The owner-supplied public Bookings address is https://book.txkpro.com/txkpro; it is a reference, not a source for inferred IDs or OAuth data center. See [Zoho setup and operating instructions](zoho-research-bookings.md) for required variables, secure authorization-code exchange, service discovery, notification configuration and verification.

Server/frontend project: `txkpro-workforce-marketing`, Preview/staging branch. The same-origin `/api/research` function is enabled only when `MARKETING_RESEARCH_ENABLED=true`. Missing setup leaves the forms disabled. Configure the correct staging Supabase URL and server-only secret, private `RESEARCH_LINK_SECRET`, restricted `RESEARCH_EMAIL_TEST_TO`, and dedicated Twilio configuration in this project. Secrets from the authenticated app project are not inherited. No production activation or authenticated Workforce app release is implied.

## Operator email preview batch

`scripts/research-email-preview.mjs --check|--send|--status <batch UUID>` runs only in a secure reviewed server environment. It requires `TXKPRO_EMAIL_PREVIEW_TO` to be the owner-approved recipient and the enabled dedicated Twilio transport. It renders all 117 as clearly labeled test emails with synthetic names/record IDs/dates/answers. Booking previews do not create an appointment and internal previews do not contain historical PII.

Every link must be HTTPS on the owned apex; redirects are followed manually only within the apex/Workforce hosts. Live research forms must have a nonstaging configured backend and verified live calendar response. No placeholder or 404 bypass is allowed. The batch ledger claims each template before sending, binds source and recipient hashes, and never sends that template twice for the same batch. Source/recipient changes reject the batch before sends. Ambiguous sends stop processing and retain the claim; inspect provider evidence, never remove the claim to force a resend. `--status` reads operation states only and stores aggregate provider counts, without logging recipients or credentials. No automatic campaign schedule is installed.

Production rollout requires explicit approval of this new schema/backend release after staging checks. Configure the verified production database, calendar and separate credentials, apply the reviewed migration, deploy server and marketing pages, then verify apex redirects and real submission/booking/withdrawal behavior. Existing marketing production release authorization does not silently release the authenticated Workforce app. Until that rollout is verified, the 117-message batch remains on hold.

Owner UAT: desktop/mobile and both themes; keyboard role and answer selection, validation/focus/status feedback; public survey submission/retry; live calendar slots and timezone, collision/retry handling; confirmation/ICS via Twilio; email preference request and explicit confirmation; wrong/missing capability denied; no subscription details exposed; all email CTA redirects remain on TXKPRO hosts. No browser staging QA is performed by the agent.
