# ATS-02 UX · Dedicated pipeline workspace

**Owner approval:** 2026-10-26, current conversation. **PR:** #365.
**Runtime:** Next.js / Supabase. **Target:** `staging`; no production authorization.

## Routes
- `/employer/pipelines`: employer-scoped directory with search and Draft/Published filters, inline Open and contextual More actions.
- `/employer/pipelines/new`: explicit, idempotent-on-refresh creation form; POST once after user action and route to saved ID.
- `/employer/pipelines/[pipelineId]`: operational dashboard; Kanban/List/Grid presentation of the **workflow definition**; personal per-pipeline default persisted locally. Candidate counts/analytics must not be fabricated before ATS-03.
- `/employer/pipelines/[pipelineId]/edit`: single-draft composer; no cross-pipeline sidebar/library; context-plus opens a searchable library; inspector in modal; help in a tooltip.
- `/employer/pipelines/[pipelineId]/versions/[versionNumber]`: immutable read-only server-authorized snapshot. Historical versions cannot be modified.
- `/employer/pipeline-builder`: legacy route redirects to Pipelines directory; existing `/employer/pipeline` referral-derived dashboard remains intact during transition.
- `/employer/integrations`: provider gallery; account-level settings in modal, future providers marked planned; no invented connected state or exposed API credentials.
- Sidebar only lists already-published pipelines under Pipelines; saved/referrals/interviews/placements live behind Talent tabs, preserving existing deep links.

## Version model and stage metadata
- `wf_ats_pipeline_templates.graph_json` is the single mutable draft; edits perform revision-checked saves under existing scoped API/RLS.
- `wf_ats_pipeline_versions.graph_json` snapshots remain immutable; pipeline/job/version references are not automatically reassigned when a new version is published.
- Graph `schemaVersion:1` is readable unchanged. New pipelines use `schemaVersion:2` with `stages[]` and `node.stageId` for non-system nodes. A v1 draft can be copied into stage-aware v2 **through a revision-checked edit**; published v1 copies remain untouched.
- Each stage has stable ID, label, accessible six-digit color, sort order, candidate visibility, and completion rule.
- Start node is system-generated and protected. Components require valid stage references, unique IDs and complete DAG connectivity for publish. Stage edits in a published pipeline affect only its current mutable draft and future snapshots.
- Independent SQL validator `security.wf_ats_graph_publishable` extended additively to v2 in a **new** migration. Reapply no prior migration.
- Providers are configured per-node only after insertion; employer-level integration connection management remains separated. A structurally valid graph never implies a live provider integration.

## Security and release
- Exact active employer membership is required to view pipelines and their version history.
- Employer Owner/Admin publish; Recruiter drafts; Read Only views. UI checks complement, never replace RLS.
- UI never reads applicant-private fields or exposes provider tokens. Historical version view only reads `wf_ats_pipeline_versions`.
- Test: TypeScript, lint, build, ATS-01 regression, ATS-02 graph/RLS tests, new SQL v1/v2 tests, browser/manual mobile UAT. No staging schema changes until new migration passes Postgres test.
- **Project-access verification:** existing missing `PROJECTS_TOKEN` ATS-02/#329 task-scoped exception does not amount to verified GitHub Project #1 status and cannot authorize production. Reconcile later.

## Deferred
- Paused/archived workflow states require a separate canonical status/data schema and published-version selection policy.
- Candidate analytics, candidate progress tracking and invitations need ATS-03.
- Provider execution needs ATS-04–07 connection, compliance and privacy acceptance.
- Server-stored per-user dashboard view preferences and multi-user collaborative draft conflict comparison are later enhancements; in this UI the default is per-browser/per-pipeline and optimistic revision conflict handling is existing.

**Staging ledger verification:** `20261027043057_ats_02_stage_graph_v2` applied successfully to TXKPRO Workforce Staging. Live valid-v2/invalid-v2 graph checks passed; no ATS-specific security advisor findings. Manual owner browser UAT remains required.
