# W12-17 — Educator and staff professional profiles

Owner-approved staging implementation of #56. Depends on W11-01B (Done) and W12-01 (Verification with explicit exception: only owner UAT remains, issue comment 5983218931).

## Ownership and publication

`/professional/profile` lets an active authorized institution member edit their Educator profile, or an active platform super_admin/admin/platform_admin/support/read_only_analyst edit their staff profile. Dual memberships expose separate profiles. Student and Employer roles alone cannot create professional profiles. Every RPC checks the current active account and canonical memberships; editable auth metadata never authorizes access.

Public paths are `/educators/{slug}` and `/staff/{slug}`. The existing global root-slug reservation is preserved. Slug changes retain 308 redirects; reclaiming one's old URL deactivates its redirect. Profile privacy, revoked membership, disabled account, or inactive institution immediately remove both current and historical URLs and sitemap entries. Readers are request-scoped, dynamically rendered, without cross-request caches.

Institution affiliation is derived from active memberships with the existing canonical institution scope/invitation binding. Program labels appear only for exact assigned program/cohort scopes; institution-wide access does not claim every program. Staff affiliation is TXKPRO. Owners cannot write affiliation, ownership, SEO overrides, verification, review status or other arbitrary fields. Direct identity/social table access remains revoked from anon and authenticated, with RLS retained.

## Curated content and privacy

Editable fields: name (100), slug (3–64), headline (160), bio (2000), specialties (1000), and credential descriptions (2000). Specialties/credentials are visibly self-entered claims, distinct from membership verification and authoritative Verified Skills. Fields render as escaped text. SEO and escaped ProfilePage/Person JSON-LD use only currently publishable name, headline, canonical URL and affiliation.

Preferences independently control published reviews, rating summary, posts, and like/comment/share/repost history. Activity also requires the master switch. New profiles are private; activity defaults hidden. Histories include only existing interactions attributed to the profile and its owner on currently published public professional posts whose author profile remains eligible and shows posts. Unsupported source entity types fail closed until their canonical public-post contract exists. Hidden comments and private/removed source content never appear. Histories are bounded to the newest 50 visible entries.

Only moderated `published` reviews appear; aggregates use all published reviews. Private reviewer IDs, moderation metadata and relationship context are excluded. Reviewer names require a currently public professional profile with matching ownership; otherwise “Reviewer”. Review submission/moderation and new social interaction writers are outside this profile-rendering release; their permissions are not invented.

Owner post editing uses existing `draft`, `published`, `hidden`, `removed` states. Removed is terminal. Stable client draft IDs make retries idempotent. Body is plain text (8000), title 160. Public posts require public profile and published/public post. Audits store visibility/path/preferences or post status, never bio/post body. New technical audit labels: `PROFESSIONAL_PUBLIC_PROFILE_CHANGED`, `PROFESSIONAL_POST_CHANGED`. These are publication audits, not competing Workforce lifecycle events. No notification or SMS side effect.

## Verification and owner UAT

Rollback SQL QA: `scripts/sql/w12-17-professional-profile-qa.sql` under real authenticated/service_role/anon roles. Checks roles, ownership, affiliation, input allowlists, privacy, redirects, sitemap, published reviews/ratings, independent activity switches, source revocation, terminal removal and audit idempotency. `node --test scripts/professional-profile-render-qa.mjs` checks actual React SSR escaping and provenance presentation. Required typecheck/lint/build and CI run before merge.

Owner browser UAT on staging:

1. Open My professional profile from Institution navigation or Admin. Edit through the modal, save privately, verify affiliations/programs and claim labels. Support/analyst staff can open `/professional/profile` directly.
2. Publish; open public URL signed out. Check name, bio, claims, affiliation, posts, canonical metadata and shareable URL. Rename slug; verify old URL redirects.
3. Create draft and published posts, edit/hide/remove them. Retry saves; check no duplicate posts. Removed posts cannot be restored.
4. Toggle review, rating, post and every activity visibility preference (where published source fixtures exist). Disable activity master switch. Verify public display follows settings.
5. Make profile private; signed-out current and old URLs must return unavailable. Republish; withdraw membership or disable account and verify unavailable again with an authorized operator.
6. Check mobile/desktop, light/dark, keyboard dialog focus, Escape/close, feedback, empty states and long text. No browser staging tests were run by the agent.

Production remains unchanged. Actual model usage counters are unavailable in this runtime; the run must remain NOT_FULLY_FINALIZED until telemetry is synchronized.
