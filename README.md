# TXKPRO Workforce

A Codespaces-ready Next.js MVE for the Greater Texarkana skilled-trades workforce network.

The first release is intentionally not a generic job board. It is built around three high-friction workflows:

1. **Verified Skills Matrix + 1-Click Referral** — students maintain a living competency profile; assigned educators verify demonstrated skills and refer students directly to approved employers.
2. **Job-Ready Filter** — employers filter on job-relevant readiness attestations and work preferences before spending time on an interview.
3. **30/60/90-Day Retention Pulse** — both sides receive brief SMS check-ins after hire; an issue response creates a human intervention case.

## Stack

- Next.js 16.3.3 / React 19 / TypeScript
- GitHub Codespaces dev container (Node 24)
- Supabase Auth + Postgres
- Server-mediated authorization with a server-only Supabase secret key
- Twilio Programmable Messaging for SMS
- GitHub Actions for CI and optional daily retention-pulse triggering

## Open in GitHub Codespaces

This repository includes `.devcontainer/devcontainer.json`. After the repo is on GitHub:

1. Select **Code → Codespaces → Create codespace on main**.
2. Codespaces runs `npm install` automatically.
3. Run `cp .env.example .env.local`.
4. Run `npm run dev`.
5. Open forwarded port **3000**.

Without Supabase credentials, the role demos still work:

- `/demo/student`
- `/demo/educator`
- `/demo/employer`
- `/demo/admin`

## Supabase backend and authentication

This repository is connected to the existing **TXKPRO™** Supabase backend rather than a greenfield demo database. The backend already contains the platform user, role-membership, institution, student, contractor, job, application, and SMS tables.

Set in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dohhosnwkcbzyugihxba.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` is supported as a legacy server-only fallback. Never expose either server secret in client code.

Authentication uses Supabase SSR cookies and server-verified claims. Authorization comes from active rows in `app_role_memberships`, not from user-editable Auth metadata.

### Account onboarding

- Student accounts provision a `wf_student_profiles` record and active student membership.
- Educator accounts select an existing `wf_institutions` record and remain pending until the institution relationship is approved.
- Employer accounts provision a contractor/workforce-contractor record with contractor approval kept as a separate pending state.
- Admin onboarding is only available to an already-provisioned administrator; public signup cannot self-grant admin access.

The incremental backend migrations are in `supabase/migrations/`. The original generated prototype schema has been removed from active migrations because it does not match the live TXKPRO backend.

## Configure SMS

Set:

```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
TWILIO_INBOUND_WEBHOOK_URL=https://YOUR-DOMAIN/api/twilio/inbound
CRON_SECRET=...
```

Then configure the Twilio number's incoming-message webhook to the same `/api/twilio/inbound` URL.

Retention messages are sent only when the intended recipient has both a phone number and `sms_consent_at` value.

## Trigger retention pulses

Manual / scheduler call:

```bash
curl -X POST https://YOUR-DOMAIN/api/retention/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

The included `.github/workflows/retention-pulses.yml` can call this daily after the app is deployed. Add repository secrets:

- `TXKPRO_APP_URL`
- `CRON_SECRET`

## API endpoints in this MVE

- `GET/PATCH/POST /api/onboarding` — authenticated onboarding state and role-specific provisioning
- `PATCH /api/job-readiness` — student updates readiness attestations/preferences
- `POST /api/skills/self-attest` — student marks a competency ready for verification
- `POST /api/skills/verify` — assigned educator/admin verifies competency
- `POST /api/referrals` — assigned educator/admin refers a student to an employer
- `POST /api/retention/run` — protected scheduler endpoint for due 30/60/90-day pulses
- `POST /api/twilio/inbound` — signature-validated SMS reply webhook

## Important product semantics

**Verified** means an authorized educator has digitally attested that the student demonstrated the competency. It is not a government license or third-party certification unless TXKPRO later adds a separate verification source.

**Job-ready** fields in this MVE are candidate attestations/preferences. They should be displayed that way. Employers retain final hiring responsibility and should use lawful, job-related criteria.

**Retention pulses** are an early-warning mechanism, not an employee performance score. A `3` triggers human follow-up rather than an automatic employment action.

## Repository structure

```text
app/
  api/                  Server-authorized workflow routes
  demo/                 Interactive MVE role previews
  dashboard/            Authenticated role router
  login/                Supabase sign-in
  signup/               Public Student/Educator/Employer registration
  onboarding/           Role-aware onboarding wizard
components/              Shared UI
lib/                     Auth, Supabase, audit, SMS, types
supabase/migrations/     Incremental migrations for the established TXKPRO backend
.devcontainer/           Codespaces config
.github/workflows/       CI + retention scheduler
```

See `docs/ARCHITECTURE.md` for trust boundaries and next increments.
