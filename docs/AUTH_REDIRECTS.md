# TXKPRO Workforce — Supabase Auth Redirects

TXKPRO Workforce now builds email confirmation and password-recovery callbacks from `NEXT_PUBLIC_SITE_URL` when it is set. If that variable is blank in browser development, the current browser origin is used. A localhost value is ignored when the app is actually running on a public host such as GitHub Codespaces.

## Supabase Auth URL Configuration

In Supabase Dashboard, open **Authentication → URL Configuration**.

Set **Site URL** to the production TXKPRO Workforce origin when production is available, for example:

```text
https://workforce.txkpro.com
```

Add these **Redirect URLs** while developing:

```text
http://localhost:3000/**
https://**.app.github.dev/**
```

Also add the exact production origin/path when deployed:

```text
https://workforce.txkpro.com/**
```

The Codespaces wildcard is needed because forwarded-port hostnames change between Codespaces. Production should use an exact host rather than a broad wildcard.

## Email templates

For hosted Supabase Auth, confirmation and recovery email templates must not hard-code `http://localhost:3000`.

For a standard recovery template, `{{ .ConfirmationURL }}` is the safest choice because Supabase includes the validated `redirectTo` destination in that URL.

If you build a custom PKCE link, use `{{ .RedirectTo }}` or a configured production `{{ .SiteURL }}` rather than a localhost value.

## App environment

Set this in production:

```bash
NEXT_PUBLIC_SITE_URL=https://workforce.txkpro.com
```

For GitHub Codespaces, it can remain blank so the current `*.app.github.dev` origin is used automatically.
