# Public Employer Learning — W11-04B

Employer Owners/Admins manage publication from Course Overview → **Manage public pages**. The form opens in the shared accessible modal. Publication settings are separate from course-version lifecycle and do not make a draft version live.

1. Choose the Employer slug on first use and explicitly approve publication of the Employer Learning page displaying the business name. The shared Employer slug remains stable.
2. Choose the course slug, public visibility, optional search indexing, SEO title and description.
3. Choose which ready/published lessons to publish, their slugs and indexing settings.
4. Save. An unpublished/private course can be configured before going live; public publication requires the canonical current version to be live.

Canonical paths:

- Employer: `/employers/{employerSlug}`
- Course: `/employers/{employerSlug}/courses/{courseSlug}`
- Lesson: `/employers/{employerSlug}/courses/{courseSlug}/lessons/{lessonSlug}`

Public pages are dynamically server-rendered with canonical metadata, Open Graph, Twitter metadata and allowlisted Schema.org data. Indexing is opt-in. Only visible, indexable courses/lessons appear in the dynamic sitemap. A noindex course also prevents its lessons from being indexed. Robots allows the public `/employers` hierarchy; private `/employer` and API paths remain disallowed.

Every request checks public/published page state, correct parent hierarchy, active course, live canonical version, approved active Employer and ready/published lesson state. Historical URLs return permanent 308 redirects only while their target remains public. Course renames cascade to all registered lesson URLs; earlier aliases point directly to the latest canonical path, including slug reversion. Conflicting slugs and reserved aliases are rejected transactionally. Stale course-version submissions require refresh. Repeating unchanged settings does not duplicate publication events.

Public output includes explicitly published course/lesson titles, descriptions, learning objectives, duration, version and textual lesson blocks. Rich text is rendered as plain text. Private media URLs, uploaded assets, embeds, arbitrary block/config JSON, assessments/answer keys, assignments, completion records, student contacts and private employer workflow data are excluded. Public browsing never records learning completion or grants access to assigned training. Publication is not Verified Skills evidence.

Authenticated publication uses `public.employer_learning_public_settings`, a security-invoker wrapper around the guarded private-schema function. The database validates canonical active Employer Owner/Admin or TXKPRO platform-admin authority; recruiters, read-only users, other Employers and forged user metadata cannot publish. Platform admins can use the authenticated API without an Employer membership. Anonymous clients cannot call the service-only public read/sitemap RPCs or access the registry tables directly. Public reads use the server-only admin client and explicit field projections. No private-table grants are added.

Migration: `supabase/staging/migrations/20261004034003_workforce_public_course_lesson_urls.sql`. The Supabase connector recorded version `20261004034003`; the CLI-created filename was aligned with that ledger version after application, preserving the exact applied SQL. Additive functions only; no existing data is published by the migration. Rollback application code if needed; leave functions in place or apply a reviewed forward fix. No production migration/deployment is included.

Verification:

- `node --test scripts/wave11-public-learning-qa.mjs` (also included in `npm run wave11:qa`).
- `scripts/sql/w11-04b-public-learning-qa.sql`: staging-only synthetic fixtures, all rolled back; publication roles, private-data projection, lifecycle gates, explicit Employer publication consent, idempotency, stale versions, canonical URLs, noindex/sitemap, aliases and slug reversion.
- `npm run typecheck`, `npm run lint`, `npm run build`.

Owner UAT on staging:

1. As Employer Owner/Admin, open a live course and launch **Manage public pages**. Confirm cancel/Escape/focus return, labels, success/error feedback and phone/light/dark layouts.
2. Publish the Employer page, course and a ready/published lesson. Open the displayed URL signed out and inspect the course, lesson and Employer links.
3. Rename course and lesson slugs; confirm old links redirect permanently to the latest page.
4. Turn off search indexing; inspect robots metadata and sitemap exclusion. Make the course private and confirm current and historical lesson/course URLs are unavailable.
5. Confirm recruiters/read-only users have no publishing controls, draft/archived lessons cannot publish, and public browsing does not change assignment/completion state.

Browser UAT remains owner-run; this task stays in Verification until reported acceptance passes.
