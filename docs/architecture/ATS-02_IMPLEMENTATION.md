# ATS-02 · Hiring Pipeline Composer implementation record

**Task:** ATS-02 / [#329](https://github.com/QaloriHQ/txkpro-workforce/issues/329)  
**PR:** [#338](https://github.com/QaloriHQ/txkpro-workforce/pull/338)  
**Base:** staging · **Stage:** IN REVIEW (not production released; staging migration not applied)

## Scope delivered in the review branch

- Employer-only pipeline draft records distinct from both `wf_hiring_needs` and the existing derived referral/interview/placement Hiring Pipeline.
- A bounded DAG workflow schema: Start, End, form templates, assessments, videos, consent, electronic signatures, in-person/online interviews, screening/fingerprinting/drug-test steps, manual review, branching decisions, and notifications. Provider-specific steps are *configuration placeholders only*.
- Canvas with drag/drop creation, keyboard movement, zoom, explicit edges/Yes-No decisions, undo/redo, node inspector, candidate-safe preview, save/revision concurrency, duplication, and reusable versions.
- Owner/Admin-only publication into immutable version snapshots, secured by `security.wf_ats_has_employer_role`, a SQL graph validity gate, revision locking and a unique source-revision invariant.
- Restricted metadata audit, composite (employer_id, template_id) FK, RLS. No raw reports, assessment answer keys, provider secrets or applicant records.

## Authorization

| Role | Draft read | Draft edit/duplicate | Publish version |
|---|---|---|---|
| Employer Owner/Admin, same employer, active | yes | yes | yes |
| Recruiter, same employer, active | yes | yes | no |
| Employer Read Only, same employer, active | yes | no | no |
| Hiring Manager | no by default | no | no |
| Student, Institution, anonymous, other employer | no | no | no |

All API handlers re-resolve `requireEmployerContext({approved:true})`; RLS independently verifies an active, approved employer and exact canonical role/scope. Platform role without employer membership is not an ATS override.

## Migration and verification

Source migration: `supabase/migrations/20261018213605_ats_02_pipeline_templates.sql`. Never edit or reapply the ATS-01 migration. Validate with:

- `npm run ats-pipelines:qa` (pure graph validation and actual isolated Postgres/RLS exercises)
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Full CI plus staging-only schema review and Supabase advisors before any staging migration.

**Important:** The draft PR does not yet remove ATS-01's publication guard. A separate reviewed ATS-02 migration must enforce an atomic, same-employer job/version binding, status transitions and curated public projection. This must be tested against direct SQL/PostgREST attempts to forge other-tenant versions, bypass state transitions, alter applicant-pinned versions or expose private fields. Until that work is complete, the UI must continue to show publication blocked. ATS-03 owns actual applicant submissions and progress projections.

## Remaining gates

1. Complete focused PostgreSQL migration/RLS QA and full CI on final branch tip.
2. Review pipeline schema and canonical workflow/event consequences; preserve the existing hiring/referral/placement states.
3. Implement and verify *separately* Job→published version assignment and public publication; do not claim ATS-02 Done while job publication remains blocked.
4. Reviewed staging migration, compare migration ledger and RLS grants, check advisors.
5. Owner mobile/desktop visual UAT: DnD, keyboard fallback, graph connections/validation, save/reload/revision conflicts, template duplication and immutable version publication.
6. GitHub Project #1 reconciliation remains excepted **only for missing PROJECTS_TOKEN** by owner approval for #329, never a Project PASS. Production change requires separate authorization.

No provider calls or candidate migrations occur in this change.
