# ADS-04 — MGID native JSON delivery

Owner approved MGID, required request data sharing and category exclusions in the implementation session following the approval email from Vitaliy. The task-scoped Project-access exception is recorded on issue #278: Project/task-context/preflight checks are WAIVED/UNAVAILABLE because PROJECTS_TOKEN is unavailable, never PASS. Other checks and production boundaries remain intact. The normal Cline executor is not available in this environment; owner explicitly requested direct implementation.

## Contract

- Direct approved inventory wins. Only a successful canonical selector result with `reason=no_fill` can trigger MGID. Invalid/private context and database failures cannot.
- Public feed (`/community`, `/student/community`) and published public post/article contexts only. No private groups/messages, screening, hiring, institution, assessment, profile, funding or safety surfaces. The canonical selector validates content before network fallback. Only same-origin allowlisted path is forwarded; query and fragment are removed.
- Fixed endpoint `https://api-wa.mgid.com/2099644`, real-time/no-store, `cn=1`, `src_id=txkpro.com:<placement>`, URL-encoded real IP and UA, language and page Referer. IP comes only from the Vercel-overwritten `x-vercel-forwarded-for` header; unavailable trusted identity means no fill. Never synthesize a visitor IP or use an arbitrary X-Forwarded-For chain.
- Feed token and rotating reporting token are separate, server-only secrets. Reporting client API ID is 879009; website ID is 1116569 and is not interpolated into the v2 account report path.
- Request budget: 2.5-second timeout, 64 KiB streamed maximum, fixed HTTPS media/click host allowlists, no redirects, bounded text and strict shape checks. Unknown hosts fail closed pending evidence from MGID. No response body, visitor data, error text or URL logging. Fixed outcome codes and HTTP status may be logged for operations.
- `icon` is discarded. MGID states it is optional for JSON feeds. No optional pixel is invoked, preventing duplicate widget tracking.
- Existing Sponsored disclosure, hide/report and native click URL rendering. Separate provider marker prevents writing MGID telemetry into direct campaign funding/budget records. No PRO Points.
- Served, viewable and clicked events deduplicate by delivery/event type. Random delivery token authorizes measurement; it conveys no user/account access. Same-origin events/reports; reports additionally require active canonical community identity. Reports use canonical moderation cases, evidence and audit. No new domain lifecycle statuses.
- Durable request reservations serialize a daily HMAC of visitor IP (10 attempts/minute); raw IP and UA are never persisted. One reservation per random request ID. Reservation performs bounded cleanup of up to 100 external deliveries older than 30 days per request; associated events cascade and moderation snapshots remain preserved. Daily fingerprints are for abuse control, not audience targeting.
- Admin-only staging status displays configuration gates and last-24-hour TXKPRO counts. These are not provider-verified billable impressions or revenue. Reporting authentication remains independently testable.

## Configuration and release

Staging branch of Vercel project `txkpro-workforce`; Supabase staging `qwxlgzlkaeaqfzjodtis`. Production database and production release are not authorized.

| Variable | Meaning |
| --- | --- |
| `ADS_DELIVERY_ENABLED` | Existing overall delivery switch |
| `MGID_FEED_TOKEN` | Secret from approved feed; never reporting credential |
| `MGID_NATIVE_ENABLED` | Explicit native-feed switch |
| `MGID_FILTERS_CONFIRMED` | Set true only after MGID confirms approved exclusions are applied |
| `MGID_EXCLUDED_CATEGORY_IDS` | Optional comma-separated exact numeric IDs, defense in depth; never guessed |
| `MGID_PRODUCTION_AUTHORIZED` | Separate production release gate; default false |
| `MGID_CLIENT_API_ID` | 879009 for publisher reporting |
| `MGID_CLIENT_API_TOKEN` | Existing rotating publisher reporting credential |

Apply the additive ADS-04 migration to staging before deploying. No applied migration is rewritten. Rollback: disable MGID_NATIVE_ENABLED; direct delivery continues unchanged. Keep filters confirmation false until provider evidence exists. No synthetic feed requests/pixel calls for smoke testing; validate real supply via owner browsing after filters are confirmed. Test credentials were not supplied by MGID; no sandbox capability is claimed.

## Exclusions for Vitaliy to confirm

The supplied sheet was retrieved as CSV. It contains labels and hierarchy but **no numeric category IDs**. Approved policy:

- Adult/dating: Product promotions → Family and Relationships → Dating; Pick up; plus adult/explicit content across the feed.
- Gambling: Events and Attractions → Betting; Casinos; Lottery.
- Weapons: weapons and weapon-related content, including Consumer Electronics → Self Defense where weapon-related.
- Sensational health claims: misleading/miracle treatment, cure, supplement and weight-loss claims across Healthy Living/Medical Health.
- Get-rich-quick: misleading easy-income/investment claims across Business and Investing/Personal Finance.

The last three policies do not map exactly to the sheet's broad labels. MGID must confirm how it applies claim/content exclusions and provide exact IDs when available. Do not blanket-exclude all legitimate health, finance or self-defense content without owner approval. No email or spreadsheet modification is sent automatically.

## Verification and owner UAT

Run MGID feed, database and publisher QA, native delivery/analytics regressions, typecheck, lint and build. Database QA includes replay/rate-limit checks, revoked client grants, invalid identity/token reports, report deduplication and event idempotency. Inspect staging migration ledger/RLS/grants and advisors. CI required before staging merge.

Owner manual UAT after filters confirmed: public feed and article with direct no-fill; clearly Sponsored responsive card; actual MGID click URL; hide; signed-in report appears in moderation; 50%-visible-for-one-second viewable event only once; refresh is a new real-time request; direct inventory retains priority; no external ad on private/sensitive pages; global/provider kill switches; 24-hour admin counts. No browser staging automation is performed.

Remaining activation dependencies: MGID confirms filters; actual live-visitor supply/host shapes; reporting token validity; owner visual/signed-in UAT; provider payout/account terms confirmed by owner; separate production authorization. Do not close ADS-04 or claim production released while these remain.

Usage telemetry start was attempted with scripts/txkpro-agent-usage.mjs and failed because gh is unavailable. Native model token/cost telemetry is unavailable; no estimates are substituted for actuals. Issue records disclose this limitation.

Staging migration ledger: 20261021001853_ads_04_mgid_native_feed. SQL confirms both tables have RLS and deny anon/authenticated SELECT; reserve denies anon/authenticated EXECUTE and report denies anon EXECUTE. Advisor delta: two informational RLS/no-policy findings are intentional for service-only tables; one authenticated SECURITY DEFINER finding is intentional for the active-actor-and-token-checked report function, matching the canonical moderation RPC pattern. Guidance: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable. Existing unrelated advisories are unchanged.

## Confirmed exclusions and three-item list policy (owner approved 2026-10-20)

Owner confirms Vitaliy applied exclusions. Staging MGID_FILTERS_CONFIRMED is now true; production gate remains false. No numeric IDs are guessed. Native requests occur only during real visitor viewing of eligible lists; deterministic previews never call MGID.

Every SponsoredPlacement now requires itemCount >= 3. Feeds and event/poll/article galleries insert one unit after the third visible organic item. Search/filter results below three unmount the unit; feed rail requires three feed items; comments require three displayed comments. Single article/post bodies never qualify alone. Related public articles form their own list; /articles provides a searchable public article gallery. Poll answer choices are not organic list items.

Delivery API requires itemCount, listKind (posts/events/polls/articles/comments), and exactly three distinct bounded listIds in addition to placement/requestKey and optional contentId. Before any direct selection or provider request, server checks the canonical anonymous projection of all three records, expected content kind, active/public group context, or comments belonging to the specified public parent. Client counts cannot authorize private data. Only coarse allowlisted /events, /polls, /articles, /community, /student/community and validated public post paths are shared with MGID. Queries and IDs from list-context checks are never forwarded to the provider. No new schema/status/event model.

### Review locations

- /student/community: sample posts/articles/events/polls in the mixed feed; ad after third item; sidebar ad requires three items. Open sample comments to see a three-comment placement.
- /events and /polls: Student searchable galleries, with three clearly labeled samples each.
- /articles: four sample article cards; search down to two or fewer to verify ad removal.
- /community/posts/POST-ADS04-SAMPLE-ARTICLE-1: sample article with three comments and three related sample articles. Each qualifying list has its own unit; article text alone has none.
- /admin/ads/preview: presentation-only sample lists for all six surfaces, 0/1/2/3/6-item selector, local sample creative, no real telemetry or budgets. Hide control works; change count to reset previews.

### Staging fixtures

Executed only on qwxlgzlkaeaqfzjodtis, following successful rollback dry-run: supabase/staging/fixtures/ads04-sample-lists.sql. Uses existing Demo Student/public page, 3 posts + 4 articles + 3 events + 3 polls, each with 3 comments. No real user impersonation, Auth account creation, fabricated reactions/RSVPs/votes, or production seeding. content_origin=organization prevents PRO Points; robots_index=false prevents sample indexing. Event descriptions explicitly say no real event is scheduled. Stable ADS04-SAMPLE keys make content inserts idempotent. New items use canonical published/open statuses and standard moderation behavior.

Cleanup, if requested: remove only wf_profile_posts rows with profile_post_id beginning POST-ADS04-SAMPLE-, author_user_id=USR-DEMO-STUDENT, and content_origin=organization; linked sample comments/event/poll rows cascade. Do not delete or change the existing demo identity/profile. This fixture is outside migration directories and never runs automatically on production.

Verification includes actual React server rendering at 0/1/2/3/6 items, positive and negative server list-context checks, private-group rejection and API selector/provider non-invocation below threshold. Owner performs browser/visual UAT. Current Project exception and unavailable usage telemetry remain disclosed on #278.

## Native list presentation refinement (owner approved 2026-10-20)

All direct and normalized MGID creatives share NativeAdPresentation. A permanent, high-contrast Sponsored pill accompanies advertiser identity in every format, independent of provider or image presence. Layout derives from placement plus listKind: community-post feed card; student-discovery-card for events/polls/articles; community-card for rail; community-comment with sponsor icon and a 72px (56px small-screen) image thumbnail for comments. No fake member timestamp, likes, vote options, RSVP totals, replies or endorsements are fabricated to mimic organic activity.

Provider images remain validated upstream and are rendered in all six formats, with cover media for gallery/feed/rail and compact media for comments. Missing creatives remain valid text cards (direct inventory); broken images are hidden. MGID JSON normalization, click links, optional icon suppression, event/report tokens, budgets, public-context checks and three-item threshold are unchanged. Comment ads are inserted inline after the third comment on public and signed-in comment lists.

/admin/ads/preview includes With images / Text only controls and list-native organic sample cards. Organic preview images use a neutral local illustration; sponsored previews use a separate labeled sponsor creative. No network inventory/measurement calls occur in preview mode; preview CTA navigation is suppressed. Owner performs desktop/mobile/theme/keyboard visual UAT. Rendered tests cover badge, parent classes, images/no-images and compact comment structure for each format, plus normalized MGID creative presentation without fabricated member actions or tracking pixels. No schema or fixture changes, no production release.

### Student staging review (ADS-04 follow-up)

The `/admin/ads/preview` route remains Admin-only. Student testers use their normal `/student/community` and `/student` workspace instead. On the staging branch's preview environment, active canonical Student accounts receive an **Ad display** control on these pages and on Events, Polls, Articles and public post/comment pages. Default is **Live inventory**; **Sample text only** and **Live inventory** are explicit alternatives. The shared root provider preserves the choice during normal client navigation. A reload starts a fresh live request for every eligible list. No localStorage or query parameter can enable it for production or another role.

Sample mode uses the actual list placements, native styles and three-item threshold. It performs no delivery, event, report or provider requests. Sample links are inert, Report is disabled, and both Sponsored and Preview disclosures remain visible. Live mode retains existing independent activation, public-list authorization, no-fill and tracking rules. No inventory is guaranteed.

The Student workspace includes a staging-only public Community articles list using the canonical anonymous projection. Its three public item IDs are validated before live ad selection. Private interviews, skills, points, training and placement data are never used as ad context; MGID receives the public `/articles` URL rather than the private workspace URL. No other private workspace path is permitted. No new schema, fixtures or production rollout.

Owner UAT: sign in as an active Student, visit Community and Workspace, find the Sponsored/Preview pill after the third visible item, switch image/text/live, open sample post comments, and filter a list below three items to confirm no ad. Review Events/Polls/Articles on mobile/desktop, both themes and keyboard. Admin preview is optional and requires Admin access.

### Live session delivery correction (2026-10-21)

Owner reports no live ads and requires requests in every Student session. Active Student staging review now defaults to Live inventory, with image/text samples explicitly selectable. Each eligible list mount requests fresh inventory immediately with cache:no-store and a fresh request UUID; no viewport event or cross-session cache gates inventory loading. The >=3 visible items, server public context, direct-first fallback, rate limits and production authorization remain. The viewport observer still gates real viewable measurement, never inventory. Explicit sample mode remains provider-free.

A valid JSON feed is parsed independent of its MIME label while retaining the 64 KiB limit, exact one-creative shape and safe URL/category/text checks. JSON parsing does not execute upstream content; HTML and malformed payloads still fail closed. Fixed server outcome codes distinguish empty, HTTP error/status, timeout/network error, invalid response/creative, excluded category, unsafe URL, rate/reservation rejection and storage failures. No raw response, request URL, IP, UA, token, arbitrary error message or user ID is logged. Staging live no-fill shows a brief unavailable message instead of silently disappearing.

Before correction, staging recorded 33 reservations and zero accepted creatives in 24h. These prove attempted delivery, not billable impressions or successful upstream responses. Historical failure cause is unknown because previous code discarded diagnostics. Real visitor results after deployment must establish actual provider supply/failure; no synthetic visitor/IP/pixel requests are used. Reporting credentials are independent. No migrations or production changes.

### Creative normalization correction (2026-10-21)

Real Student visits on the session-fix deployment produced five `invalid_creative` outcomes: the feed was not empty, but display normalization rejected its entries. The old code required a narrowly formatted creative ID and numeric category before checking the actual title/image/link. Those are provider metadata, not authorization or rendering fields. Missing/unusable IDs and categories now remain null; bounded non-numeric category labels and bounded IDs are preserved without inventing values. The existing nullable database fields and snapshot projection need no migration.

Required title/description bounds and validated HTTPS image/click hosts remain. Mandatory MGID-side filter confirmation is unchanged. When an explicit local numeric exclusion list is configured, missing/non-numeric categories still fail closed, and listed categories are rejected. No invalid/private context or sub-three-item list reaches MGID. Diagnostics add only a whitelisted field name (record/title/description/category) for rejected creatives, never raw fields or responses. Real-visitor accepted delivery still requires verification after deployment; historical logs do not reveal the exact rejected field.

### Provider URL correction after owner UAT (2026-10-21)

Owner retry on #352 progressed from invalid_creative to unsafe_url. MGID's official [request/response examples](https://help.mgid.com/examples-of-requests-and-responses) include the HTTPS image proxy `imggprx.mgid.com` and legacy HTTP `imgg-cdn.mgid.com` assets. The exact media allowlist now includes that proxy alongside the existing CDN. URLs on reviewed provider hosts may be upgraded from HTTP to HTTPS; path/query are preserved, credentials/ports/other schemes and unrelated/lookalike hosts remain denied. No wildcard trust or upstream redirects are introduced.

URL rejection diagnostics identify click_url/image_url and may include only a bounded DNS hostname from the provider's returned creative URL. The logger excludes IP literals and never logs full URLs, paths, queries, credentials, response bodies or visitor data. This public ad-provider metadata supports explicit review of any additional host without allowing unknown domains blindly. Actual accepted delivery remains an owner-UAT gate.
