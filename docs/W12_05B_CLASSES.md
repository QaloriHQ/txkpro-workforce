# W12-05B — institution classes and roster invitations (#235)

Owner approved 2026-10-05. Project-access preflight exception explicitly approved; no automatic Project eligibility PASS claimed. W12-05/W12-06 implementations are closed; W12-05A accepted Verification evidence #5983185019 leaves owner UAT. Target staging only.

Institution classes are separate from Employer Learning courses. Classes span multiple institution cohorts. Assigned instructors manage their own class invitations/imports, not institution-wide rosters or staff permissions. Canonical class enrollment determines the instructor roster; student cohort affiliation is never silently replaced. Staff readers remain constrained by their canonical memberships; students see relevant staff and their own enrollment, never peer contact/private records.

Class lifecycle: draft → open → closed → archived; closed may reopen. Archived is terminal. Enrollment: active → withdrawn/completed. Invitation lifecycle remains the canonical user-invitation table and service, extended with student-only class scope and declined. Pending invitations are not enrollments. Reusable QR links are active until expiration or revocation; sign-in and acceptance are required. Class membership does not grant staff scope or verified competency.

Roster upload: CSV/XLSX, email required, optional first_name/last_name/program/cohort. Review before sending; server revalidates; duplicates skipped; invalid/unmatched affiliation rows flagged. Optional hints prefill only onboarding, never existing profile affiliation. Email delivery uses the existing invitation delivery service and reports failures. No SMS.

Onboarding chooses an active institution cohort and its program. Start date labels use a new cohort start_date field, with term/name fallback for existing cohorts. Missing cohort creates an auditable staff-assistance request, not a new cohort or false enrollment.

All creates/edits/import/review/filter workflows use existing accessible modal/button patterns. Directory is an expandable connection view rather than a false one-cohort class tree. UAT: instructor create/invite/import/QR; student acceptance/onboarding; cross-cohort roster; cancel/decline/expiry/revoke; no duplicate accept/import; scoped staff/student directory; mobile/themes/focus. Production and browser-based staging testing are not authorized.

Recovery: additive migration; roll back application revision or disable class entry points; retain canonical records and apply forward corrections. All class/invitation/enrollment mutations are server-audited; no email addresses, QR tokens or raw uploaded records in audit payloads.

## Verification before staging

2026-10-05: class authorization fixtures, canonical invitation regression, public-profile regression and portfolio regression passed against the draft migration in rollback-only transactions. Fixtures include cross-institution denial, partial-cohort instructor read-only access, student-only class invitations, explicit acceptance, duplicate acceptance/create/QR claims, decline, revoked QR, unverified identity denial, private table denial, student onboarding and audit records. CSV/XLSX parsing tests passed (4); Wave 12 regression tests passed (55); typecheck, lint and production build passed. A corrupted local Turbopack cache was moved aside and the clean rebuild passed. No provider email was sent by SQL fixtures.

QR links require an existing signed-in account; newly provisioned students use the canonical email invitation activation first. No public marketing signup is added. Independent students without institution affiliation retain their existing onboarding; institution-affiliated students must select an active/enrolling/in-progress cohort. Existing cohort-scoped invitations prefill their canonical cohort. Start dates can be edited only by existing cohort managers. Additional instructors need active authorized access across every linked cohort.

Dependency audit: existing Next 16.3.3 reports GHSA-vcvr-r3jv-pc5j; repository inspection found no next/og ImageResponse usage, so the documented vulnerable execution path is absent. ExcelJS uses uuid v4 only; its transitive uuid advisory affects v3/v5/v6 with caller-provided buffers, not the implemented workbook parsing flow. Record these advisories rather than silently force-upgrading unrelated framework dependencies.

Staging security-advisor baseline: 54 intentional RLS/no-policy INFO notices, 122 authenticated-definer WARN notices, one leaked-password-protection WARN. New class data is deliberately inaccessible through direct table grants. Post-DDL comparison is required before Verification.

Local runtime credentials are not configured; authenticated SQL verification uses the connected staging Supabase integration. GitHub Project access remains excepted. Usage CLI start failed because gh is unavailable; finish reports missing run state; actual token/cost telemetry remains unavailable and must not be fabricated.
