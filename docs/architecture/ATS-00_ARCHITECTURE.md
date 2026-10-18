# ATS-00 — Job Listings and Hiring Pipeline Architecture

**Task:** ATS-00 · [Issue #328](https://github.com/QaloriHQ/txkpro-workforce/issues/328) · [Epic #327](https://github.com/QaloriHQ/txkpro-workforce/issues/327)  
**Target:** staging · **Scope:** Post-MVP architecture only · **State:** Proposed contracts; no schema, API, provider or deployment activated

This document is the shared architecture baseline for ATS-01 through ATS-07. **Every new table/field, API path, status and event below is PROPOSED until approved in its canonical source and implemented by a later task.** Do not infer an existing feature from its appearance in this document.

## 1. Source hierarchy and non-negotiable existing contracts

| Authority | Verified repository reference | Implication |
| --- | --- | --- |
| Work item | GitHub #328 / #327 | Separate ATS phase; no production migration/deployment. |
| Product boundary | docs/product-sources/core/TXKPRO_WORKFORCE_MVP1_PRD.txt — MVP1 definition | MVP1 is not a general ATS. |
| Data ownership | docs/product-sources/core/TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt — Hiring Requirements, Referral, Interview, Placement, Audit, Tenant Isolation | Employer owns hiring requirements. Shared workflow owns existing referral/interview/placement. Employer-private interview notes stay private. Raw background/drug/medical reports are excluded from MVP1. |
| Authorization | docs/product-sources/core/TXKPRO_ROLE_PERMISSIONS_MATRIX.txt — Employer roles, Scope Types | Role plus active membership plus scope are mandatory; UI role switchers and user-editable metadata are not authority. |
| Existing lifecycles | docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt — Referral, Interview, Placement and D-10 | Preserve existing statuses, and never treat a scheduled hire as official employment start. |
| Existing events | docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt — Referral / Interview / Placement | Canonical source writes once; role projections/notifications consume events; replay is idempotent. |
| Current Employer implementation | supabase/migrations/20260920182953_workforce_employer_wave7_core.sql; lib/employer/types.ts; lib/employer/auth.ts; lib/employer/repository.ts | wf_hiring_needs is employer demand, **not** a public job posting. Existing scoped employer roles and RLS must be reused, not weakened. |
| Current Hiring Pipeline | lib/employer/candidate-pipeline.ts; lib/employer/pipeline-repository.ts; docs/UX_PIPELINE_PROGRESS.md | Derived stage/read model over referral/interview/placement. No customizable workflow-version engine currently exists. |
| Screening reality | docs/governance/CHECKR_STAGING.md; docs/governance/AUTHCARD_STAGING.md; docs/governance/AUTHENTICATE_STAGING.md | Dormant Checkr sandbox work was reverted to Authenticate; switching providers is not part of ATS-00. |
| Official placement | docs/D10_OFFICIAL_PLACEMENT.md | Confirmed actual start by an authorized party is required; retention is separate. |
| UX | docs/product-sources/ui/UI_DESIGN_SYSTEM_STANDARD.txt | Responsive, accessible, role-aware forms, workflow editing, and progress. |

Owner-approved product rules from the current ATS discussion: Student **and** external applications; reusable, versioned pipelines; in-flight applications pinned to their original version; Google/Microsoft two-way sync and Apple invitations initially; each employer owns its Checkr connection and billing; phased rollout. Dropbox Sign is the recommended electronic signature provider, **subject to integration approval**.

The ATS-00 GitHub Projects preflight exception is recorded in [#328 comment](https://github.com/QaloriHQ/txkpro-workforce/issues/328#issuecomment-6248445938). It covers only unavailable PROJECTS_TOKEN, not a passing Project check. The owner subsequently authorized ATS-00 execution without Cline. Neither action waives tenant security, tests, source approval, CI, UAT, or production boundaries.

## 2. Bounded contexts and canonical ownership

The new ATS stores an employer-owned application workflow. Existing Hiring Need, Referral, Interview Request and Placement records stay authoritative **in their own domains**. Optional stable references may link records, but no new ATS field mutates the old status family by implication.

| New concept (PROPOSED) | Owning actor/service | Canonical keys and invariant |
| --- | --- | --- |
| Job Listing | Authorized employer publishing workflow | employer_id, job_listing_id; separate from wf_hiring_needs; public DTO contains only explicitly published fields |
| Pipeline Template | Authorized employer configurator | employer_id, template_id; reusable by multiple listings; draft revisions |
| Pipeline Version | Template publication transaction | template_id, version_id, version_number and digest; immutable after publication |
| Pipeline Node / Edge | A single pipeline version | version_id, stable node/edge ID; every edge stays inside its version |
| Job–Pipeline Assignment | Authorized employer publisher | job_listing_id, version_id; version must be published and belong to same tenant |
| Applicant Identity | Canonical Student identity **or** separate external-applicant identity | student_id XOR external_applicant_id; external applicants gain no Student membership/profile access by default |
| Application | Applicant submission service | application_id, employer_id, job_listing_id, applicant identity, **pinned version_id** |
| Application Task | Version-aware workflow service | application_id, version_id, node_id, evidence pointer and actor; no duplicated progress state |
| Provider Connection | Employer owner/admin through server broker | employer_id, provider, account ref; encrypted token server-only, employer-billed Checkr |
| Interview Appointment | Authorized scheduling service | employer_id, application_id, appointment_id; UTC times, timezone, attendees and external event refs |
| Audit / Outbox Event | Trusted server/platform subsystem | tenant, aggregate, actor, correlation/dedupe key; immutable bounded metadata |

~~~mermaid
erDiagram
  EMPLOYER ||--o{ JOB_LISTING : owns
  EMPLOYER ||--o{ PIPELINE_TEMPLATE : owns
  PIPELINE_TEMPLATE ||--o{ PIPELINE_VERSION : publishes
  PIPELINE_VERSION ||--o{ PIPELINE_NODE : contains
  PIPELINE_VERSION ||--o{ PIPELINE_EDGE : connects
  JOB_LISTING ||--o{ JOB_PIPELINE_ASSIGNMENT : has
  PIPELINE_VERSION ||--o{ JOB_PIPELINE_ASSIGNMENT : targets
  JOB_LISTING ||--o{ APPLICATION : receives
  PIPELINE_VERSION ||--o{ APPLICATION : pins
  APPLICATION ||--o{ APPLICATION_TASK : progresses
  APPLICATION ||--o{ INTERVIEW_APPOINTMENT : books
  EMPLOYER ||--o{ PROVIDER_CONNECTION : connects
~~~

### Proposed schema and index checklist — not migration SQL

| Aggregate | Proposed fields / integrity | Query/index intent |
| --- | --- | --- |
| Listing | tenant FK, ID, publication revision/state, content, optional hiring_need_id | employer + state + updated timestamp; separate public DTO |
| Template | tenant FK, ID, draft revision/name | employer + updated timestamp |
| Version | tenant/template FKs, integer version, immutable graph snapshot/digest, published_at | unique(template, version) |
| Node and edge | version FK; unique version-local IDs, kind/config, source/target | unique(version,node); edge version+source index |
| Assignment | job/version FKs, effective time | unique current job assignment, same-employer composite validation |
| Application | job/version/tenant FKs, exactly one identity kind, submitted_at, dedupe token | employer+job+submitted; applicant-owned lookup; unique logical submission key |
| Task | application/version/node binding, state, revision, evidence reference | unique logical node instance; application+state |
| Appointment | application/tenant/organizer, UTC instants, IANA timezone, calendar refs | employer+start; provider event dedupe; collision guard |
| Connection | employer/provider/account, encrypted secret handle, rotation metadata | scoped unique provider account; no direct client table read |
| Audit/outbox | actor/tenant/aggregate, event id, correlation, bounded payload | unique event/dedupe; pending delivery + aggregate time |

Physical names, FK-delete actions, exact indices, enums, storage grants and column types are approval-gated (ATS-D01). New exposed Postgres tables must explicitly enable RLS and enforce role **and tenant**. An authenticated database role by itself is not enough. Updates must constrain both prior and new owner/tenant values; indexes should support security predicates and hot queries. Private provider tokens and raw reports must not be accessible via Supabase Data API.

## 3. ATS capability and field-visibility matrix

**P = proposed ATS-specific capability awaiting permission sign-off; D = denied by design; ? = unresolved role decision.** The existing role vocabulary comes from the canonical Role Permissions Matrix, not new role creation.

| Actor | Listing draft | Publish / pipeline editor | Employer candidate details | Booking/evaluation | Provider settings | Applicant progress |
| --- | --- | --- | --- | --- | --- | --- |
| employer_owner, active matching employer | P | P | P | P | P | — |
| employer_admin, active matching employer | P | P | P | P | P | — |
| recruiter, active matching employer | P | ? publish; P edit draft | P | P | D | — |
| hiring_manager, assigned job/candidate | ? assigned edit | D | P assigned only | P assigned only | D | — |
| employer_read_only, matching employer | D | D | P redacted | P redacted read | D | — |
| employer_employee | D | D | D | D | D | — |
| Student (active own auth session) | D | D | own submitted content | own response/booking | D | P own only |
| External applicant (verified limited session) | D | D | own submitted content | own response/booking | D | P own only |
| Other employer / anonymous | D | D | D | D | D | D |
| Institution | D | D | D unless existing consented Referral scope | D ATS-private | D | D |
| TXKPRO admin/support | least-privilege audited exceptions, never blanket hiring/reports access | | | | | |

| Data class | Employer scoped access | Applicant own view | Public/unrelated |
| --- | --- | --- | --- |
| Published listing title, description, location, pay disclosure and requirements | yes | yes | published allowlist only |
| Draft/private staffing notes, internal cost, approval settings | authorized configurator | no | no |
| Resume, identity/contact and form responses | authorized hiring roles + assignment | own fields | no |
| Candidate-visible task instructions, due/completion | authorized hiring role | own projection | no |
| Assessment answer keys, interviewer evaluation, hidden conditional branch | explicitly authorized reviewer | **never** | never |
| Raw background/fingerprint/drug/MVR/medical results, SSN | separate legally approved broker only; **not generic ATS API** | not generic tracker | never |
| Consent/e-sign receipt, provider operational status | minimum authorized metadata | own permitted acknowledgement | never |
| Provider tokens, raw webhooks, private audit IP/device evidence | server restricted | never | never |

Every route re-derives an active user session, active employer role, and employer/job/assigned-manager scope from trusted server state. URL employerId, host, form fields, user_metadata, client-selected role and a guessable application ID confer no authority. Use tenant-constrained foreign keys where practicable. Public listing content must be a deliberately curated projection; never serve the private Job row wholesale.

## 4. Lifecycle transitions and event ownership

**All ATS names in the next two tables are proposed.** They are not in the existing canonical Status Dictionary/Event Map and must be approved and added there before a DB/API implementation.

| Aggregate | Proposed transitions | Guard / invariant |
| --- | --- | --- |
| Job | draft → published ↔ paused → closed / archived | publish requires valid content, approved employer, published pipeline version; closing stops new applications, not historic review; reopen rules open |
| Pipeline Version | draft → validated → published → superseded | immutable after publish; superseded remains available to in-flight tasks |
| Application | draft → submitted → withdrawn or employer-closed | no automatic rejection; employer decision/reason taxonomy requires separate approval |
| Task | not_started → in_progress → submitted → completed; optional skipped/review_required | no silently completed/skipped step; attempts and reviewer actions auditable |
| Appointment | proposed → confirmed → completed or cancelled/no_show | calendar booking/reschedule uses versioned appointment and provider reconciliation |
| Provider Connection | pending → connected → revoked/error | no hiring state inferred from token rotation or connection status |

| Event proposal | Aggregate trigger | Consumers and restrictions |
| --- | --- | --- |
| ATS_JOB_PUBLISHED | validated publication commit | public jobs/search/notifications receive only publishable DTO |
| ATS_PIPELINE_VERSION_PUBLISHED | immutable version commit | jobs may select version; no in-flight mutation |
| ATS_APPLICATION_SUBMITTED | idempotent submission | employer inbox + own candidate tracker |
| ATS_APPLICATION_WITHDRAWN | verified applicant action | employer board update, never a legacy referral mutation |
| ATS_TASK_COMPLETED | authorized task evidence | safe candidate progress only |
| ATS_APPOINTMENT_CONFIRMED / ATS_APPOINTMENT_CANCELLED | booked/cancelled transaction | calendar/reminders (at-least-once, deduped) |
| ATS_CONSENT_RECORDED | exact disclosure+actor evidence | restricted consent ledger; payload excludes private document/body |
| ATS_PROVIDER_STATUS_RECONCILED | signed/verified authoritative provider state | restricted operational status, never automatic hire/reject |

Existing REFERRAL_CREATED / REFERRAL_VIEWED / INTERVIEW_REQUESTED / INTERVIEW_RESPONDED / PLACEMENT_CREATED and canonical referral/interview/placement enums remain unchanged. New ATS appointments do **not** automatically create existing shared Interview Requests. Only a separately specified authorized bridge may emit a legacy domain event. Official placement retains D-10 confirmed actual-start evidence; an ATS offer/signed contract/hire intent is insufficient.

## 5. Version pinning, duplication and editor switching

1. Employer creates/edit a pipeline template draft with server-issued revision and optimistic concurrency.
2. Publish validates the exact persisted revision and saves immutable version V1 plus digest. A published version cannot be edited in place.
3. A Job references a **published** version and remains reusable across multiple Job Listings.
4. On successful application submission the server stores the actual assigned version ID and digest in the transaction. This is a permanent snapshot binding.
5. Editing the pipeline creates a new draft/V2. New assignments may target V2, but existing applications/tasks keep V1. No implicit migration.
6. Duplicating a Job or Pipeline yields a **new identity and draft revision**. Copy permitted configuration only; never copy candidate applications, appointments, provider secrets, screening orders, contract signatures, consent receipts or audit authorship.
7. Wizard and advanced editor read/write the **same draft document and revision**. Autosave uses If-Match (or equivalent), local recovery and explicit 409 conflict handling. A stale wizard screen cannot replace a newer advanced-editor edit.
8. Explicit migration of an in-flight application to V2 is deferred: requires task mapping, consent/due-date impact, employer authorization, audit, rollback and user-facing notification design.

## 6. Workflow DSL and publish validation contract

A proposed version snapshot consists of schemaVersion, entryNodeId, terminalNodeIds, nodes, edges and candidateProjectionRules. Stable node IDs survive draft reorder. Types:

- Structural: start, end.
- Application: application_form with versioned form template, assessment with private answer key, video with optional/mandatory acknowledgment, boolean consent with exact disclosure version, contract_signature with approved e-sign template.
- Hiring: interview_in_person, interview_online, background_check, fingerprinting, drug_test.
- Each task node has required/optional policy, owner/assignee, candidate-visible label and instruction, due/reminder rules, authorized evidence type and external provider **reference**, not secrets.

A publish validator must reject: duplicate/missing IDs; nonexistent edge targets; missing entry/terminal; disconnected/unreachable nodes; dead-end paths; cycles; outgoing end/incoming start; ambiguous conditional branches; conditions with no else case; required nodes accidentally bypassed without policy; unsupported function/script expressions; unavailable tenant-bound templates/connections; sensitive answer keys or evaluator notes in candidate projection; mandatory video without server-verifiable gate; consent without exact disclosure version; reminders with no recipient consent, timezone, retry ceiling or stop-on-completion.

Branch predicates must use a fixed, reviewed vocabulary with deterministic mutually exclusive tests and an explicit fallback, never arbitrary SQL/JS or protected-trait profiling. A failed assessment or screening status cannot automatically reject an applicant. Retries are bounded **task attempts**, not graph cycles.

### Candidate progress projection

For each application, derive progress from its pinned version and canonical task evidence. Return applicant-visible labels, sequence, due dates, required actions and completed acknowledgements only. Hide evaluator notes, branch predicates, answer keys, Checkr raw findings, other applicants, secret task configs and screening/medical detail. Never mark a skipped step completed. Distinguish waiting on employer from action required by applicant. Legacy buildHiringJourneys remains a separate read model of existing referral/interview/placement evidence until an approved crosswalk exists.

## 7. Proposed API and route inventory — no routes added in ATS-00

Paths below are sketches for ATS-01–06. They follow the existing Next.js route-handler and getEmployerContext style, but are **not approved as canonical names**.

| Proposed route | Intended operation | Required gate |
| --- | --- | --- |
| /api/employer/jobs ; /api/employer/jobs/[id] | list/create/read/patch | active tenant role, optimistic revision, published field allowlist |
| /api/employer/jobs/[id]/duplicate | safe draft copy | new identity, no applicant/provider copy |
| /api/employer/jobs/[id]/publish | publish and pin version | publisher permission and graph/listing validation |
| /api/employer/pipeline-templates ; /api/employer/pipeline-templates/[id] | template CRUD/draft autosave | same employer, deny immutable published writes |
| /api/employer/pipeline-templates/[id]/versions | validate/publish immutable version | revision/digest and approval gate |
| /api/employer/pipeline-templates/[id]/duplicate | clone draft | no active applications |
| /api/jobs/[publicId] | published public job | curated projection, enumeration-safe |
| /api/jobs/[publicId]/applications | Student/external submission | own identity, verified session, throttling, upload scan |
| /api/applicant/applications/[id] ; /tasks/[taskId] | own progress/required tasks | identity+version+task ownership |
| /api/employer/applications ; /[id] | Kanban/list/grid/details | role+tenant+assigned-job field-level allowlist |
| /api/employer/appointments ; /[id] | availability/book/reschedule/cancel | participant authorization, conflict lock/dedupe |
| /api/employer/integrations/[provider] | provider onboarding/health | owner/admin, OAuth state, server-only token |
| /api/integrations/[provider]/webhook | provider callback | signature, tenant binding, event replay guard |

Proposed UI: /employer/jobs and edit/create wizard; /employer/pipelines and interactive graph editor; /employer/applications (Kanban, list, grid over one server query); per-application details; applicant-owned progress and tasks, with verified limited external session. These URLs are **not live**. Reuse accessibility and responsive standards from the UI Design System; keyboard add/move/connect alternatives must accompany pointer drag-and-drop.

## 8. Provider integration boundary

| Capability | First delivery contract | Cannot be assumed now |
| --- | --- | --- |
| In-person booking | Availability/timezones, all-participant invitations, reschedule/cancel, conflict-safe calendar events, reminders | Google/Microsoft credentials or organizer authority |
| Google and Microsoft | Two-way sync with scoped OAuth, provider event ID, change/reconcile cursor, idempotent callback and retry | Provider webhooks or enabled calendars |
| Apple | ICS invitations, changes and cancellations | Two-way Apple Calendar sync |
| Twilio Video | Per-appointment room/access token; short-lived attendee identities; optional/mandatory pre-call video | Live rooms/tokens or client-only mandatory watch confirmation |
| Checkr | Employer-connected account/billing; re-evaluate dormant #244 and active Authenticate/AuthCard; signed status callbacks and explicit consent | Reactivated Checkr, active orders, provider pricing, consent or adverse-action clearance |
| Local fingerprint/drug testing | Verified local service/appointment, minimal status evidence | Storing raw medical/lab/fingerprint reports in ATS |
| Dropbox Sign | Recommended tenant-scoped template, authenticated signer, signed callback and receipt evidence | Executed provider contract, pricing, legal template or active credentials |

Provider webhooks are **untrusted input** until signature, freshness, idempotency and account/tenant/subject binding pass. Reconcile ambiguous responses with authoritative provider API. Operational completion is not an employment decision. Sensitive legal/adverse-action review remains human-authorized and outside generic task progress.

## 9. Security, threat model and controls

| Threat | Control / required negative test |
| --- | --- |
| IDOR and cross-employer/assigned-manager access | Enforce RLS + route-layer same-tenant/assigned-role check; foreign IDs deny list/detail/export/download |
| External applicant impersonation and automated spam | Verified email/session, expiration, abuse throttling, upload malware scan, opaque IDs and rate limits |
| Student record oversharing | Application access never grants discoverability or institution-record access by itself; consent remains independent |
| Unintended public job data | Publish allowlist; private notes/budget/owner fields never indexed or sent in public DTO |
| File/resume exfiltration | Private per-application storage, short-lived authorized downloads, file type/size validation and scanning |
| Stale autosave/TOCTOU | Compare-and-set revision and same-transaction job+version pin on application submission |
| Graph bypass/loop/arbitrary logic | Deterministic typed graph validation, path coverage tests, bounded task attempts |
| Assessment/protected-trait inference | Private evaluator fields, human review, no opaque automatic hiring score/rejection |
| Screening/consent misuse | Purpose-bound exact disclosures, consent ledger, separated order/review permissions, legal review |
| Replayed webhooks/double billing/double booking | Signed payload, durable dedupe keys, provider-account binding, transactional reservation/outbox |
| Calendar/token leak | Encrypted server-only secrets, minimal invite details, short-lived room tokens |
| Retention/deletion conflict | Classification-specific retention and legal hold decisions before storing reports; audited export/deletion |

## 10. Open decision register — blocks code dependent on the choice

| ID | Decision | Required reviewer/authority |
| --- | --- | --- |
| ATS-D01 | Exact schema/table/column/index names, API routes and canonical ATS status/event values | Product/technical owner; canonical sources update |
| ATS-D02 | Recruiter publish rights and Hiring Manager assigned-job editing | Product owner + role/scope security |
| ATS-D03 | External identity/session verification, duplicate applications, Student link/merge | Security/privacy owner |
| ATS-D04 | FCRA/screening disclosures, local laws, adverse-action ownership and candidate appeal process | Legal/privacy/product owner |
| ATS-D05 | Applicant-visible conditional branches, assessment feedback and skipped task wording | Product/privacy owner |
| ATS-D06 | Public jobs moderation, salary/location compliance, SEO indexing | Product/legal owner |
| ATS-D07 | Actual provider entitlements, billing/account and webhook activation | Integration owner; employer provider approval |
| ATS-D08 | Record-specific retention/deletion/export/legal-hold schedule | Privacy/legal owner |
| ATS-D09 | Candidate migration between versions, if ever allowed | Product/security owner (default: forbidden) |
| ATS-D10 | Crosswalk to shared referral/interview/placement and D-10 start confirmation | Shared-domain owner |
| ATS-D11 | Form template and assessment author/answer-key access | Product/security owner |
| ATS-D12 | Interview reminders, channel consent, timezone/SLA and failure escalation | Product/compliance owner |

Names above are reviewer roles, **not evidence that any specific person approved the open decision**. Until confirmed, use fail-closed and do not activate dependent features.

## 11. Phased rollout, rollback, QA and evidence

1. **ATS-00:** approve exact domain/authorization/status/event/API contracts, policy decisions and staging-only implementation plan.
2. **ATS-01:** new Job Listing domain, draft/wizard/advanced editor, duplicate, publish with approved pipeline binding.
3. **ATS-02:** reusable versioned workflow template and drag/drop graph editor, publish-time validator.
4. **ATS-03:** both applicant identity flows, submissions, task projection and employer Kanban/list/grid.
5. **ATS-04:** availability/calendars, Twilio and pre-call video.
6. **ATS-05:** employer-connected Checkr and local testing, after independent legal/provider activation approvals.
7. **ATS-06:** Dropbox Sign/offer workflows, consent and callback controls.
8. **ATS-07:** cross-tenant, concurrency, accessibility, CI, security and signed-in manual UAT.

**Proposed flags (names pending approval):** tenant ATS access, public listing publication, external apply, workflow publish, calendar by provider, Twilio, Checkr, local checks, e-sign; all default OFF. Disabling an integration stops new outbound calls while leaving historical scoped status readable. Use additive migrations on staging after sign-off, rollback via flags/forward fix, proven backup/restore and index/RLS/advisor review. No production migration or provider activation without separate authorization.

**Observability:** track safe counts/latency for submission/duplicate rejection, draft conflicts, validation errors, task progress, signed webhook replays, failed reminders, booking collisions, external reconciliation lag and authorization denials. Logs/events must exclude resumes, consent bodies, tokens and raw screening/medical results.

**Automated QA required in build phases:** targeted workflow graph and version pin tests, cross-tenant/assignment/RLS negatives, idempotent submission and webhook replays, provider mocks, typecheck, lint, build and full CI. Staging SQL changes require migration ledger/advisors and rollback-safe scope probes. Provider mocks never count as a live provider test.

**Owner UAT (QaloriHQ; no automated staging browser session requested):** wizard/editor switch/save/conflict; duplicate without candidate data; publish V1/V2 and confirm V1 applicant remains pinned; Student/external access; candidate redaction; employer Kanban/list/grid parity; accessible keyboard graph editor/mobile; in-person booking/invite/change, calendar sync, Twilio pre-call gate; Checkr/consent/e-sign only after independent sandbox activation and required reviewer sign-off.

### Acceptance / current evidence

- [x] Source-grounded bounded contexts, ownership, role/field matrix, ERD, workflow DSL/validations, proposal status/event transition table and API inventory.
- [x] Risks, provider/PII boundaries, phased rollout, rollback, observability and manual UAT plan.
- [x] Explicitly separate proposed contracts from implemented canonical ones.
- [ ] ATS-D01–D12 decisions resolved and appended to canonical source files where necessary.
- [ ] Eight-category machine-validating confirmation and next-task contract fully satisfied; unavailable PROJECTS_TOKEN is an issue-scoped exception, never a fabricated PASS.
- [ ] PR CI, owner review, staging/UAT/deployment evidence completed; issue/project reconciliation.

**Interpretation:** This is an ATS-00 architecture artifact, not implementation of job listings, workflows, applications, integrations, migrations, or production release.

### Machine-readable naming crosswalk (PROPOSED)

The accompanying ATS-00_CONTRACTS.json deliberately uses snake_case *concept identifiers* for downstream checks. These are not approved SQL names or existing relations:

| Concept token | Human-readable contract above |
| --- | --- |
| pipeline_edge | Pipeline Node / Edge |
| job_pipeline_assignment | Job–Pipeline Assignment |
| employer_provider_connection | Provider Connection |
| ats_audit_outbox | Audit / Outbox Event |
| external_applicant_identity | Applicant Identity (external branch) |

