# W12-07 / #40 — Retention intervention cases

The Institution Retention entry now opens a canonical case queue and detail workspace. TXKPRO platform admins use `/admin/retention`. The authenticated GET/PATCH APIs are `/api/retention/cases` and `/api/retention/cases/[caseId]`.

Source contract: PRD FR-RET-001–008; TRD retention entity/state machine and API; Status Dictionary §16; Data Ownership retention cases/notes; Role Matrix; Cross-App Event Map RETENTION_CASE_RESOLVED; Institution IA §19; UI standard §28. Wave 10 provides Student pulse case creation. W12-01 provides scoped navigation (#34 merged staging). D-04 Employer pulse remains optional and outside this Student-only implementation.

## Owner decision and authority

On October 3, 2026 the owner selected the permissions matrix to resolve conflicting writer lists. Institution Super/Admin, Career Services and Program Coordinators manage cases in authorized scope; Instructors/Assistants manage assigned scopes; Department Heads/Analysts read only. READ operators may read internal case notes. Employer, Student, inactive/disabled, cross-Institution and metadata-only identities cannot access internal cases. Active platform Admin membership must have `platform` scope.

Each membership's role and scope are evaluated together. Institution affiliation comes from the canonical Student profile joined through placement, matching the existing Wave 10 and Institution Student read models. Cohort/Program/Department matching verifies the cohort's Institution. Program/Department labels may collide across Institutions: accepted canonical invitations supply explicit Institution binding; ambiguous legacy labels fail closed until re-invited with an explicit binding. This does not change other workspaces' legacy authorization helpers.

## Canonical operations

Case state and owner remain in `wf_retention_cases`; notes are append-only in `wf_retention_case_notes`. Added `version`, `next_follow_up_at`, `contacted_at`, `closed_at` support concurrency and human follow-up. A private technical receipt prevents duplicate updates on network retries; it grants no access and is not a source of lifecycle truth. Public invoker RPCs call private fixed-search-path definers; tables stay inaccessible to browser roles.

| State | Permitted next states |
| --- | --- |
| open | assigned, cancelled |
| assigned | contacted, closed_no_response, cancelled |
| contacted | monitoring, resolved, closed_no_response, cancelled |
| monitoring | contacted, resolved, closed_no_response, cancelled |
| resolved / closed_no_response / cancelled | none |

Assignment automatically advances open to assigned. Owner candidates must have current management access to that case. Contact needs an outcome note. Closure needs a brief resolution code and note and clears follow-up. Terminal history is retained without reopening. These validation details implement the sourced human workflow; they add no new canonical statuses/events. Each update locks its row, rechecks authorization, validates version, and writes case, note, audit and receipt atomically. Identical replay remains safe after closure; altered replay conflicts. Only resolution emits RETENTION_CASE_RESOLVED, without Employer routing. Audit includes references and state changes, excluding note content.

The queue supports search, status/owner filters and pagination; active cases order by follow-up then opened time. Detail shows owner, milestone, contact/follow-up/closure dates, private notes and eligible controls. Dates display UTC; follow-up input uses the operator's local time. No raw SMS, provider identifiers, Employer-private interview notes, screening/medical data or skill evidence is exposed. Case management sends no messages and changes neither placement employment nor Verified Skills.

## Verification and manual UAT

Run `npm run wave12:qa`, typecheck, lint and build. Run `scripts/sql/w12-07-retention-qa.sql` as staging SQL operator; it creates synthetic identities and cases, switches to authenticated/anon, and rolls back all fixtures and updates. It verifies role/scope, tenant isolation, active ownership, lifecycle, replay/conflict, audit/event uniqueness and unchanged employment/skills/notification state.

Owner UAT at staging:

1. Institution Admin: Retention navigation → filter queue → open case → eligible owner → contact outcome → monitoring date → resolution note/code. Reload and confirm persisted history.
2. Instructor/Assistant: only assigned scope; another Cohort/Institution denied. Department Head/Analyst: read-only controls; forged PATCH denied. Employer/Student: no internal detail/notes.
3. Two tabs: save one, then stale save gets refresh conflict; repeated retry does not duplicate notes. Network failure offers retry of the same command.
4. Platform Admin: `/admin/retention` supports authorized Institution cases. Open known closed case and verify terminal history.
5. Mobile queue/detail, light/dark theme, keyboard navigation, visible focus, field labels, pending/error feedback and long notes.

No browser staging validation or production release is claimed. Protocol/Project scripts require PROJECTS_TOKEN (unavailable); the standing owner-approved connector preflight exception applies. Provider token/cost telemetry is unavailable rather than fabricated. Project Verification reconciliation is subject to the existing missing Verification option.
