# MGID publisher REST connectivity (staging only)

This diagnostic checks whether the configured `MGID_CLIENT_API_ID` and
`MGID_CLIENT_API_TOKEN` are accepted by the **MGID publisher reporting REST API**, then, only for publisher 401/403, checks the read-only MGID Ads advertiser API to distinguish account type.
It does not enable auction bidding, request live ad creatives, or prove that MGID
supports publisher-initiated OpenRTB bidding.

## Authoritative endpoint

`GET https://api.mgid.com/v2/pub/account/{clientId}/website-custom-report`

With `dateInterval=yesterday&dimensions=date,website&metrics=pageViews&limit=1`.

Reference: https://help.mgid.com/api-publishers

Account-type diagnostic fallback (only after publisher HTTP 401/403):
`GET https://api.mgid.com/v1/clients/{clientId}`

Reference: https://help.mgid.com/api-advertisers
This endpoint may return account wallet data, which the server never exposes to
the browser, logs, or test output.

## Scope and security

- Route: `POST /api/admin/integrations/mgid/test`
- UI: `/admin/integrations/mgid`, linked from platform admin landing page.
- Accessible only in the `staging` Git branch deployed as a Vercel `preview`.
- Requires an active platform-scoped `super_admin` Supabase membership.
- Requires a same-origin browser POST. No public GET diagnostic.
- Tokens read only from server-side Vercel environment variables.
- Both requests are read-only; they cannot mutate MGID account configuration.
- The response includes fixed per-API outcome codes and optionally upstream HTTP statuses.
  It never includes credentials, report rows, account IDs, upstream errors or revenue.
- Upstream timeout is 4000ms, separate from the proposed 250ms ad-auction timeout.
- There are no database migrations and no modifications to the existing native
  ad delivery, tracking, reporting, or billing systems.

## Staging UAT

1. Open `https://staging-workforce.txkpro.com/admin` as a platform super administrator.
2. Choose **MGID publisher API**.
3. Click **Test MGID connection**.
4. `authenticated` confirms only REST report endpoint authorization.
5. Publisher `authentication_rejected` (401) means the publisher API did not accept the token for this account. If the advertiser API succeeds, the credentials work for MGID Ads but not the publisher reporting API. If both reject, the token, client ID, or permissions must be checked with MGID.
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
