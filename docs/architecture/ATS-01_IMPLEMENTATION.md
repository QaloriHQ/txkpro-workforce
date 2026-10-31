# ATS-01 · Job Listings implementation and release boundary

**Work item:** [#332](https://github.com/QaloriHQ/txkpro-workforce/issues/332) · [ATS-00 baseline](./ATS-00_ARCHITECTURE.md) · [PR #337](https://github.com/QaloriHQ/txkpro-workforce/pull/337)  
**Target:** `staging` only · **Current state:** canonical statuses included; staging migration applied, awaiting owner UAT, **not production**, **not published**

## Delivered in this PR

| Capability | Implementation | Boundary |
| --- | --- | --- |
| Employer-owned drafts | `wf_ats_job_listings`, job API and repository | Separate from existing `wf_hiring_needs`; existing referral/interview/placement statuses untouched |
| Editor | `/employer/jobs`, shared wizard/advanced state | Autosaves via compare-and-swap `revision`; manual save and conflict reload |
| Job templates | `is_template` listing drafts and filtered library | They are draft content templates, **not** ATS pipeline templates |
| Duplication | `POST /api/employer/jobs/:id/duplicate` | New ID/revision/source link, no pipeline or publish fields copied |
| Preview | Employer editor only | Preview does not create a public listing or accept applications |
| Public read routes | `/jobs`, `/jobs/:id` backed only by `wf_ats_public_jobs` | Curated projection deliberately empty until the ATS-02 publisher |
| Publication | `POST /api/employer/jobs/:id/publish` | Always returns a 409 dependency block after employer authorization |
| Audit | Private `security.wf_ats_job_audit` | Metadata-only, not a public API; no direct Data API grants |

## New bounded statuses and schema review

The ATS-01 listing status vocabulary is `draft`, `published`, `paused`, `closed`, `archived`. The latter four are **reserved** pending immutable pipeline-version validation in ATS-02; ATS-01 only creates drafts and can archive draft records. These are new **ATS-specific** values, not aliases of existing Hiring Need/Referral/Interview/Placement statuses. The owner approved the five exact names on 2026-10-18 for canonical-source inclusion. They are recorded in `docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt` Appendix M. This approval is limited to listing-status names and the reviewed staging migration/UAT step; it is not authorization to activate publish, pause, close, public applications or production rollout.

Published jobs must have a verified, same-employer, immutable `pipeline_version_id`; ATS-02 adds that FK and a reviewed atomic publication protocol. ATS-03 owns applicant submission and identity isolation. No ATS-01 endpoint allows an employer to bypass the version check.

## Authorization and data controls

- Every employer API uses `requireEmployerContext({ approved: true })` and tenant-constrained queries. The DB separately validates active employer membership and ATS-specific scoped role, not a UI switcher or a client-provided ID.
- Owner/Admin/Recruiter: create/edit/duplicate drafts; Owner/Admin only: archive and assign a hiring manager. Assigned Hiring Managers: edit only their own assigned draft. Employer Read Only: read allowed employer listings, never mutate. No cross-tenant reads or writes.
- The scoped ATS role helper does **not** inherit legacy platform-admin bypass. New direct platform access to ATS records would need an explicitly reviewed, audited exception flow.
- Row-level security checks ownership and role on both read and write. A SECURITY DEFINER trigger validates optional Hiring Need, source listing, and assigned manager references against the current employer.
- Anonymous and unrelated sessions have no access to private drafts. The public read model has an explicit allowlist and no user-facing write privilege.
- Database guard owns the revision increment and rejects changes to immutable identity fields or premature publishing; API update uses expected-revision compare-and-swap.
- The metadata audit ledger stores no candidate records, private screening results, access tokens or resume data.

## Verification gates

1. `npm run ats-jobs:qa` — validation/role mapping, ownership, authorization, revision and publication guard contracts.
2. `npm run typecheck`, `npm run lint`, `npm run build` and all repository CI jobs.
3. Review migration under a staging transaction or equivalent schema test. Confirm RLS as owner, admin, recruiter, assigned/unassigned manager, read-only, other employer, anonymous and platform operator. Include direct PostgREST attempts that forge `employer_id`, `revision`, `status`, `pipeline_version_id`, `source_job_listing_id`, `hiring_need_id`, and assigned user.
4. Browser UAT on the authorized staging deployment: create draft, switch modes mid-edit, navigate wizard, autosave on typing, refresh, reload on 409, preview, duplicate, create template, mobile layout, and blocked publication.
5. Review canonical Status Dictionary/API approval and GitHub Project reconciliation. The owner explicitly excepted only missing `PROJECTS_TOKEN` for ATS-01. **Do not mark Definition of Ready PASS** on that basis.

## Deployment and rollback

The ATS-01 SQL originated from `supabase migration new ats_01_job_listings`. After the owner approved canonical status names and the staging migration/UAT step, the reviewed SQL was applied to **TXKPRO Workforce Staging** (`qwxlgzlkaeaqfzjodtis`) on 2026-10-18. The Supabase migration ledger recorded version `20261018193301`, so the committed source filename is `20261018193301_ats_01_job_listings.sql` to prevent future duplicate pending migration detection. CI #739 passed for the reviewed SQL and draft editor. This staging authorization does **not** extend to production. Application UAT requires an approved preview or staging build using the staging database. No existing domain tables are modified by the migration. Rollback requires a reviewed data-preservation plan; do not drop records in an ad hoc deploy script.

**Remaining upstream dependencies:** ATS-02 pipeline editor/publication; ATS-03 applicant records and submission; later ATS-04 through ATS-07 provider/interview/progress features. This PR is not the full ATS program and must not be represented as such.

## 2026-10-31 gallery, workspace, and template continuation

Owner-approved ATS-01 continuation separates collection browsing, job operations, editing, and reusable starting content:

| Route | Contract |
| --- | --- |
| `/employer/jobs` | Employer listing gallery only. Templates are excluded from cards and aggregates. Search, lifecycle/location/pipeline/assignee filters and sorting operate across all employer-owned listings without the former inline editor. |
| `/employer/jobs/[jobId]` | Scoped operational home for overview, hiring-team and crew context, listing rules, application readiness, immutable pipeline, analytics readiness, and audit-friendly activity. ATS-03 application/view/conversion counts remain explicitly unavailable rather than fabricated. |
| `/employer/jobs/new` | Deliberate private-draft creation, optionally prefilled from a curated template. |
| `/employer/jobs/[jobId]/edit` | Dedicated Guided/Advanced editor over the same revision-safe draft. Every editable control has accessible contextual help; critical publication requirements remain inline. |
| `/employer/jobs/templates` | Searchable/filterable/sortable library of 36 complete presets: three experience levels across 12 major skilled-trade families. Template cards use the shared accessible `ActionModal` for a complete preview before `Use template`. |

The template library is static curated product content, not employer data. Choosing a template creates a new private draft through the existing allowlisted job API; it never publishes, binds a pipeline, copies applicants, runs screening, or grants access.

`wf_ats_job_hiring_team` and `wf_ats_job_crews` are job-scoped responsibility/context links. They are distinct by design: hiring-team entries identify recruiting coordination, while crews describe intended operational placement. Neither assignment creates a role, enrollment, applicant access, credential, or reward eligibility. The `wf_ats_job_workspace` read and `wf_ats_job_assignment_action` replace RPCs re-derive the authenticated employer scope, validate same-employer active people/crews, bound selections, deny direct client table access, and record `ATS_JOB_ASSIGNMENTS_REPLACED` audit evidence. Existing canonical job RLS remains authoritative; adding a team entry does not expand a user's job visibility.

The additive migration is staged under `supabase/staging/migrations/20261031083232_ats_01_job_workspaces.sql` because it depends on the staging-only reusable crew migration. Production remains a separate authorization and migration-order decision.
