# W12-16 Student public/private profile onboarding and controls

Owner-approved scope (#55, 2026-10-04): explicit Public/Private choice, readable URLs with redirects, Student-owned settings modals, and a minimal public allowlist: display name, headline, bio. #45 messaging health is deferred pending A2P registration; this feature does not require Twilio or send SMS.

## Contracts

`wf_public_pages` owns publication; `wf_student_profiles` owns private Workforce data. Public `visibility` is independent of Employer `discoverability_status` / `profile_visibility`. No Student skills, self-attestations, contact details, private notes, interviews, or retention data are published by this feature. Public text is Student-authored, not verification evidence. SQL returns only the allowlisted fields and canonical URL/robots booleans; SEO uses the same projection. JSON-LD overrides and generic profile sections are excluded.

Public choice maps to `public/published`; Private maps to `private/unpublished`. Existing accounts receive no automatic publication. A Student must choose explicitly before the canonical onboarding RPC completes; completion and publication are atomic. Accepted invitation affiliation logic is preserved. Previously completed Students routed through onboarding/activation are sent to profile privacy setup if they have no public page, without replaying affiliation onboarding.

Authenticated `GET/PUT /api/student/public-profile` delegates to `student_public_profile_settings`. Identity comes from the verified session; SQL requires an active user and active Student self membership matching the owned profile. Client identifiers, role, indexing, and publication fields cannot grant authority. Private definer implementations use an empty search path; public authenticated wrappers are invokers. Legacy completion implementation EXECUTE is revoked, so direct RPC callers cannot skip the choice gate.

`/students/{slug}` reads only curated public/published profiles for active accounts/profiles. Service-only `student_public_profile_read` and `student_public_profile_sitemap` expose no Workforce fields. Native React text escaping prevents HTML execution. Pages and sitemap are dynamic; React cache deduplicates only within one request. Private pages and old-slug redirects return not found; sitemap excludes them immediately. Search engines may take time to remove previously indexed snippets.

Slugs: 3–64 lowercase letters/numbers with single hyphens. Existing public pages and redirect aliases reserve names. Same-Student operations serialize on user row; target-path advisory locks plus unique constraints protect concurrent reservation. Renames preserve 308 redirects and update previous aliases directly to the current path, avoiding loops. Switching back to an owned former slug deactivates that alias. Private slugs remain reserved without revealing the owner.

`STUDENT_PUBLIC_PROFILE_CHANGED` is the dedicated audit action added by this feature. It records actor/Student/page identifiers and before/after visibility/path only. No profile text or private snapshots are logged. Unchanged saves produce no duplicate audit. It is operational audit metadata, not a new placement/retention/readiness state.

Onboarding and settings use the shared native modal: explicit button, Cancel/X, Escape, focus containment/return, preserved drafts, and busy protection. A successful save leaves the dialog open with feedback.

## Verification

Required: typecheck, lint, build, Wave12 QA; `scripts/sql/w12-16-student-public-profile-qa.sql` runs real authenticated/service/anon roles with synthetic fixtures and rolls back. Tests cover explicit choice, ownership, role denial, legacy helper denial, safe exact projection, uniqueness, redirects, Employer discovery independence, private removal, sitemap, disabled accounts, and audit idempotency. Existing invitation SQL QA includes an explicit Private choice and validates canonical affiliation.

## Owner UAT

1. New authenticated Student: open Continue onboarding; try finishing without a choice. Choose Private, display name and unused slug; finish. Public URL must be unavailable and absent from sitemap.
2. New invited Student: accept an owner-controlled test invitation; complete the same choice flow. Confirm Institution/Program/Cohort still match the invitation.
3. Existing invited/onboarded Student with no public page: activation/onboarding handoff opens privacy setup; save a choice without replacing affiliation or Employer discovery.
4. From Student Profile, open Edit profile and privacy; choose Public and save. Logged-out public page shows only display name/headline/bio. Inspect its title/canonical/robots and sitemap entry.
5. Rename slug; old URL redirects. Switch Private; both URLs become unavailable and sitemap entry disappears. Republish and test redirects, including changing back to a former slug.
6. Try another account's slug, malformed URL, and HTML-looking text. Confirm clear validation, no account details in errors, and escaped text.
7. Test narrow/mobile and desktop, light/dark, keyboard focus, Escape, Cancel/X, busy controls, draft preservation, and persistent success/error feedback.

Record UAT on #55; use Verification until it passes. Production remains separately authorized.
