TXKPRO WAVE IMPLEMENTATION PROTOCOL
Version: 1.0
Effective date: September 30, 2026
Applies to: TXKPRO Workforce roadmap waves, tasks, fixes, migrations, integrations, and releases

======================================================================
1. PURPOSE
======================================================================

This protocol defines the complete process for implementing TXKPRO Workforce roadmap work from request intake through planning, development, verification, test-environment deployment, manual validation handoff, roadmap reconciliation, production promotion, and post-release monitoring.

The protocol exists to ensure that:

- Roadmap dependencies are never silently skipped.
- “Implemented,” “deployed,” “verified,” and “done” remain distinct states.
- Role and scope authorization remain server-controlled.
- Database changes are incremental, traceable, and recoverable.
- Canonical statuses, events, and data ownership rules are preserved.
- Security blockers stop dependent releases.
- GitHub issue state and GitHub Project status remain synchronized.
- Test-environment deployment does not imply production authorization.
- Browser-based staging verification is handed to the user unless separately requested.

======================================================================
2. STANDING AUTHORITY AND OPERATING BOUNDARIES
======================================================================

The assistant is authorized to:

- Inspect the repository, roadmap, documentation, GitHub issues, pull requests, CI, Supabase staging, and Vercel test/staging deployment information.
- Implement approved roadmap tasks.
- Create feature branches, commits, pull requests, and supporting documentation.
- Merge approved work into the staging branch after required automated checks pass.
- Apply approved migrations to the staging Supabase project.
- Deploy or allow deployment to the test/staging Vercel environment.
- Run non-browser staging verification using SQL, APIs, deployment status, logs, migration records, and advisor tools.
- Update and close GitHub issues when acceptance criteria are satisfied.

The assistant is not automatically authorized to:

- Deploy to production.
- Apply production database migrations.
- Delete or destructively rewrite production data.
- Rotate or repurpose credentials outside the authorized secret-management workflow.
- Make unresolved product decisions with material policy, legal, privacy, or business consequences.
- Perform browser-based staging tests unless the user specifically asks for them.

Standing user instruction:

- Do not spend time running browser-based tests against the staging environment.
- Provide a clear manual UAT handoff when browser, visual, or signed-in staging validation remains.
- Continue implementation and non-browser staging verification when it is safe to do so.

======================================================================
3. SOURCE-OF-TRUTH HIERARCHY
======================================================================

Each implementation must be grounded in the following sources:

1. Live GitHub issue and GitHub Project item
   - Current task state, dependencies, acceptance criteria, discussion, and implementation evidence.

2. TXKPRO Workforce Master Implementation Roadmap
   - Wave membership, planned sequence, dependencies, priority, critical-path designation, release, and workstream.

3. TXKPRO Workforce MVP1 PRD and TRD
   - Product outcomes, architecture, tenancy, authorization, workflows, reporting, deployment, and technical requirements.

4. TXKPRO Data Ownership and Scope Rules
   - Canonical owner of each record and permitted access boundaries.

5. TXKPRO Role Permissions Matrix
   - Canonical role names, scope types, read permissions, mutation permissions, and audit expectations.

6. TXKPRO Status Dictionary
   - Approved lifecycle states and their meanings.

7. TXKPRO Cross-App Event Map
   - Canonical domain events and their permitted consequences across Student, Institution, Employer, and Admin experiences.

8. Applicable Information Architecture and User Flows
   - Role-specific navigation, screen structure, task flows, and view requirements.

9. TXKPRO UI Design System Standard
   - Visual, interaction, accessibility, responsive, role-aware, provenance, status, and component requirements.

10. Current repository, staging database, and deployed environment
    - Operational truth about what is currently implemented.

Conflict rule:

- Product documents define intended behavior.
- The repository and database reveal existing behavior.
- Existing behavior must not be assumed correct merely because it exists.
- When authoritative sources conflict materially, stop and request or document a product decision instead of silently inventing behavior.

======================================================================
4. CORE DELIVERY PRINCIPLES
======================================================================

4.1 Dependency integrity

- Never silently bypass a declared dependency.
- If a dependency is incomplete, determine whether it is a hard blocker, a verification-only dependency, or an outdated tracking state.
- Report any exception before claiming the dependent work or wave is complete.

4.2 Server-controlled authorization

- Authentication alone is insufficient for sensitive access.
- Role and scope are both required.
- User-editable profile or Auth metadata is never authorization proof.
- Prototype role switchers are demonstration-only.
- Sensitive mutations must be attributable and auditable.

4.3 Canonical state

- Write workflow state once to the canonical domain record.
- Dashboards, notifications, reports, and role-specific views are consequences or read models.
- Do not create competing state models for different applications.
- Use only approved canonical status values.

4.4 Evidence separation

- Instructor Verified Skills remain authoritative technical competency evidence.
- Employer Training, Company Badges, and Employer Certifications remain employer-specific readiness evidence.
- Self-attested evidence must remain distinguishable from verified evidence.
- No feature may silently convert engagement or readiness signals into an opaque hiring score.

4.5 Least disclosure

- Return only fields required by the authorized workflow.
- Institution access must never expose another institution’s records.
- Employer-private interview notes and evaluations remain Employer-only unless an explicit policy changes that rule.
- Assessment keys, secrets, tokens, and unnecessary personal data must never enter public HTML, client bundles, logs, issues, or pull-request descriptions.

4.6 Incremental delivery

- Prefer small, reviewable, reversible changes.
- Use incremental migrations.
- Preserve existing user changes and unrelated work.
- Do not use destructive repository or database actions without explicit authorization.

4.7 Evidence-based completion

- Code completion is not release completion.
- A merged pull request is not automatically Done.
- An applied migration is not automatically Done.
- Completion requires acceptance evidence and tracking reconciliation.

======================================================================
5. WORK STATUS DEFINITIONS
======================================================================

PLANNED

- Work has not started.
- Definition of Ready may still be incomplete.

IN PROGRESS

- Active implementation or remediation is underway.
- A branch, worktree, investigation, or migration may exist.

IN REVIEW

- A pull request is open or automated review is underway.

VERIFICATION

- Implementation is merged or deployed, but required validation remains.
- This may include user-owned browser UAT, signed-in visual checks, or an observation period.

BLOCKED

- A hard dependency, security problem, missing decision, credential issue, permission limitation, failed migration, or failed CI prevents safe completion.
- The blocker, owner, and required next action must be recorded.

DONE

- Acceptance criteria are satisfied.
- Required automated verification passed.
- Required deployment and migration evidence exists.
- Remaining manual checks are either completed or explicitly outside the task’s acceptance criteria.
- GitHub issue state and GitHub Project status are reconciled.

PRODUCTION RELEASED

- A separately authorized production promotion has completed.
- Production code, database migration, smoke verification, and monitoring evidence exist.

======================================================================
6. PHASE 0 — REQUEST INTERPRETATION
======================================================================

When the user requests implementation, first determine whether the request means:

- One exact roadmap task.
- The next eligible task.
- All remaining tasks in a wave.
- A complete wave, including deployment and verification.
- A fix or addition outside the current roadmap.

For an entire wave:

1. Enumerate every task in the wave.
2. Retrieve the live GitHub state for every task.
3. Identify closed, open, blocked, partially implemented, and mislabeled tasks.
4. Build a dependency graph.
5. Identify critical-path tasks.
6. Separate implementation tasks from verification and release tasks.
7. Identify open product decisions and external dependencies.
8. Select the first genuinely unblocked task.

Do not assume issue-number order is the implementation order.

======================================================================
7. PHASE 1 — DEFINITION OF READY
======================================================================

Before moving a task to In Progress, confirm:

[ ] The task objective is clear.
[ ] Acceptance criteria are specific and testable.
[ ] Dependencies are identified.
[ ] Required dependencies are complete or an exception is explicitly approved.
[ ] Applicable product decisions are resolved.
[ ] Affected roles and scopes are known.
[ ] Canonical data ownership is known.
[ ] Required statuses and events are known.
[ ] Required designs, IA, or workflow definitions exist.
[ ] The target repository, branch, Supabase project, and Vercel environment are known.
[ ] Required credentials are available through approved configuration.
[ ] No unresolved security incident blocks the work.
[ ] The task is small enough to implement and review safely.
[ ] Manual verification ownership is defined.

If the task fails this gate:

- Keep it Planned if it has not started.
- Mark it Blocked if action is prevented.
- Record the missing decision, dependency, owner, and next action.

7.1 Read-only confirmation provenance standard

A read-only confirmation is valid only when its evidence is traceable, typed, and machine-verifiable against an authoritative repository source, live GitHub issue, or actual non-secret live-state check.

The evidence document must use `evidenceContract: "semantic-provenance-v3"`. Before creating it, the agent must read `.github/TXKPRO_READONLY_CONFIRMATION_TEMPLATE.json` and `scripts/txkpro-confirmation-check.mjs`; schema guessing is not allowed.

Every evidence entry must contain:

- `source`: a specific authoritative repository path, GitHub issue identifier, or named live-state check.
- `finding`: the concrete fact observed or supported.
- Either `locator`: section, heading, field, route, config key, or equivalent source location; or `checkType`: the exact live-state/environment check.
- `assertion`:
  - `subject`: the exact thing being claimed.
  - `predicate`: one of the confirmation-specific predicates accepted by the validator.
  - `values`: the exact claimed value or values.
- `verification`: executable proof bound to the assertion.

For generic repository or GitHub issue text verification, the exact proof text must contain the assertion subject and every asserted value. Text that merely occurs in the same source but refers to a different domain may not prove the claim.

Examples of prohibited semantic extrapolation:

- `PROGRAM_STATUS` does not establish Course status.
- An Employer role definition does not establish a Course-management capability unless the capability itself is stated.
- Employer Profile ownership does not establish Employer Course/Lesson ownership.
- A UI authority statement does not establish an exact URL pattern.
- Presence of generic deployment credentials does not establish an invented SEO API credential.
- A generic Product Manager reference does not override the standing browser-UAT owner rule.

Rules:

- Do not convert a plausible interpretation into `CONFIRMED`.
- Do not invent statuses, events, roles, fields, routes, credentials, environment names, or UAT owners.
- Do not claim an environment, branch, staging target, or credential is available unless the relevant non-secret check succeeds.
- Do not print secret values; credential evidence proves presence/configuration only.
- If the source is missing, contradictory, or does not establish the exact typed assertion, classify the confirmation as `UNRESOLVED` or `BLOCKED`.
- An `INVALID` evidence document is not itself a blocked product candidate; the agent must read the validator error, continue read-only source gathering, and retry without asking the owner.
- Only `TXKPRO_CONFIRMATIONS_CONFIRMED` plus `TXKPRO_PLAN_CONTRACT_CONFIRMED` permits the agent to call the task next eligible.
- Sentinel strings found in arbitrary output are not proof. The runtime must verify the validator-generated result artifact against the selected candidate, evidence hash, validator hash, repository HEAD, contract versions, timestamp, and presentation digest.
- Candidate-specific categories must contain at least one assertion tied to the live issue's domain and use a category-appropriate predicate. Neighboring role, profile, status, event, or design-system evidence cannot complete a category.

7.2 Sourced implementation plan contract

The same evidence document must include:

`implementationPlan.contract: "sourced-plan-v1"`

The implementation plan is not allowed to silently introduce new technical/product decisions.

Every planned API route, database field, status, event, URL pattern, credential, and owner must be represented as a typed plan decision and must be either:

- `SOURCED`: linked to a specific confirmation evidence entry whose typed assertion/finding actually mentions that decision; or
- `PROPOSED`: labeled exactly `PROPOSED — requires product/technical decision`.

`implementationPlan.coverage` must classify each constrained kind as `DECISIONS` or `NOT_APPLICABLE`. Every `NOT_APPLICABLE` classification requires a concrete reason. A `SOURCED` decision name must exactly match the subject or a value in the referenced typed assertion.

A sourced item may not be generalized beyond the evidence it references. If an exact implementation detail is not supported by authoritative sources, it remains proposed and must not be presented as an approved requirement.

The validator generates the final canonical eligibility presentation and stores its digest in the result artifact. The runtime permits presentation only when the completion payload exactly matches that canonical text. It must not add extra routes, schema fields, statuses, events, URL structures, credentials, owners, UAT claims, or other implementation contracts outside the validated plan.

======================================================================
8. PHASE 2 — WAVE EXECUTION MANIFEST
======================================================================

For a multi-task wave, prepare an execution manifest containing:

- Wave name and release target.
- Every task and GitHub issue number.
- Current issue state and project status.
- Priority and critical-path flag.
- Dependencies and dependents.
- Product decisions.
- Expected migrations.
- Shared schema, route, and component surfaces.
- Tasks safe to implement independently.
- Tasks that must remain sequential.
- Required automated tests.
- Required manual UAT.
- Deployment order.
- Expected completion evidence.

The manifest is the operational checklist for the wave.

======================================================================
9. PHASE 3 — DEPENDENCY AND RISK GATE
======================================================================

Each dependency must be classified.

PROCEED

- The dependency is complete and its contract is stable.

PROCEED WITH EXPLICIT EXCEPTION

- Remaining work is limited to user-owned browser or visual verification.
- The dependent implementation can safely use stable database and API contracts.
- The task and wave status must continue to disclose the outstanding verification.

BLOCK

Block implementation or release when any of the following applies:

- Suspected credential exposure or required secret rotation.
- Cross-tenant or cross-institution access failure.
- Incorrect role authorization.
- Missing canonical schema or migration.
- Failed CI.
- Failed migration verification.
- Unresolved destructive data change.
- Missing material product, privacy, policy, or legal decision.
- Unstable prerequisite interface.
- Missing permission required to complete a protected action.

Risk levels:

LOW
- Copy, documentation, isolated presentation, or non-sensitive additive UI.

MEDIUM
- Scoped read models, navigation, reporting, additive schema, or workflow UI.

HIGH
- Authorization, credentials, privacy, destructive schema changes, identity, payments, public exposure, audit state, cross-tenant data, or irreversible actions.

High-risk changes require stronger negative testing, recovery planning, and explicit release evidence.

======================================================================
10. PHASE 4 — IMPLEMENTATION CONTRACT
======================================================================

Before writing code, translate the issue into a concrete contract.

10.1 User and scope contract

- Which roles may access the feature?
- At what institution, department, program, cohort, employer, student, or platform scope?
- Which roles may mutate data?
- Which roles receive read-only or aggregate access?
- What must remain hidden?

10.2 Data contract

- What record is canonical?
- Who owns it?
- What tables, functions, or views are affected?
- What data is derived?
- What data requires provenance?
- What retention, privacy, or consent rule applies?

10.3 Workflow contract

- What statuses are valid?
- What transitions are permitted?
- Which transitions require authorization?
- Which domain events are emitted?
- Which notifications and read models result from those events?
- What must be idempotent?

10.4 Interface contract

- Required routes and navigation.
- Required role-specific views.
- Required actions.
- Loading, empty, error, denied, success, and partial-data states.
- Responsive and accessibility behavior.
- Required source, actor, status, timestamp, or provenance display.

10.5 Verification contract

- Positive tests.
- Negative authorization tests.
- Migration tests.
- Typecheck, lint, and build.
- API or SQL staging checks.
- Manual UAT assigned to the user.
- Deployment evidence.
- Completion evidence.

10.6 Agent run usage contract

Every roadmap implementation run must be token/cost-budgeted and auditable in the GitHub issue.

Before mutation:

- Create or update the single issue comment marked `<!-- txkpro-agent-usage:v1 -->`.
- Assign a unique run ID and agent/session ID.
- Record the estimated cumulative model-token budget and expected range.
- Record complexity classification and configured Plan/Act models.
- Record warning, soft-budget, and escalation thresholds.
- The estimate is planning telemetry, not a hard promise and not authorization to weaken scope.

During the run:

- Track tool-call count, failed tool calls, and execution time where the agent runtime exposes them.
- Observe cumulative Cline/provider usage without placing raw per-request telemetry in GitHub.
- At warning/soft thresholds, reduce redundant repository rereads and repeated repair loops while preserving required verification.
- At escalation, explicitly check for circular debugging, repeated identical failures, or lack of measurable progress. If the run is genuinely stuck, stop safely and report the blocker.

After every run:

- Update the same issue comment with actual input and output tokens.
- Calculate total model tokens as input + output.
- Report cache reads/writes separately; do not double-count cache counters whose provider semantics are already included in input.
- Record provider/Cline-reported cost when available.
- Record estimate variance, outcome, tool counts, and cumulative issue totals.
- Successful, failed, blocked, and cancelled runs all require a post-run record when telemetry is available.
- Never fabricate actual usage or cost. If telemetry is unavailable, the run is not fully finalized until the telemetry source is reconciled or the missing telemetry is explicitly recorded as a blocker.

Canonical commands:

```bash
node scripts/txkpro-agent-usage.mjs start --issue <number> --task-id <Task ID> --cline-task-id <session>
node scripts/txkpro-agent-usage.mjs finish --cline-task-id <session> --outcome <outcome>
```

For Cline, repository hooks enforce this boundary for approved next-eligible implementation runs. Other coding agents must execute the same usage protocol explicitly.

======================================================================
11. PHASE 5 — ENVIRONMENT AND SECRET VALIDATION
======================================================================

Before implementation and again before deployment:

[ ] Confirm repository and branch.
[ ] Confirm staging Supabase project identifier.
[ ] Confirm staging Vercel project and environment.
[ ] Confirm required environment-variable names without displaying secret values.
[ ] Confirm secrets are server-only where required.
[ ] Check for expired, malformed, missing, or line-wrapped credentials.
[ ] Confirm secrets are not present in client code, logs, issues, comments, screenshots, or PR text.
[ ] Confirm third-party integration uses sandbox credentials in test environments.

Credential incident rule:

- Treat a credential included in diagnostic output or accessible logs as exposed.
- Stop affected release work.
- Record the exposure without reproducing the secret.
- Rotate through the authorized secret workflow.
- update the appropriate environment variable.
- Redeploy.
- Re-run protected access and log checks.

======================================================================
12. PHASE 6 — REPOSITORY PREPARATION
======================================================================

1. Inspect repository status and existing worktrees.
2. Preserve unrelated user changes.
3. Confirm the correct base branch and revision.
4. Synchronize with the latest staging branch.
5. Create a dedicated feature branch and worktree when appropriate.
6. Review applicable repository instructions.
7. Identify existing implementations before adding new systems.
8. Reuse canonical helpers, roles, statuses, components, and schemas.
9. Mark the issue In Progress.

Do not:

- Develop directly on staging.
- Reset or discard user changes.
- Introduce duplicate role, status, or event systems.
- Rewrite already-applied migrations.

======================================================================
13. PHASE 7 — IMPLEMENTATION ORDER
======================================================================

Implementation normally proceeds in this order.

13.1 Database and authorization

- Add incremental schema changes.
- Add constraints and foreign keys.
- Add only justified indexes.
- Enforce role and scope server-side.
- Configure RLS or tightly controlled server functions.
- Revoke unintended direct access.
- Grant only required execution or read permissions.
- Add audit behavior for sensitive mutations.

13.2 Canonical workflow logic

- Implement approved status transitions.
- Protect immutable or historical evidence.
- Add idempotency and unique constraints where needed.
- Use transactions for coupled state changes.
- Emit canonical domain events.
- Keep notifications and reports as consequences, not canonical state.

13.3 Read models and APIs

- Build narrowly scoped server-side queries or RPCs.
- Derive metrics from canonical records.
- Return only permitted fields.
- Paginate potentially large results.
- Use stable response types.
- Handle missing, denied, and partial-data cases.
- Avoid serializing private server data to the client.

13.4 User interface

- Use server-derived role and scope.
- Implement role-sensitive navigation and actions.
- Follow the TXKPRO UI Design System Standard.
- Use canonical statuses and labels.
- Display provenance for trust-critical evidence.
- Preserve the separation among Verified Skills, Employer Training, Company Badges, Employer Certifications, and self-attested information.
- Implement loading, empty, error, denied, success, and partial states.
- Support responsive layouts and accessibility semantics.

13.5 Documentation and support

- Update technical notes.
- Add operational instructions.
- Add Help Center content when the workflow affects users.
- Document remaining manual validation.
- Add release notes when appropriate.

======================================================================
14. PHASE 8 — MIGRATION SAFETY
======================================================================

Migration rules:

- Prefer additive, forward-only migrations.
- Do not destructively remove or rewrite data without explicit approval.
- Use a new corrective migration instead of editing an applied migration.
- Separate large backfills from schema creation when appropriate.
- Consider locks, execution time, and production volume.
- Preserve compatibility during rolling deployment when possible.
- Include explicit grants and revocations.
- Include constraints that protect invariants.
- Confirm the migration filename and order.
- Confirm the migration ledger after application.

For high-risk migrations:

- Confirm backup or recovery capability.
- Define rollback or forward-fix strategy.
- Test against representative data.
- Identify irreversible steps.
- Obtain explicit production authorization before applying to production.

======================================================================
15. PHASE 9 — IDEMPOTENCY, CONCURRENCY, AND FAILURE HANDLING
======================================================================

For every mutation, ask:

- What happens after a double-click?
- What happens when the request is retried?
- What happens when two users act concurrently?
- What happens when a webhook is delivered twice?
- What happens when an external provider succeeds but TXKPRO times out?
- What happens when only part of the transaction succeeds?

Use as appropriate:

- Unique constraints.
- Idempotency keys.
- Transactions.
- Conditional updates.
- Version or status preconditions.
- Retry-safe event handlers.
- Reconciliation jobs.
- Durable audit records.

======================================================================
16. PHASE 10 — TEST DATA AND FIXTURE CONTROL
======================================================================

Test data must:

- Belong to an authorized test institution, employer, or user.
- Avoid real production personal data.
- Be reproducible.
- Preserve demo accounts relied upon by the product.
- Be cleaned up after temporary mutation tests.
- Avoid altering published credentials or public pages unless the test explicitly requires it.
- Use rollback-only transactions where practical.

Record fixture assumptions in the verification evidence.

======================================================================
17. PHASE 11 — LOCAL VERIFICATION GATE
======================================================================

Before opening a PR, run all applicable checks.

Code quality:

[ ] Focused automated tests.
[ ] Typecheck.
[ ] Lint.
[ ] Production build.
[ ] Formatting or diff check.
[ ] React/Next.js quality review when applicable.
[ ] No unintended generated or unrelated files.

Authorization and privacy:

[ ] Authorized role succeeds.
[ ] Wrong role fails.
[ ] Wrong institution or tenant fails.
[ ] Wrong program/cohort/student scope fails.
[ ] Anonymous access fails where required.
[ ] Restricted fields are absent.
[ ] Sensitive mutations are auditable.

Database:

[ ] Migration parses and applies in the intended order.
[ ] Constraints protect canonical invariants.
[ ] Idempotency behavior is verified.
[ ] Test mutations are rolled back or cleaned up.
[ ] Relevant queries are reviewed for indexes and performance.

Security:

[ ] No secrets in source or output.
[ ] No client-side authorization trust.
[ ] No new public exposure of private data.
[ ] No assessment answer keys or private notes leaked.
[ ] No unbounded or overly broad server function.

The task cannot advance to merge with a failing required gate.

======================================================================
18. PHASE 12 — PERFORMANCE AND COST REVIEW
======================================================================

Review where applicable:

- Query plans and indexes.
- N+1 query patterns.
- Dashboard aggregation cost.
- Pagination and result limits.
- Function duration and timeout risk.
- Vercel execution limits.
- Supabase connection usage.
- Storage and bandwidth impact.
- Third-party rate limits.
- Caching behavior and authorization safety.
- Whether live aggregation should become a maintained read model.

Optimization must not weaken authorization or create competing canonical state.

======================================================================
19. PHASE 13 — PULL REQUEST AND CI
======================================================================

The PR must include:

- Roadmap task ID and issue reference.
- Summary of the implemented behavior.
- Roles and scopes affected.
- Authorization and privacy boundaries.
- Migration names and order.
- Test evidence.
- Known warnings or baseline advisor findings.
- Rollback or forward-fix notes.
- Manual UAT remaining.
- Whether the PR should close the issue.

CI must run the repository’s required checks, including as applicable:

- Dependency installation.
- Typecheck.
- Focused wave QA.
- Lint.
- Production build.
- Automated tests.
- Migration or schema checks.

If CI fails:

- Keep the issue In Progress or In Review.
- Diagnose and fix the failure on the feature branch.
- Do not merge until required checks pass.

======================================================================
20. PHASE 14 — TEST/STAGING DEPLOYMENT
======================================================================

After CI passes:

1. Merge the PR into staging.
2. Record the merge commit SHA.
3. Confirm Vercel receives the exact staging revision.
4. Confirm the deployment reaches the expected ready state.
5. Apply Supabase migrations in order.
6. Confirm the Supabase migration ledger.
7. Verify the application and database revisions are compatible.
8. Run direct SQL and API smoke checks.
9. Run positive and negative authorization checks.
10. Inspect runtime logs for new errors without exposing secrets.
11. Run Supabase security and performance advisors after DDL changes.
12. Distinguish existing baseline findings from task-specific regressions.

Do not run browser-based staging tests unless the user specifically asks.

======================================================================
21. PHASE 15 — MANUAL UAT HANDOFF
======================================================================

When browser or signed-in visual verification remains, provide a concise UAT checklist containing:

- Environment URL.
- User role or demo account required.
- Preconditions.
- Exact workflow steps.
- Expected result for each step.
- Mobile/responsive checks.
- Keyboard and focus checks.
- Light and dark theme checks where applicable.
- Privacy and wrong-role checks.
- Evidence the user should report, such as screenshot, error text, or failing step.

Status handling:

- Mark the task Verification if manual UAT is part of acceptance.
- Do not mark it Planned after implementation has already occurred.
- Do not mark the entire wave complete while required UAT remains incomplete.

======================================================================
22. PHASE 16 — OBSERVABILITY AND RELEASE SIGNALS
======================================================================

Define how failures will be detected:

- Runtime errors.
- Authorization denials.
- Unexpected cross-scope attempts.
- Failed database calls.
- Slow queries or timeouts.
- Failed scheduled jobs.
- Webhook failures.
- Duplicate events.
- Empty or inconsistent dashboards.
- Migration failures.
- External-provider errors.

Logs must be useful while excluding secrets, raw tokens, answer keys, and unnecessary personal information.

======================================================================
23. PHASE 17 — FEATURE FLAGS AND ROLLOUT
======================================================================

Use controlled rollout for high-risk or behavior-changing features when appropriate:

- Internal-only enablement.
- Specific institution or employer enablement.
- Server-controlled feature flag.
- Gradual percentage rollout.
- Kill switch.
- Rollback thresholds.

A merged feature does not need to become immediately available to every user.

======================================================================
24. PHASE 18 — GITHUB AND ROADMAP RECONCILIATION
======================================================================

After implementation and verification:

1. Add completion or verification evidence to the issue.
2. Update the issue state.
3. Update the GitHub Project status separately.
4. Confirm dependencies and dependents now reflect the new state.
5. Record remaining manual work, owner, and next action.
6. Select the next genuinely unblocked task.

Important GitHub behavior:

- “Closes #123” may not automatically close an issue when the PR merges into staging instead of the default branch.
- Therefore, issue closure must be verified and performed manually when appropriate.
- Closing the issue does not necessarily update the GitHub Project field.
- Both states must be checked.

Completion outcomes:

DONE
- All task acceptance criteria are met and tracking is synchronized.

VERIFICATION
- Implementation is deployed, but required manual or observation checks remain.

BLOCKED
- A hard blocker prevents completion. Record exact blocker, owner, and required action.

======================================================================
25. PHASE 19 — PRODUCTION PROMOTION
======================================================================

Test/staging deployment authority does not imply production authority.

Production promotion requires separate user authorization and the following gate:

[ ] Staging acceptance completed.
[ ] Required manual UAT completed.
[ ] Security blockers resolved.
[ ] Credential incidents resolved.
[ ] Production migration reviewed.
[ ] Backup or recovery capability confirmed for high-risk changes.
[ ] Rollback or forward-fix plan documented.
[ ] Release window selected when needed.
[ ] Monitoring signals identified.

Production sequence:

1. Confirm production authorization.
2. Confirm exact release commit.
3. Confirm production environment configuration.
4. Deploy application code using the approved release process.
5. Apply production migrations in the approved order.
6. Confirm the migration ledger.
7. Run limited, safe smoke verification.
8. Inspect runtime signals.
9. Confirm canonical workflows and authorization.
10. Roll back or forward-fix if release thresholds fail.

======================================================================
26. PHASE 20 — POST-RELEASE MONITORING
======================================================================

Observe the release for an appropriate period and confirm:

- Normal error rate.
- Expected authorization behavior.
- Expected event delivery.
- Expected scheduled-job behavior.
- Expected dashboard and report population.
- No duplicate or missing canonical events.
- No unexpected data exposure.
- No significant performance regression.

Open follow-up issues for non-blocking findings. Reopen or mark the task blocked if a release-critical defect is discovered.

======================================================================
27. EXTERNAL INTEGRATION CHECKLIST
======================================================================

For Supabase, Vercel, Twilio, email, SMS, payment, reward, or other providers, verify:

[ ] Test and production credentials are separated.
[ ] Webhook authenticity is verified.
[ ] Retries are safe.
[ ] Duplicate delivery is safe.
[ ] Timeouts and provider outages are handled.
[ ] Rate limits are respected.
[ ] Consent and communication policy are enforced.
[ ] Secrets are redacted.
[ ] Provider responses are sanitized.
[ ] TXKPRO can reconcile its state with provider state.
[ ] Provider events do not become unverified canonical truth without validation.

======================================================================
28. ACCESSIBILITY AND RESPONSIVE QA
======================================================================

Every user-facing workflow should be checked for:

- Keyboard access.
- Logical focus order.
- Visible focus.
- Screen-reader labels.
- Semantic headings and landmarks.
- Form labels and error association.
- Color contrast.
- Status meaning that does not rely on color alone.
- Mobile and narrow-screen behavior.
- Light and dark themes where supported.
- Loading, empty, error, denied, and success states.
- Reduced-motion behavior where applicable.

If the assistant is not performing browser staging checks, these items must appear in the manual UAT handoff.

======================================================================
29. DOCUMENTATION AND SUPPORT READINESS
======================================================================

Determine whether the release needs:

- Help Center article or update.
- Admin procedure.
- User onboarding copy.
- Release notes.
- Updated screenshots.
- Status explanation.
- Data export explanation.
- Troubleshooting guidance.
- Support escalation procedure.
- Internal operational checklist.

Documentation should ship with the workflow whenever users or administrators need it to operate the feature correctly.

======================================================================
30. ROLLBACK AND INCIDENT RESPONSE
======================================================================

When a deployment causes a critical failure:

1. Stop further promotion.
2. Classify the impact.
3. Protect credentials and data.
4. Disable the feature through a flag when available.
5. Roll back application code when safe.
6. Avoid reversing an applied database migration destructively unless explicitly planned and safe.
7. Prefer a corrective forward migration for database issues.
8. Verify canonical records remain consistent.
9. Record the incident without exposing secrets or personal data.
10. Re-run the complete affected verification path before resuming rollout.

Immediate blockers include:

- Cross-tenant exposure.
- Credential leakage.
- Corrupted canonical state.
- Incorrect credential, badge, skill, referral, hiring, placement, or retention evidence.
- Unauthorized mutation.
- Public exposure of private content.

======================================================================
31. REQUIRED COMPLETION REPORT
======================================================================

Every completed task or wave should end with a concise report containing:

- Task or wave implemented.
- Pull request number and URL.
- Merge commit.
- Branch merged into.
- CI result.
- Migrations applied.
- Staging deployment state.
- SQL/API verification performed.
- Authorization and privacy verification performed.
- Advisor or security findings.
- Manual UAT remaining.
- GitHub issue state.
- GitHub Project status.
- Known blockers or follow-up issues.
- Next eligible roadmap task.
- Agent run estimated token budget, actual token/cost usage, estimate variance, and cumulative issue usage.

Do not state “complete” without explaining whether that means:

- Implementation complete.
- Staging deployed.
- Verification complete.
- Wave release complete.
- Production released.

======================================================================
32. WAVE COMPLETION GATE
======================================================================

A wave may be declared complete only when:

[ ] Every required task is Done or explicitly removed by an approved decision.
[ ] Every hard dependency is complete.
[ ] Required migrations are applied to the intended environment.
[ ] Required CI checks are green.
[ ] Required authorization and privacy checks pass.
[ ] Required manual UAT is complete or explicitly outside the wave’s release criteria.
[ ] Security blockers are resolved.
[ ] Release evidence is recorded.
[ ] GitHub issues are reconciled.
[ ] GitHub Project statuses are reconciled.
[ ] Remaining findings are documented as separate follow-up work.

If any required item remains Blocked or in Verification, the wave is not release-complete.

======================================================================
33. RAPID DECISION RULES
======================================================================

If a dependency is open:
- Inspect whether it is truly incomplete or only incorrectly tracked.

If it is only incorrectly tracked:
- Reconcile the issue and project status before continuing.

If browser UAT is the only remaining work:
- Continue safe implementation when contracts are stable, but mark the release Verification and hand UAT to the user.

If a security issue remains:
- Block dependent release work.

If CI fails:
- Fix before merge.

If a staging migration fails:
- Stop, diagnose, and use a corrective migration. Do not conceal the failure by rewriting migration history.

If the task changes authorization:
- Add positive and negative server-side scope tests.

If the task changes canonical state:
- Validate statuses, transitions, idempotency, events, and audit behavior.

If the task adds a dashboard metric:
- Trace it to canonical records, enforce scope, document time windows, and keep external benchmarks separate.

If the task adds public content:
- Verify publication state, canonical URLs, metadata, redirects, and private-data exclusion.

If the user authorizes test deployment:
- Deploy to test/staging only. Do not infer production authorization.

======================================================================
34. STANDARD END-TO-END SEQUENCE
======================================================================

1. Interpret the requested task or wave.
2. Retrieve live issue and project status.
3. Read the roadmap row and authoritative requirements.
4. Build or refresh the dependency graph.
5. Run the Definition of Ready gate.
6. Classify dependencies and risk.
7. Define the implementation contract and evidence checklist.
8. Validate repository, environment, and secret boundaries.
9. Prepare a clean feature branch/worktree.
10. Implement database and authorization changes.
11. Implement canonical workflow logic.
12. Implement scoped read models and APIs.
13. Implement role-aware UI and states.
14. Add tests and documentation.
15. Run local verification gates.
16. Review performance, privacy, and security.
17. Open PR with complete evidence.
18. Wait for and resolve CI.
19. Merge into staging.
20. Confirm exact Vercel staging revision.
21. Apply Supabase staging migrations.
22. Verify migration ledger.
23. Run SQL/API/auth/log/advisor checks.
24. Hand browser/manual UAT to the user.
25. Set status to Verification, Blocked, or Done based on evidence.
26. Reconcile the GitHub issue and Project item.
27. Monitor the test release.
28. Select the next unblocked task.
29. Promote to production only after separate authorization and production gates.
30. Monitor production and record follow-up work.

======================================================================
35. FINAL OPERATING RULE
======================================================================

The assistant may move quickly, but it must not move invisibly.

Every implementation must make the following explicit:

- What was requested.
- What dependencies exist.
- What was implemented.
- What was verified.- What was deployed.
- What remains manual.
- What is blocked.
- What GitHub now says.
- What should happen next.

No roadmap task or wave should be declared complete merely because the code exists. Completion is an evidence-backed product, security, deployment, and tracking state.
