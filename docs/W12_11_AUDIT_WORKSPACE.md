# W12-11 audit and event review

Issue: #44. The platform workspace (`/admin/audit`) and Institution workspace (`/institution/audit`) read existing `platform_audit_events` and `wf_domain_events`. No new canonical state or mutation controls are introduced.

Active platform admins can review platform activity. Institution super admins, admins, department heads, program coordinators and read-only analysts can review only the scope of their active, valid membership. Program/cohort matching uses the W12-01 canonical scope guards, including invitation-bound Institution identity and rejection of ambiguous legacy scopes. An allowed role on one membership cannot borrow scope from another. Career Services, instructors, assistants, Employer and Student roles do not gain audit access.

Records expose event, legacy actor identifier, target identifiers, result, established Institution/Student scope, correlation and time. Only allowlisted lifecycle statuses are extracted from snapshots. Raw snapshots, metadata, auth UUIDs, contact details, notes and interview evaluations are excluded. Institution event types use a fixed public lifecycle allowlist, including current canonical invitation and training vocabulary. Unestablished scopes fail closed for Institution users; platform admins retain safe operational metadata. A program-scoped user does not see Institution-wide events without an established cohort. Events concerning Students whose current canonical Institution conflicts with the event's historical Institution are withheld from Institution readers.

Mirrored domain events are deduplicated by correlation, type and target. Filters accept event type, result and an inclusive-from/exclusive-to UTC range. Stable pages contain 25 rows. Button-accessible modals contain filters, detail and export controls. CSV export is POST-only, verifies the authenticated user and rechecks database role/scope, logs `REPORT_EXPORTED`, neutralizes spreadsheet formulas and caps results at the newest 1,000 rows with explicit truncation feedback. Narrow filters for a complete larger export.

## Verification

- `npm run wave12:qa`: 55 tests including CSV formula and privacy regression checks.
- `scripts/sql/w12-11-audit-qa.sql`: staging-only rollback fixtures; 56 assertions plus anonymous and service-without-actor denial blocks. Covers multiple Institutions, sibling programs, ambiguous scopes, canonical binding, inactive/disabled accounts, mixed memberships, safe statuses, private sentinels, mirror deduplication, exact-record filtering, date validation, stable pagination, export attribution and limits.
- Typecheck, lint and production build pass locally. CI must pass before merge.
- Staging migration ledger matches source: `20261004193413` workspace (MD5 `196d1df029066f77279641bf176d959e`), `20261004193757` vocabulary (MD5 `abfaae1efc2d23d59c7f9b32b1a8f413`). The original applied migration is preserved; vocabulary alignment is a forward migration.
- Security advisor remains at the existing baseline: 53 RLS/no-policy findings, 122 executable public definer findings and one leaked-password-protection advisory. New public facades are invokers; the private definer performs its own actor guard. No new advisor findings.

## Owner signed-in UAT

1. Sign in as platform admin and open `/admin/audit`. Confirm attributable records and usable mobile layout.
2. Sign in as Institution admin and open Audit & events from Institution navigation. Confirm only your Institution appears; program coordinator should see only their program's attributable activity.
3. Open Filters; apply event/result/date filters, paginate and clear. UTC ranges use an exclusive end time.
4. Open View details; confirm actor, target, result and permitted status changes, with no notes, email, phone, auth identifiers or raw payloads. Confirm keyboard focus, Escape/close and narrow-screen readability.
5. Use Export CSV → Download CSV. Confirm matching safe rows and a new `REPORT_EXPORTED` entry as Institution admin. Test truncation only if more than 1,000 matching records exist.
6. Confirm an Employer, Student or instructor account cannot open the audit workspace or export API. Confirm the normal UI offers no editing/deletion of records.

Status remains Verification until the owner records signed-in UAT acceptance. Production rollout is separate.
