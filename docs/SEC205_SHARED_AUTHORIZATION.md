# SEC-205 shared authorization hardening

Staging follow-up to D-10 (#202). Source: #205, canonical role matrix and ownership rules. No production release is authorized.

`security.is_admin()` now requires the current authenticated identity's active application account plus one active **platform-scoped** `super_admin`, `admin` or supported `platform_admin` membership. A role name in another scope, inactive membership or user-editable metadata is not authority.

`security.has_employer_role()` and `security.member_of_employer()` require an active application account for **every** path, including legacy ownership/team links. Employer roles stay company-bound. Supported `contractor_owner` → `employer_owner` and `contractor_recruiter` → `recruiter` aliases remain. Legacy team membership permits existing company reads, not an Employer admin mutation role. Hiring Manager need assignment continues to be checked by downstream helpers/RPCs. No memberships, placement history, statuses or events are rewritten.

## Consumer review

Live staging inventory identified 35 directly referencing routine signatures (including two Institution approval overloads) and 29 policies. The correction changes their shared shortcut, not their domain-specific secondary permissions.

| Consumer group | Reviewed boundary |
| --- | --- |
| Employer placement/interview/referral list/detail, talent search, referral close, certification verify | Company/approved-Employer checks and assigned Hiring Manager paths remain; malformed admin shortcuts fail closed. |
| Employer learning browse/manage, interview manage, hiring-manager need checks, contractor ownership | Existing role allowlists and need/company predicates remain. |
| Institution learning/scope, program/cohort management, invitation create/manage/approve/expire, Student invitation/self-provision | Only the platform shortcut narrows; canonical Institution role + educational scope paths remain. |
| Student ownership and learning assignment access | Own-Student path remains; non-platform admins cannot inherit universal ownership. |
| Employer approval RPC/approval-field trigger | Platform operations now require the corrected shortcut; trusted database service execution remains separately controlled. |
| Membership/User/audit/domain-event/onboarding/notification/Student/catalog/Institution/cohort read policies | The universal admin branch narrows; existing own-user and domain branches are not replaced. |
| Contractor/team/profile/hiring-need/referral/saved-candidate/private-note policies | Company helpers inherit active-account enforcement; independent Institution/author branches remain unchanged. |

This is not a claim that all independent authorization paths have been redesigned or that an external exploit occurred. In particular, legacy author/self paths and Institution role paths remain separate policies. Private Employer notes remain Employer-only under existing scope policies/read models.

## Verification and recovery

Forward migration: `20261004002636_workforce_sec205_scoped_employer_helpers.sql`. Existing private definers retain empty search paths, fully qualified tables, anonymous execution revocations and authenticated/service grants. The existing Auth identity and role indexes serve these lookups; no new tables/indexes are needed.

`npm run authorization:qa` checks source invariants in CI. `scripts/sql/sec205-authorization-qa.sql` uses synthetic identities, `SET LOCAL ROLE authenticated`, trusted memberships, actual RPC/RLS calls, positive and negative accounts/scopes/aliases, metadata spoofing, legacy owner/team and Hiring Manager checks. Everything rolls back. Re-run D-10, invitation, onboarding and retention SQL suites after migration.

Recovery: stop promotion if a permitted path regresses; use a reviewed forward correction. Do not restore the vulnerable shortcut, rewrite an applied migration or alter user memberships to hide a regression. No irreversible data change is present.

## Owner manual UAT

At https://staging-workforce.txkpro.com:

1. Active Employer admin/recruiter: load own placements, interviews and hiring needs; confirm the D-10 start modal still works. Read-only Employer: reads work, mutation actions denied.
2. Assigned Hiring Manager: see only assigned-need placements and reject unassigned placement access.
3. Institution test admin `institution@txkpro.com`: institution directory/profile/program/cohort and retention views still work; no Employer-private HR notes or other-tenant records appear.
4. TXKPRO platform Super Admin: expected admin/institution/Employer operations still work. Disabled users and inactive memberships must be rejected; do not change real accounts solely for UAT without approval.
5. Student: own placement evidence still works, other Student/Employer private records remain denied. Check mobile, keyboard/modal focus and light/dark themes for D-10.

Report role, failing step and redacted error/screenshot. Signed-in HTTP/UI UAT and GitHub Project `Verification` reconciliation remain required before completion/release; production requires separate authorization.
