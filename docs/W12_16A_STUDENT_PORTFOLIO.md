# W12-16A — Mobile Student workspace and digital portfolio

Owner approval: active chat 2026-10-04; implementation approval persists. Owner-provided task-context/preflight #223: Planned, automated Definition of Ready PASS; W12-16 proceeds with valid Verification evidence and user-owned UAT exception. Read-only confirmation/plan and usage record: issue #223.

## Delivered contract

- `/student`: focused career home with learning, interviews and portfolio shortcuts. `/student/opportunities` preserves the prior interviews/placements workflow and response forms. Existing Student training and profile URLs remain.
- Five primary destinations: Home, Learn, Opportunities, Portfolio, Profile. Mobile navigation is one fixed row with safe-area clearance; desktop keeps the existing navigation treatment.
- `/student/portfolio`: button-accessible modals for appearance/sharing, project create/edit/remove, upload and per-file manage/remove. Native dialogs retain edit drafts across Cancel/Escape; successful create/upload clears its form and retains a success message.
- `/student/profile`: existing ownership/slug/privacy and canonical evidence plus portfolio entry point.
- `/students/{slug}`: dynamic curated digital resume. Display name/headline/bio remain Student-selected. Optional cover/photo, public projects, documents and separately labeled canonical evidence. No phone/email/contact/readiness/interviews/private notes/assessment data are projected.
- Instructor Verified Skills, completed Employer Training, Company Badges and Employer Certifications remain separate canonical read models. Live status/expiration/revocation is retained; no copying into editable portfolio claims. Project text is Student-entered; uploaded certificates are Student-uploaded.
- Public evidence sections opt-in. New uploads/projects private. A selected cover/photo/project image also requires Public file access before public rendering. Sharing a file explicitly exposes its contents, which may contain contact information; UI asks Students to review documents first.
- Files: JPEG/PNG/WebP/PDF/plain text only; actual streamed request byte limit; MIME magic checks; 10 MB each, 40 files and 200 MB total per Student. Unsafe SVG/HTML types rejected. Upload server uses private Storage objects, verifies actual object metadata at registration, cleans failed registrations. No public Storage URLs or persistent signed URLs. Private file delivery is a server stream with no-store/nosniff/CSP sandbox. Next Image is explicitly unoptimized to prevent image optimizer caching sensitive media.
- Per-file access: private = owner; public = anyone only while profile is published and Student/user active; employer = canonical approved Employer talent role/scope plus Student discoverability consent. Hiring Managers must use an assigned Hiring Need; candidate list/download forwards that context. Authorized candidate pages display Student-shared documents. Changing profile visibility hides public files immediately. Changing file access/deleting metadata revokes subsequent fetches. Already downloaded copies cannot be recalled.
- Default ranking scope Cohort; Institution/TXKPRO selectable, sharing preference saved. No fabricated points/levels/streaks/ranks. Actual progression and all-rank modal depend on #224. Rewards remain #225 scaffolding / #226 deferred activation.

## Technical changes and invariants

New additive tables: `wf_student_portfolio_preferences`, `wf_student_portfolio_projects`, `wf_student_portfolio_files`; RLS enabled with service-only policies and client grants revoked. Authenticated invoker RPCs call narrow self-scoped security functions using W12-16 active Student self membership. IDs, scope, canonical credentials and Storage paths cannot be reassigned by client metadata. User-row serialization enforces per-Student limits and delete/preferences consistency. Project IDs support retry-safe upsert; no duplicate audit on unchanged requests.

Private `student-portfolio` Storage bucket, no client direct-object policies. Server upload/register validates an owned `StudentId/UUID` path and actual object size/MIME. Deletion revokes file metadata first, then removes blob. Storage cleanup failure returns explicit feedback and leaves an inaccessible object for operational cleanup.

New API paths: `/api/student/portfolio` GET/PUT; `/api/student/portfolio/files` POST; `/api/student/portfolio/files/{id}` GET/DELETE. Anonymous reads use service-only `student_portfolio_public_file`; signed-in reads use role/scope checked `student_portfolio_file`. Public portfolio is service-only `student_portfolio_public`, layering on original `student_public_profile_read` for unchanged slug/privacy/redirect rules.

New explicit audit vocabulary `STUDENT_PORTFOLIO_CHANGED` (`student_portfolio` entity): operation and record UUID only; no profile text, file names/contents, evidence JSON, private notes or Storage paths. Portfolio edits update public page freshness timestamp; no placement, credential, skill, discoverability or reward lifecycle changes.

Migrations are forward-only; applied timestamp/ledger must be reconciled to the repository filename without changing SQL. Production requires separate approval.

## Verification

- Rollback SQL: `scripts/sql/w12-16a-student-portfolio-qa.sql` tests active Student ownership/defaults, staff/wrong-Student denial, malformed inputs, object registration, file visibility, approved Employer scope/consent, private-page and deleted-file exclusion, safe public projection, canonical verified skill provenance/private evidence exclusion, retry-safe project/audit behavior, disabled user and anonymous grants.
- `npm run portfolio:qa`: binary signatures, size limit, MIME spoofing and unsafe formats.
- Required `npm run typecheck`, `npm run lint`, `npm run build`; all existing Wave12 QA; CI repeats focused upload tests.
- Staging migration ledger, SQL/API/no-store smoke, runtime logs and security/performance advisor comparison required. No production release and no provider sends.

## Owner UAT

At https://staging-workforce.txkpro.com:

1. Sign in as Student. Test all five bottom tabs at 320/375/390/430 px; one row, active tab obvious, no content under nav/browser chrome. Desktop and light/dark remain readable.
2. Home shortcuts open real learning/opportunity/portfolio routes. Opportunities retains existing interview response workflows and scheduled vs confirmed employment distinction.
3. Portfolio -> Upload a file. Upload resume PDF, certificate, profile photo, cover and project image. New items private. Try SVG/HTML, fake MIME and >10 MB file: clear rejection, no published metadata.
4. Manage each file -> select private/public/authorized Employer. Appearance -> select photo/cover; opt in to desired credential sections. File photo must be Public to render anonymously; selecting a Private photo must not leak it.
5. Add/Edit project -> title, description, skills, chosen image and visibility. Project claims remain Student-entered; certificates remain Student-uploaded. Retry Save should not duplicate a project. Remove image/file updates its references.
6. Publish original profile via Profile settings; preview `/students/{slug}` logged out. Only opted-in canonical categories/public projects/files appear; training is never Instructor Verified competency. Credential verification links work; revoked/expired status remains visible as such.
7. Set profile Private: public page/current and former slug, public documents/images all become unavailable; sitemap excludes profile. Owner retains private access. Private/public profile setting does not change Employer discovery consent.
8. Authorized Employer candidate page -> shared documents download; unrelated Employer and wrong Hiring Manager scope denied. Revoke Student discovery consent and file sharing -> next download denied. Private files never listed.
9. Keyboard tab/focus, Escape, Cancel and close button; drafts retained on dismissal; busy forms cannot close mid-save; success/error persists. Test iOS Safari document View/Download without premature URL revocation.
10. Rank scope preference Cohort default and other scopes persist; no fake numeric ranks/progress while #224 remains unavailable. No reward purchase/redemption UI enabled.

Expected tracking: Verification after staging technical gates; Done only after owner acceptance.
