# TXKPRO Workforce staging environment

TXKPRO Workforce should use a persistent hosted staging application rather than GitHub Codespaces for end-to-end authentication testing.

## Recommended topology

- GitHub branch: `staging`
- Hosted application: Vercel
- Preferred stable URL: `https://staging-workforce.txkpro.com`
- Production application: `https://workforce.txkpro.com`
- Database/Auth: isolated Supabase project `TXKPRO Workforce Staging` (`qwxlgzlkaeaqfzjodtis`)

A stable staging origin prevents password-recovery and email-confirmation links from depending on a temporary Codespaces forwarded-port URL.

## Vercel staging environment variables

Configure these in the Vercel Preview/Staging environment:

```text
NEXT_PUBLIC_SITE_URL=https://staging-workforce.txkpro.com
NEXT_PUBLIC_SUPABASE_URL=https://qwxlgzlkaeaqfzjodtis.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_3IqP_qR9WpROX7F6elpuKA_UCt4n5vJ
SUPABASE_SECRET_KEY=<copy from the staging Supabase project; never commit>
```

Add the remaining server-only Twilio variables only when the staging environment needs to exercise SMS.

Do not include `/**` in `NEXT_PUBLIC_SITE_URL`. Wildcards belong only in Supabase Auth redirect allowlists.

## Supabase Auth URL configuration

For the staging Auth project/branch, allow:

```text
https://staging-workforce.txkpro.com/**
https://workforce.txkpro.com/**
http://localhost:3000/**
```

Codespaces URLs can remain available for developer diagnostics but should not be the primary user-facing Auth callback.

## Email sign-in

The hosted Supabase project currently sends an email OTP code for passwordless sign-in. The TXKPRO sign-in screen therefore accepts the code directly with `verifyOtp({ email, token, type: "email" })`.

This flow requires no callback URL and works from any browser.

Password recovery still uses a secure recovery link. In staging it should return to:

```text
https://staging-workforce.txkpro.com/auth/confirm?next=%2Freset-password
```

## Isolation

Staging now uses a completely separate Supabase project rather than a database branch. This keeps staging Auth users, Employers, approvals, Hiring Needs, events, and audit records out of production. The staging project has a greenfield Workforce foundation with RLS enabled and no production data.


## Current staging backend

- Project: `TXKPRO Workforce Staging`
- Project ref: `qwxlgzlkaeaqfzjodtis`
- API URL: `https://qwxlgzlkaeaqfzjodtis.supabase.co`
- Cost: `$0/month` under the current organization/project allowance
- Security advisor: no findings after bootstrap
- GitHub deployment branch: `staging`

The bootstrap SQL applied to the isolated project is tracked under `supabase/staging/migrations/`. It is intentionally separate from the production migration chain because the production database predates this repository and already contained the base Workforce schema.
