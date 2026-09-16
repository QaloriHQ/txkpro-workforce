# TXKPRO Auth Email Templates

These HTML files are the source-of-truth copies for the hosted TXKPRO™ Supabase Auth email templates used by TXKPRO Workforce.

Hosted Supabase projects do not read these files automatically. Apply them in **Authentication → Emails** (or through the Supabase Management API in a secured deployment workflow).

| Supabase template | Subject | Repository file |
|---|---|---|
| Confirm signup | Confirm your TXKPRO Workforce account | `confirmation.html` |
| Reset password | Reset your TXKPRO Workforce password | `recovery.html` |
| Password changed notification | Your TXKPRO Workforce password was changed | `password-changed.html` |

The confirmation and recovery templates use `{{ .ConfirmationURL }}` so the requesting application's approved `redirectTo` destination remains authoritative. This matters because Marketplace, Workforce, and Ads Manager share one Supabase Auth project but run on separate subdomains.

Do not place SMTP passwords, API keys, or provider secrets in this directory.
