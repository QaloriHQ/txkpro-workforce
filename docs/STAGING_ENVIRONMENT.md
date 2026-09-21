# TXKPRO Workforce staging environment

TXKPRO Workforce should use a persistent hosted staging application rather than GitHub Codespaces for end-to-end authentication testing.

## Recommended topology

- GitHub branch: `staging`
- Hosted application: Vercel
- Preferred stable URL: `https://staging-workforce.txkpro.com`
- Production application: `https://workforce.txkpro.com`
- Database/Auth: isolated Supabase development branch when enabled

A stable staging origin prevents password-recovery and email-confirmation links from depending on a temporary Codespaces forwarded-port URL.

## Vercel staging environment variables

Configure these in the Vercel Preview/Staging environment:

```text
NEXT_PUBLIC_SITE_URL=https://staging-workforce.txkpro.com
NEXT_PUBLIC_SUPABASE_URL=<staging Supabase branch URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>
SUPABASE_SECRET_KEY=<staging server secret>
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

For a true sandbox, use a Supabase development branch rather than the production database. Development branches receive schema/migrations without production data, which keeps test Employers, approvals, interviews, placements, retention events, and audit records out of production.
