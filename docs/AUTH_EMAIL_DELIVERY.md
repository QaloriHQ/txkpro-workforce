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


## Workforce invitations

W12-05A sends canonical User Invitation activation through Supabase Auth rather
than emailing a bare authorization link.

- New Auth identities use `auth.admin.inviteUserByEmail`.
- Existing Auth identities use `signInWithOtp` with
  `shouldCreateUser: false`.
- Both flows set their redirect to the Workforce `/auth/confirm` callback,
  which then returns the authenticated recipient to the one-time
  `/activate/<token>` route.
- The application token is stored only as a SHA-256 hash in
  `public.user_invitations`; role and scope remain server-controlled database
  state.
- Email delivery outcome is written to `delivery_status` /
  `delivery_error`. A failed email does not silently convert the invitation
  into an active membership.
- Resend rotates the one-time activation token and sends a new Auth-backed
  email.

Hosted Supabase Invite and Magic Link templates must preserve
`{{ .ConfirmationURL }}` (or an equivalent token-hash server callback) and
must not replace it with a hard-coded application URL. Disable provider link
tracking because Auth links are single-use.

### Invitation validation

1. Invite a new test email from an authorized Institution or Employer team
   surface.
2. Confirm `delivery_status` becomes `sent` and the email returns through
   `/auth/confirm` to `/activate/<token>`.
3. Confirm the invited email activates only the stored role/scope.
4. Resend while pending and confirm the previous activation token no longer
   works.
5. Invite an already-registered test account and confirm the no-create sign-in
   link reaches the same activation route without creating a duplicate Auth
   identity.
6. Revoke a pending invitation and confirm activation is rejected.
7. Verify a user from another Institution/Employer cannot list, resend, revoke,
   or accept the invitation.
