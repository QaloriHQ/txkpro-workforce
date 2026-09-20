# TXKPRO Workforce — Supabase Auth Redirects

TXKPRO Workforce builds email confirmation and password-recovery callbacks from the running application origin. In GitHub Codespaces, the current `*.app.github.dev` forwarded-port origin always wins so a stale environment variable cannot send users to `github.com`, a repository URL, or localhost. Outside Codespaces, `NEXT_PUBLIC_SITE_URL` is used when configured.

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

For troubleshooting, you may also temporarily add the exact current Codespaces preview URL, for example:

```text
https://<codespace-name>-3000.app.github.dev/**
```

Do **not** use `https://github.com/...` or a GitHub repository URL as the Site URL, Redirect URL, or `NEXT_PUBLIC_SITE_URL`. Those are source-control pages, not application callback hosts.

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

For GitHub Codespaces, leave it blank. The app intentionally uses the current `*.app.github.dev` origin automatically.

Run `npm run auth:check` inside the Codespace before testing. If it reports a `github.com` origin or a `NEXT_PUBLIC_SITE_URL` containing a repository path, remove that value from `.env.local` and restart the Next.js dev server.
