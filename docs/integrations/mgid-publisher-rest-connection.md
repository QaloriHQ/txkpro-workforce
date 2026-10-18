# MGID publisher REST connectivity (staging only)

This feature confirms that the configured `MGID_CLIENT_API_ID` and
`MGID_CLIENT_API_TOKEN` are accepted by the **MGID publisher reporting REST API**.
It does not enable auction bidding, request live ad creatives, or prove that MGID
supports publisher-initiated OpenRTB bidding.

## Authoritative endpoint

`GET https://api.mgid.com/v2/pub/account/{clientId}/website-custom-report`

With `dateInterval=yesterday&dimensions=date,website&metrics=pageViews&limit=1`.

Reference: https://help.mgid.com/api-publishers

## Scope and security

- Route: `POST /api/admin/integrations/mgid/test`
- UI: `/admin/integrations/mgid`, linked from platform admin landing page.
- Accessible only in the `staging` Git branch deployed as a Vercel `preview`.
- Requires an active platform-scoped `super_admin` Supabase membership.
- Requires a same-origin browser POST. No public GET diagnostic.
- Tokens read only from server-side Vercel environment variables.
- The request is read-only; it cannot mutate MGID account configuration.
- The response includes a fixed outcome code and optionally an upstream HTTP status.
  It never includes credentials, report rows, account IDs, upstream errors or revenue.
- Upstream timeout is 4000ms, separate from the proposed 250ms ad-auction timeout.
- There are no database migrations and no modifications to the existing native
  ad delivery, tracking, reporting, or billing systems.

## Staging UAT

1. Open `https://staging-workforce.txkpro.com/admin` as a platform super administrator.
2. Choose **MGID publisher API**.
3. Click **Test MGID connection**.
4. `authenticated` confirms only REST report endpoint authorization.
5. `authentication_rejected` (401) means invalid REST API credentials.
6. `permission_denied` (403) means account lacks the publisher endpoint permission.
7. `invalid_report_request` (422) means report parameters or client ID must be
   reconciled against MGID's assigned publisher documentation.
8. Do not share credentials or raw upstream responses in support tickets.

**Important:** OpenRTB S2S, native creative assets, domain/placement onboarding,
impression tracking and billing remain awaiting MGID's written confirmation.
The existing TXKPRO ad system continues unchanged.

## Verification command

`node --experimental-strip-types --test scripts/mgid-publisher-api-qa.mjs`

References:
- https://help.mgid.com/api-publishers
- https://help.mgid.com/openrtb-dsp-integration-guide
