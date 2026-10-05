# Directory invitations and employee access

Owner-approved staging increment of #76, with institution directory integration under #235. The owner explicitly extended the Project-access exception on October 5, 2026. Project task context/preflight could not read PROJECTS_TOKEN; this is not an automated Definition of Ready PASS. Full employer guided onboarding, pilot commitments and production approval remain outside this bounded increment.

## Permission contract

`employer_employee` is a canonical employer-scoped membership, separate from employer_owner/admin, recruiter, hiring_manager and employer_read_only. Owners/admins may invite it only in their own active employer. Invitation creation grants pending membership; authenticated email-matching acceptance activates it, idempotently. Existing invitation delivery, resend, expiry, revoke and audit behavior is reused. Employee acceptance never adds contractor_team_members: legacy team affiliation can grant operational reads. Employee memberships cannot grant candidate access, hiring mutation, company/team administration or course authoring. A person may independently have other explicit memberships.

Employee navigation at `/employee` exposes published company learning resources and explicitly accepted private incentive programs at `/incentives`. Browsing a public course is not an assessed completion, credential or PRO Points award. Existing Student assessment/assignment runtime remains Student-scoped; an employee-specific assessed-course assignment runtime is outside this directory/access increment. Private training activities can use the existing accepted incentive-program evidence flow.

`employee_workspace` checks current active account/membership and employer state, returns only that employee's employers and public-visible learning pages. `employer_connections` is available to existing operational employer roles, not employees, and returns bounded name/role/scope data. No contact details, hiring notes, evaluations, private learner records or answer keys are included. Direct calls to old implementation helpers are revoked. All new public RPCs are invoker facades over private checked helpers; no table grants or RLS widening.

## Institution directory

The existing role/cohort/class canvas now includes authorized Students. Peer Students never receive other Students' directory records. Institution-wide authorized staff can see accepted institution memberships awaiting cohort selection without inventing a cohort affiliation. `directory_invitation_options` derives permitted role/scope pairs from the canonical inviter policy, including managed open classes for instructors. Client filters are presentation; creation independently rechecks the same policy. Institution activation/approval and Student cohort onboarding remain unchanged.

## UI contract

Both directories reuse the canvas: pan, pinch/zoom, keyboard pan/zoom, fit, role filters, collapsible groups, focus-visible selectable people and detail dialogs. Employer branches represent role memberships, not inferred reporting lines. Add person opens a TXKPRO dialog with email, optional names, allowed role/scope and the invitation lifecycle list. Entered drafts persist when closed; pending submissions block duplicate sends/dismissal. Revoke/cancel uses explicit confirmation. A manual Refresh directory control and visible-page 30-second refresh update accepted memberships without discarding drafts or filtering. Old `/employer/team` links redirect to `/employer/directory`.

Official logos, Heroicons, shared modal/button/status components and semantic light/dark theme tokens are retained. The modified canvas controls replace former Unicode icon stand-ins with Heroicons. Mobile controls wrap, primary zoom targets are at least 44px, and the canvas remains a dedicated pan region rather than overflowing the page.

## Verification

Execute the migration plus `scripts/directory-employee-staging-qa.sql` in BEGIN/ROLLBACK before deployment, and run the QA alone inside BEGIN/ROLLBACK afterwards. Tests use existing activated accounts and isolated employer fixtures; no email is sent or fixture retained. Cover owner scope, cross-tenant denial, pending access denial, email-matched/idempotent acceptance, absence of legacy operational grants, training-authoring and invitation denial, revoked/disabled accounts, accepted canvas records, audit, private helper grants, institution options and Student peer privacy. Run classes/authorization regression suites, typecheck/lint/build and required CI. Match the applied migration ledger to exact repository SQL, compare advisor findings, and verify exact staging Vercel revision.

Owner UAT: on employer Directory invite an Employee and an operational user, use separate accounts to accept, verify Employee lands in the limited workspace and cannot open employer hiring/admin routes, and refresh the canvas. On institution Directory invite faculty and Students using allowed scopes, verify any approval requirement and cohort onboarding, and confirm their accepted affiliation appears. Test pending invitation resend/revoke/cancel and duplicate retry. Check phone/desktop, light/dark, keyboard focus, modal drafts and pan/pinch/filter/collapse. Production remains untouched; no SMS or funded rewards are activated.
