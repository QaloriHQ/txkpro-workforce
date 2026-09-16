# TXKPRO Workforce Auth Email Delivery

TXKPRO Workforce shares the `TXKPRO™` Supabase project with other TXKPRO applications. The Workforce app therefore always supplies its own redirect URL when requesting signup confirmation or password recovery.

## URL contract

- Canonical Supabase Site URL: `https://app.txkpro.com`
- Workforce production origin: `https://workforce.txkpro.com`
- Workforce callback: `/auth/confirm`
- Codespaces preview allowlist: `https://**.app.github.dev/**`
- Local development allowlist: `http://localhost:3000/**`

Workforce uses `NEXT_PUBLIC_SITE_URL` when configured. In GitHub Codespaces, leave `NEXT_PUBLIC_SITE_URL` blank so the browser's public `*.app.github.dev` origin is used instead of localhost.

## Verify the local/runtime environment

Run:

```bash
npm run auth:check
```

The command prints the resolved origin, signup callback, recovery callback, and whether the required Supabase environment variables are present. It does not print secret values.

## Hosted Supabase email templates

Branded templates live in:

- `supabase/templates/confirmation.html`
- `supabase/templates/recovery.html`
- `supabase/templates/password-changed.html`

For the hosted Supabase project, copy these into **Authentication → Emails**. Suggested subjects:

- Confirm signup: `Confirm your TXKPRO Workforce account`
- Reset password: `Reset your TXKPRO Workforce password`
- Password changed: `Your TXKPRO Workforce password was changed`

The confirmation and recovery templates intentionally use `{{ .ConfirmationURL }}`. Supabase builds that URL from the redirect passed by the requesting application, which avoids hard-coding `app.txkpro.com` into Workforce emails when multiple TXKPRO applications share the same Auth project.

## Custom SMTP

For production, configure **Authentication → Emails → SMTP Settings** using a TXKPRO-controlled sending domain. Recommended sender identity:

```text
TXKPRO <no-reply@txkpro.com>
```

Use a transactional SMTP provider with SPF, DKIM, and DMARC configured for `txkpro.com`. Disable click/link tracking for authentication emails because tracking systems can rewrite single-use Supabase links.

Do not place SMTP passwords or provider API keys in this repository.

## Validation sequence

1. Run `npm run auth:check` in Codespaces.
2. Request a new password reset from `/forgot-password`.
3. Confirm that the email link returns to the public Codespaces host, not localhost.
4. Complete `/reset-password` and sign in with the new password.
5. Create a new Student account and verify the confirmation link reaches `/auth/confirm` and then onboarding.
6. Repeat signup for Educator and Employer.
7. After deployment, set `NEXT_PUBLIC_SITE_URL=https://workforce.txkpro.com` in the production environment and repeat the reset + signup tests against the production host.

Existing emails are not rewritten after URL configuration changes. Always request a new verification or recovery email when testing a new redirect configuration.
