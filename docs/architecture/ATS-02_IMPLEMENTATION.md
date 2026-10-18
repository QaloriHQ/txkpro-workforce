# ATS-02 · Visual Hiring Pipeline Builder & guarded Job publication

**Task:** [ATS-02 / #329](https://github.com/QaloriHQ/txkpro-workforce/issues/329) · [PR #338](https://github.com/QaloriHQ/txkpro-workforce/pull/338)  
**Target:** `staging` only. Owner approved ATS-02 and the reviewed staging migration/UAT step. No production authorization.  
**Release:** All four ATS-02 staging migrations applied; app release pending final CI and merge; owner browser UAT pending.

## Implemented

1. **Reusable versioned pipeline editor:** Employer-owned drafts, full graph/component validation, keyboard-accessible drag/drop canvas, zoom, edge and decision paths, undo/redo, inspect, preview and duplicate. Provider-dependent components are *configuration placeholders*, not active integrations.
2. **Immutable publication:** Owner/Admin-only version publishing with same-tenant checks, exact source revision uniqueness and audit. A published graph snapshot is never overwritten; ATS-03 applications must persist their originally assigned version.
3. **Job publication:** Assign an existing published version while publishing a complete non-template draft. The guarded transaction validates employer ownership, role, revision, job status, title/description/location and same-employer published version. Duplicate jobs do not inherit a binding.
4. **Curated public projection:** Only published jobs appear on `/jobs`; pause, close and archive remove them. Anonymous users cannot read private jobs or pipeline versions, and neither anon nor authenticated clients can directly write the projection. Candidate apply remains unavailable until ATS-03.
5. **Canonical jobs statuses:** `draft`, `published`, `paused`, `closed`, `archived` per Status Dictionary Appendix M. No silent modifications to legacy Hiring Need, Referral, Interview or Placement statuses, and no automatic hiring/rejection.
6. **Security:** Scoped employer memberships, active approved employer required, employer Owner/Admin-only publication, RLS, private audit metadata. External providers, screening data and applicant submission are not activated here.

## Migration ledger and release record

Supabase target: **TXKPRO Workforce Staging** (`qwxlgzlkaeaqfzjodtis`). Existing baseline `20261018193301_ats_01_job_listings` was preserved. Applied successfully (2026-10-18):

| Staging ledger version | Migration | Purpose |
| --- | --- | --- |
| `20261018213605` | `ats_02_pipeline_templates` | Tenant-owned drafts, immutable versions, SQL graph checks, audit and RLS |
| `20261018213618` | `ats_02_job_publication` | Same-tenant job/version FK, authorized status transitions and curated public projection |
| `20261018213747` | `ats_02_fk_indexes` | Cover foreign-key lookup indexes required by staging advisor |
| `20261018214455` | `ats_02_rpc_invoker` | Public RPC wrapper privilege hardening |

RPC privilege hardening migration `20261018214455_ats_02_rpc_invoker.sql` is **applied** on staging. The public wrappers run as SECURITY INVOKER; internally scoped security-schema functions retain privileged execution after tenant, role and revision validation. All four ATS-02 migrations were applied successfully.

All four migration filenames were aligned to the live Supabase migration ledger; never replay them. Source migrations are additive; do not rewrite `20261018193301_ats_01_job_listings.sql`.

## Verification and non-negotiable boundaries

- `npm run ats-pipelines:qa`: graph and role QA; PGlite installs ATS-01 plus ATS-02 migrations, checks successful/failed publication, distinct roles/tenants, RLS, immutable bindings and version snapshots, curated public metadata, pause/resume/close.
- `npm run ats-jobs:qa`: ATS-01 editing, tenant and regression contracts.
- Typecheck, lint, Next.js build and repository GitHub CI.
- Staging advisors: no new unindexed ATS FKs after index migration. Information-only notices for unused indexes on empty/new ATS tables and two private audit tables intentionally RLS with no public policies. Post-migration security advisors report **no ATS publication RPC warnings**. Only intentional INFO-level entries remain for the restricted audit tables.
- **ATS-03** still owns student/external applicant submission, consent/evaluation evidence, applicant pipeline pinning, and candidate tracker updates. No applicant data or provider calls in ATS-02.
- **UAT** remains owner-controlled: employer pipeline draft and version publication, mobile/desktop canvas, workflow validation, switch to job builder, assign version, publish, public read, archive/paused visibility, role denial and conflict/reload.
- `PROJECTS_TOKEN` Project #1 access exception is scoped only to ATS-02/#329; this is not proof that Project preflight passed. Reconcile Project #1 when access becomes available. CI, source, security and owner-UAT gates cannot be bypassed.

**Production database and deployment remain untouched.** Do not mark Issue #329 Done until the staging app is READY, verification evidence recorded and owner UAT signed off.
