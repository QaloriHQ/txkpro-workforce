# Institution provisioning and marketing access — owner decision #194

On 2026-10-03 the owner directed that internal TXKPRO Workforce Super Admins create institutions and marketing visitors request demo/access rather than create accounts. This supersedes the original PRD marketing self-registration acceptance while preserving canonical invitations, verified identity, D-01 approval, and institution isolation.

- Creation requires an active shared user and an active `super_admin` membership at `platform` scope. Generic Admin, Institution Super Admin, and user-editable metadata cannot create institutions.
- `/admin/institutions` creates an active canonical `wf_institutions` record, audits creation, and offers canonical institution administrator invitations. Creation grants no user membership. Retry receipts reject changed payloads and duplicate name/location creation is serialized.
- Onboarding reads a safe authenticated institution directory. Existing active Texarkana College is reused, with no duplicate seed or hardcoded frontend option. Educators may select only an institution covered by their canonical active/pending membership. Educator completion updates contact/onboarding state atomically, preserves roles and scopes, and never creates Instructor seats or memberships. Pending approval remains pending.
- `/request-access` accepts demo/access requests for Student, Institution/Educator, and Employer. `/signup` redirects there; marketing, login, and auth-error links point there. The intake validates bounded fields, normalizes email, serializes a five-minute email cooldown, and stores requests privately. It creates no Auth identity, shared user, institution, or membership. Internal Super Admin can review the latest 100 requests and separately provision approved access through canonical invitations.
- Existing Institution pilot request intake remains request-only. Password recovery and sign-in remain available; OTP sign-in retains `shouldCreateUser: false`.
- This change removes registration from application marketing surfaces. It does not change Supabase Auth service signup configuration; direct Auth signup settings are an independent platform control, and no config mutation is claimed.

## Verification and owner UAT

Run typecheck, lint, build, Wave 12 regression suite, and `scripts/sql/institution-access-onboarding-qa.sql` against staging. SQL checks exercise real authenticated/anonymous/service roles and roll back all fixtures, including completion of the owner test account. Verify the applied migration ledger and Vercel deployment revision before staging handoff.

Owner signed-in UAT:

1. Sign in as `institution@txkpro.com`; onboarding shows Texarkana College, permits completion, and opens the Institution workspace with Institution Admin access. Confirm no additional Instructor role is granted.
2. As internal platform Super Admin, open Operations → Institutions and access requests. Create an institution, see it in the directory, and send an Institution Admin invitation using the existing canonical workflow.
3. A generic Admin and an Institution Admin cannot create institutions or read the internal marketing request queue.
4. Marketing desktop/mobile entry points open Request demo or access. Submit a request; the confirmation creates no account. `/signup` redirects to the request form. Super Admin sees the submitted request.
5. Check keyboard validation, focus, error/success feedback, responsive layout, and light/dark theme. Existing invitation acceptance, login, and password recovery still work.

Production deployment and migrations are outside this authorization. Project Verification and issue closure remain evidence-gated; pending owner UAT is not Done.

## Staging automated evidence (2026-10-03)

PR #195 initial CI passed: https://github.com/QaloriHQ/txkpro-workforce/actions/runs/37149293607. Local typecheck/lint/build and all 51 Wave 12 regression checks passed. The real-role rollback SQL suite passed 99 checks, including the existing owner test Institution Admin's completion and the new-institution → Super Admin invitation → recipient acceptance flow. Fixtures were rolled back; no test contact data or institutions remain.

Applied provisioning migration: `20261003195118_workforce_institution_access_onboarding.sql`; ledger name `workforce_institution_access_onboarding`; raw SQL MD5 `a279a751855180bb7d6b4da8424b5749` matches the ledger. The original migration was renamed to the applied ledger version without changing its SQL. The removed old service-route code referenced nonexistent `wf_instructor_seats`; completion now preserves the canonical membership directly.

Advisors show unchanged baseline warnings (121 existing public authenticated definer functions, leaked-password protection, and three duplicate indexes). Two new RLS-without-policy INFO entries are intentional: intake and retry receipts have no direct client grants. A forward receipt foreign-key index migration addresses the new unindexed-FK INFO finding. Final CI, index ledger, staging deployment revision and manual UAT are recorded on #194.

Receipt index applied as `20261003195703_workforce_institution_creation_receipt_index.sql`, MD5 `d5f7621f648791bd710e846145068f40`; ledger matches. Performance advisor no longer reports the new unindexed foreign key. Authenticated real-role tests passed without persisting test data; owner account still has exactly its original active Texarkana College Institution Admin membership. Preview GET verification returned HTTP 200 for the request page and the legacy signup redirect, displaying the request form with no registration/password form.
