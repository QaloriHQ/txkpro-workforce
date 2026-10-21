# TXKPRO marketing sites — #357

Two independent static marketing deployments, maintained in the existing Workforce repository. The authenticated Workforce application, Marketplace application at app.txkpro.com, Supabase projects, ads delivery, and their Vercel project configuration are outside this change.

## Build and integrity checks

```sh
node marketing/build.mjs
node marketing/check.mjs
```

No dependencies are required for the marketing build. Source is `shared/content.mjs`, `shared/site.css`, `shared/site.js`, the existing official repository logos, and preserved legal text. `marketplace/dist` and `workforce/dist` are generated and ignored. Root CI runs the marketing checks alongside the established application checks.

| Site | Intended domain | Vercel project | Root directory |
| --- | --- | --- | --- |
| Marketplace | https://txkpro.com | txkpro-marketplace-marketing | marketing/marketplace |
| Workforce marketing | https://workforce.txkpro.com | txkpro-workforce-marketing | marketing/workforce |

Vercel settings: framework Other/null, Node 24, build `node ../build.mjs marketplace` or `node ../build.mjs workforce`, output `dist`, install `echo marketing-build-has-no-dependencies`, include source files outside root enabled. Each root has `vercel.json` with clean URLs, permanent redirects, content security policy, and explicit text file content types. Do not point either marketing project at the Workforce application output. Projects are Git-linked to QaloriHQ/txkpro-workforce. Preview builds use the approved feature/staging commit. No secrets are required.

## Content and route migration

Reference pages were retrieved on 2026-10-21. Marketplace Google Sites exposes embedded HTML through `data-code`; Workforce embeds its public Apps Script research application. Workforce visual reference: off-white 28px grid, black headings, #1173D4 accent, system/Inter typography, rounded cards, generous spacing. This rebuild uses official existing logo variants and official Heroicons paths (MIT notice in assets).

Marketplace revised messaging preserves the connected property → request → estimate → job → completion concept. Main actions lead to https://app.txkpro.com, as explicitly requested. No MGID integration is added to that app. No invented live contractor listings, ratings, testimonials, service coverage, or performance metrics are shown. Workflow visuals are explicitly illustrative. Homeowner platform access remains free; service costs are separate.

| Existing path | Result |
| --- | --- |
| /, /home | Homepage; /home permanently redirects to / |
| /how-it-works | Rebuilt process page |
| /about, /about-us | Rebuilt About; /about-us redirects to /about |
| /faqs | Rebuilt FAQs |
| /directory | Service discovery with honest examples and app link; no invented live inventory |
| /contractors | Rebuilt contractor participation guide |
| /homeowners | New working homeowner page; old URL returned 404 |
| /contact | Rebuilt help/contact page using existing hello@txkpro.com and Help Center |
| /txk-home-network | Rebuilt local network page |
| /team | New working credits page; old URL returned 404 |
| /service-request | Redirect to homeowner page, with app CTA |
| /login, /login-signup | Redirect to app.txkpro.com |
| /ads-txt | Redirect to the actual /ads.txt file |
| /privacy, /terms | Preserved currently published policy text and dates; approved entity attribution added |
| /privacy-policy, /terms-of-service | Redirect to /privacy and /terms |

Workforce retains its development/pilot framing, learner/employer/partner audiences, Learn/Document/Connect/Grow pathway, and distinct evidence provenance. /workforce and /home redirect to /. Additional standalone pages: /how-it-works, /students, /employers, /partners, /about, /participate, /faqs, /privacy, /terms. Existing homepage section anchors remain supported: #about, #how-it-works, #students, #employers, #partners, #updates, #survey, #booking. Updates/research anchors lead to participation navigation without processing personalized tokens in this marketing site.

### Research continuity

The existing public Apps Script research page remains authoritative for update signup/consent, role-based survey, interview availability/booking, and personalized links. `/participate` embeds that application and provides a direct fallback link. It uses its existing backend and storage. No replacement form backend, new account provisioning, or migration of participant/consent data occurs. The marketing site must not copy `google.script.run` into a Vercel page. Existing personalized Apps Script links continue unchanged and are excluded from sitemap/llms content. User-owned UAT must verify embedded and direct flows without creating duplicate real submissions. The third-party research page retains its own theme and layout.

Workforce marketing creates no accounts. Program participation is not authentication or a promise of pilot access. There is no unverified production Workforce app URL introduced for sign-in. Marketplace uses app.txkpro.com only.

### Legal review

`shared/privacy.txt` and `shared/terms.txt` preserve the source policy text, without the Google Sites navigation/footer. Page attribution is Qalori, LLC dba TXKPRO, as already required by #199. Dates and legal substance are not rewritten. The source Terms explicitly describe themselves as a general operating draft with unresolved governing-law text. Owner legal acceptance remains necessary before cutover; these previews do not close #199 or certify carrier/legal compliance.

## Discovery and indexing

Both sites serve `/ads.txt` with exactly the 20 owner-supplied seller lines from `public/ads.txt`, including MGID seller 997582 and both supplied Google records. No feed/reporting IDs are substituted. There are no live ads on either marketing site.

`/llms.txt` is a public factual guide, not a private-data export or a guarantee of AI indexing. `/sitemap.xml` includes canonical public pages only. `/robots.txt` disallows all crawling unless **both** `VERCEL_ENV=production` and `MARKETING_PRODUCTION_INDEXING=true`. Page metadata follows the same gate. Preview protection remains enabled, and Vercel preview robots protection is additional. No token, account record, participant ID, or private application URL is included in discovery files.

Root-domain MGID detection remains unresolved until the accepted build is publicly serving **https://txkpro.com/ads.txt** after a separately authorized DNS/domain cutover. A protected preview does not satisfy MGID. Subdomain marketing files do not replace the apex file.

## Manual acceptance

1. Review each preview on desktop and phone, including both color themes. Confirm branding, copy, card wrapping, and no horizontal overflow.
2. Use keyboard navigation: skip link, primary navigation, mobile menu, theme button, FAQ details. Check visible focus and Escape returning focus from the mobile menu.
3. Marketplace: homepage CTA opens app.txkpro.com. Review homeowner/contractor/how-it-works/network/help pages, legal pages, and legacy redirects.
4. Workforce: review student/employer/partner pages and development language. Open participation; verify research iframe and fallback load. Review update consent, survey, and interview availability in the existing tool; coordinate any actual submission/booking with owner.
5. Review legal source text and entity attribution; resolve the existing draft Terms before public cutover.
6. Inspect /ads.txt (plain text, 20 exact lines), /llms.txt, /sitemap.xml, and /robots.txt. Previews must remain noindex/disallow. Review sitemap canonical destinations as intended production domains.

Browser staging QA is owner-owned under standing instruction. Agent checks are build/static/HTTP only.

## Cutover and rollback — separate owner authorization

1. Accept the exact preview commit, messaging, research continuity, and legal wording. Confirm the two marketing project IDs and source directories.
2. Export authoritative DNS records and current Google Sites/Squarespace forwarding configuration. Keep both Google Sites and Apps Script active. Capture previous apex A/AAAA, www CNAME/forwarding, and workforce CNAME. Preserve MX, SPF, DKIM, DMARC, verification TXT, app, staging-workforce, and other unrelated records.
3. Select the accepted marketing commit as each marketing project's production release. Enable `MARKETING_PRODUCTION_INDEXING=true` only for production, then rebuild the exact reviewed source in production. Confirm generated robots/sitemaps/canonicals. Do not promote the Workforce application or modify its environment.
4. Attach txkpro.com and www.txkpro.com to Marketplace marketing (www redirects to apex) and workforce.txkpro.com to Workforce marketing. Obtain exact DNS values from Vercel for these project/domain assignments; do not hard-code guessed targets.
5. Change only the required web DNS/forwarding records during the agreed window. Follow Vercel verification and certificate readiness.
6. Verify unauthenticated HTTP 200 and text/plain at root /ads.txt; compare exact seller contents. Verify both domains, www redirect, legacy routes, custom 404, /llms.txt, /sitemap.xml, /robots.txt, canonicals, security headers, app links, and research flows. Confirm no Vercel sign-in wall on live marketing domains.
7. Recheck MGID crawl status after root accessibility is verified. Submit production sitemaps through the owner's search tooling if desired.
8. If cutover fails, restore the captured web DNS/forwarding records and keep the Google Sites websites active. For code-only regression, restore the previous accepted marketing deployment. Do not touch Marketplace/Workforce app databases or research participant data.

Evidence remains on #357. Project preflight is task-scoped WAIVED (missing PROJECTS_TOKEN), not PASS; live Project status and native model actual cost/tokens are not inferred. No production cutover is included in implementation/preview completion.
