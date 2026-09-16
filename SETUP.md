# TXKPRO Workforce — Codespaces + Supabase setup

This repository targets the existing **TXKPRO™ Supabase project**. The production workforce schema already exists there; the SQL files under `supabase/migrations/` are incremental migrations only.

## 1. Codespaces environment

From the repository root:

```bash
cp .env.example .env.local
```

Add:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dohhosnwkcbzyugihxba.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<server-only secret key>
```

Leave `NEXT_PUBLIC_SITE_URL` blank while running through GitHub Codespaces. The browser's public `*.app.github.dev` origin will be used for Supabase Auth callbacks automatically. In production set:

```bash
NEXT_PUBLIC_SITE_URL=https://workforce.txkpro.com
```

`SUPABASE_SERVICE_ROLE_KEY` remains supported as a legacy fallback. Never commit `.env.local`.

Validate the current environment before testing email auth:

```bash
npm run auth:check
```

## 2. Authentication

The app supports:

- Email/password signup for Student, Educator, and Employer accounts
- Email confirmation through `/auth/confirm`
- Password recovery through `/forgot-password` → `/auth/confirm` → `/reset-password`
- Email/password sign in through `/login`
- Cookie-based Supabase SSR sessions
- Server-side role resolution from `app_role_memberships`
- Sign out through `/auth/signout`
- Friendly auth failure handling through `/auth/error`

Public registration never grants an admin role. TXKPRO administrator access must already exist in `app_role_memberships`.

Supabase Auth URL Configuration should include:

```text
Site URL
https://app.txkpro.com

Redirect URLs
https://app.txkpro.com/**
https://workforce.txkpro.com/**
https://ads.txkpro.com/**
https://**.app.github.dev/**
http://localhost:3000/**
```

## 3. Auth email delivery

Branded Supabase email templates and SMTP guidance are documented in `docs/AUTH_EMAIL_DELIVERY.md`.

The hosted Supabase project should use a custom transactional SMTP provider before public launch. Never commit SMTP credentials to GitHub.

## 4. Onboarding behavior

- **Student:** creates/updates the native workforce student profile and activates the Student membership.
- **Educator:** links to an existing institution and enters `pending_review` unless an approved educator membership already exists.
- **Employer:** creates/updates a contractor + workforce contractor profile. The contractor remains `approval_status = pending` while the owner account can finish onboarding.
- **Admin:** onboarding is available only to an already-provisioned TXKPRO administrator.

Onboarding drafts and completion state are stored in `wf_onboarding_accounts`.

## 5. Run

```bash
npm install
npm run auth:check
npm run dev
```

Open port 3000 and test:

- `/signup`
- `/login`
- `/forgot-password`
- `/onboarding`
- `/dashboard`

## 6. Important migration note

The original generated greenfield scaffold SQL has been removed from active migrations because it used a separate prototype schema that does not match the established TXKPRO backend.
