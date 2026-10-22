# Twilio Email setup — #357

Email uses `https://comms.twilio.com/v1/Emails` with server-side HTTP Basic authentication. Official references: [Mail Send](https://www.twilio.com/docs/email/api/reference/mail-send-resource) and [Operation tracking](https://www.twilio.com/docs/email/api/operations-and-email-tracking).

The owner-provided sample credential was exposed in chat. Rotate that Auth Token in Twilio before activation. Never copy it into a file, PR, issue, command, or environment variable. Use a replacement stored through the hosting provider's secret settings. No exposed value is included in this repository. Configure dedicated email credentials separately from SMS, and verify that the sender domain is approved by Twilio.

Required server-only configuration:

| Variable | Value |
| --- | --- |
| `TWILIO_EMAIL_ENABLED` | `true` only after credential rotation and sender verification |
| `TWILIO_EMAIL_ACCOUNT_SID` | Twilio account SID, stored as a secret |
| `TWILIO_EMAIL_AUTH_TOKEN` | Replacement Auth Token, stored as a secret |
| `TWILIO_EMAIL_FROM_ADDRESS` | `TJ@txkpro.com`, as supplied by the owner |
| `TWILIO_EMAIL_FROM_NAME` | `TJ`, as supplied by the owner |

Keep production and nonproduction credentials/configuration separate. Do not put any of these under `NEXT_PUBLIC_`. The marketing sites are static; putting credentials in their builds does not create a mail backend. Only configure credentials in the server deployment that will execute the transport. Existing Workforce SMS settings are not changed. No fallback email provider is implemented.

`lib/email.ts` is the server-only application entry point. It supplies configuration to the independently tested provider adapter. The transport sends one recipient per request and performs no automatic retry. A timeout, connection failure, malformed acknowledgement or server error can mean a message was accepted without confirmation. Investigate provider activity before retrying. A 202 response is `accepted`, never proof of delivery. Retain the returned operation ID in the owning workflow's durable delivery record and use operation statistics to distinguish sent, delivered, undelivered and failed. A completed operation can include delivery failures. Twilio retains these resources for seven days, so provider history does not replace an application delivery ledger.

Operator commands (Node 24), with secrets injected securely by the execution environment:

```sh
node --experimental-strip-types scripts/twilio-email-check.mjs --check-config
node --experimental-strip-types scripts/twilio-email-check.mjs --send --to '<owner-approved-test-recipient>'
node --experimental-strip-types scripts/twilio-email-check.mjs --status '<returned-operation-id>'
```

The send command sends one real test email; use it only for an explicitly approved recipient. It prints status/operation ID only. The utility never loads secrets from committed files. It follows no provider redirects or arbitrary operation URLs and caps upstream JSON to 32KB with a 10-second timeout.

This change prepares transport and an operator test. It does not activate historical email sequences, bulk campaigns, marketing confirmation messages, the native intake endpoint, or a public send API. Consent, withdrawals, suppression checks, role/scope authorization and a durable once-only delivery claim must live in the owning workflow before automatic sends are connected. Existing Supabase-managed authentication/invitation mail is not rewritten by this marketing transport setup. Configuring that mail to use Twilio requires its own supported auth delivery integration.

Live activation and delivery verification require replacement credentials and approved sender identity. Until those are supplied in secure server settings, missing/disabled configuration fails closed without an upstream send.
