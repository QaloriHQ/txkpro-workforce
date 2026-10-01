# TXKPRO Workforce — AI Coding Agent Governance

This file is the mandatory entry point for every coding AI, CLI agent, IDE assistant, automation, and human contributor operating in this repository.

## Authoritative implementation protocol

All roadmap work is governed by:

`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

That document is the authoritative repository governance source for TXKPRO Workforce roadmap waves, tasks, fixes, migrations, integrations, and releases.

No agent-specific instruction file may weaken, bypass, or silently reinterpret the protocol.

## Required source order

Before implementation, use the source-of-truth order defined by the protocol:

1. Live GitHub issue and GitHub Project item.
2. Live roadmap metadata and dependencies.
3. `docs/product-sources/core/TXKPRO_WORKFORCE_MVP1_PRD.txt`
4. `docs/product-sources/core/TXKPRO_WORKFORCE_MVP1_TRD.txt`
5. `docs/product-sources/core/TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt`
6. `docs/product-sources/core/TXKPRO_ROLE_PERMISSIONS_MATRIX.txt`
7. `docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt`
8. `docs/product-sources/core/TXKPRO_CROSS_APP_EVENT_MAP.txt`
9. Applicable IA/user-flow sources under `docs/product-sources/ui/`.
10. `docs/product-sources/ui/UI_DESIGN_SYSTEM_STANDARD.txt`.
11. Current repository, staging database, and deployed environment.

If sources materially conflict, stop and record a product decision/blocker instead of inventing behavior.

## Live repository and roadmap

The local Codespace may lag behind GitHub or contain unrelated work. For discovery, refresh/read the live remote without mutating the working tree:

```bash
node scripts/repo-latest.mjs status
node scripts/repo-latest.mjs find "<path or term>"
node scripts/repo-latest.mjs grep "<regex>"
node scripts/repo-latest.mjs read "<path>"
```

The canonical roadmap is GitHub Projects v2 Project #1 owned by GitHub user `QaloriHQ` for repository `QaloriHQ/txkpro-workforce`.

For the earliest Planned candidate only:

```bash
node scripts/roadmap-next-planned.mjs --json
```

That command does **not** prove eligibility.

For "what's next", "next eligible task", or equivalent requests, automatically run the dependency-aware selector:

```bash
node scripts/roadmap-next-eligible.mjs --json
```

It evaluates Planned candidates in canonical Project order and automatically runs task context plus protocol preflight until the first candidate passes the automated dependency/Definition-of-Ready gate.

The selector returns **provisional candidates**, not a fully eligible task. A provisional candidate has passed only the automated dependency/Definition-of-Ready gate.

Immediately after the selector returns, in the **same planning turn**, resolve every read-only `agentConfirmationsRequired` item by inspecting the live issue, authoritative repository sources, repository configuration, and available non-secret environment state. Do not ask the user whether to proceed with these checks.

Required confirmations are:
- affected roles and scopes;
- canonical data ownership and permitted fields;
- canonical statuses/events and allowed transitions;
- applicable IA/design sources for user-facing work;
- target branch, staging Supabase project, and staging Vercel environment;
- required credential availability without printing secret values;
- manual verification owner and UAT requirements;
- unresolved product/privacy/policy/legal blockers.

Only after all required confirmations are resolved positively may the agent state **next eligible task confirmed**.

If a provisional candidate fails or cannot resolve a required confirmation from authoritative sources, classify that confirmation as blocked/unresolved and continue automatically to the next provisional candidate returned by the selector. Do not ask the user for permission to continue read-only analysis.

Before explicit owner approval:
- `Automated Definition of Ready` may be PASS.
- `Read-only confirmations` may become CONFIRMED.
- `Next eligible task` may be CONFIRMED.
- `Mutation authorized` must remain **NO**.

Never report `Mutation Allowed: Yes`, `Mutation Authorized: Yes`, or equivalent before explicit owner approval.

Never infer roadmap status from issue state alone. Never call an earliest-Planned or automated-gate-only candidate "next eligible" before all read-only confirmations pass.

## Connector and message-length invariant

Chat transport constraints must never change execution of the TXKPRO protocol.

- Complete required read-only roadmap discovery, dependency checks, source review, Definition of Ready, preflight, and implementation planning even when the active chat surface has a short message limit.
- Shorten presentation, not protocol execution.
- Prefer Slack threads for long responses.
- If a connector cannot fit the entire response in one message, split/continue the response when supported or provide a concise decision summary while preserving all required checks internally.
- Never fall back from `roadmap-next-eligible.mjs` to a simpler candidate-only answer merely because a connector times out or has a message-length limit.
- `roadmap-next-eligible.mjs` is optimized to use one canonical Project snapshot (plus only the evidence-comment reads actually required for dependencies already in Verification). Do not emulate it by repeatedly calling task-context/preflight for every candidate.
- If the selector itself fails or times out, report the exact execution failure and diagnose it. Do **not** substitute `roadmap-next-planned.mjs`, a manual Project guess, or a recommendation that the user check the board.
- A transport/command timeout is an execution problem, not permission to bypass dependencies or call a Planned candidate eligible.

## Mandatory preflight

Before writing code for a roadmap issue:

```bash
node scripts/txkpro-task-context.mjs --issue <number> --json
node scripts/txkpro-preflight.mjs --issue <number>
```

For a multi-task wave:

```bash
node scripts/txkpro-wave-manifest.mjs --wave <WAVE>
```

Do not mutate implementation files until Definition of Ready passes or an explicit protocol exception is approved.

## ChatGPT Chat → Cline Act separation of duties

Normal TXKPRO roadmap implementation uses docs/governance/TXKPRO_CHAT_CLINE_ORCHESTRATION.md.

- ChatGPT Chat mode owns roadmap selection, source review, reasoning, confirmation, implementation decisions, contract construction, and post-implementation verification.
- Cline Act mode is an executor. It writes code, runs commands/tests, and returns structured execution evidence only after a pre-existing ChatGPT implementation contract is validated.
- Cline may execute a decision; Cline may not create a product or technical decision during execution.
- Cline may not call a task verification complete, advance roadmap state, or replace ChatGPT verification with its own prose.
- A direct Cline implementation request must resolve an owner-authored issue comment containing <!-- txkpro-chat-implementation-contract:v1 --> and a valid TXKPRO_CHAT_IMPLEMENTATION_CONTRACT before mutation starts.
- Before Cline completion, validate TXKPRO_CLINE_EXECUTION_RESULT with scripts/txkpro-cline-execution-check.mjs. The resulting state remains RUN_COMPLETE_AWAITING_CHAT_VERIFICATION.
- Cline What's next? reasoning is disabled by default. TXKPRO_ALLOW_LEGACY_CLINE_ORCHESTRATION=true is compatibility/emergency only.

## Planning and approval

Default to planning/analysis before mutation.

The plan must identify:
- requested task/wave;
- dependencies and their classification;
- risk level;
- affected roles/scopes;
- canonical data and status/event contracts;
- expected migrations;
- API/UI surfaces;
- positive and negative verification;
- deployment/UAT requirements;
- blockers or unresolved product decisions.

Read-only discovery, task-context lookup, source review, dependency classification, Definition-of-Ready checks, preflight, required agent confirmations, and plan construction are automatically authorized and must continue without asking the user for permission.

The agent must not end a planning turn with "Would you like me to gather the confirmation details?" or equivalent. Gathering those details is part of mandatory read-only planning.

Explicit user approval is required before mutation when the active agent supports a plan/act boundary.

Production deployment and production database migrations always require separate explicit user authorization.

## Deterministic confirmation gate

For `What's next?` / next-eligible planning, prompt text alone is not the enforcement mechanism. ChatGPT Chat mode is the normal orchestrator. The Cline confirmation runtime below is retained as a hardened compatibility/recovery path and is disabled by default unless `TXKPRO_ALLOW_LEGACY_CLINE_ORCHESTRATION=true`.

The legacy Cline path uses workspace lifecycle hooks under `.cline/hooks/` plus the validator:

```bash
node scripts/txkpro-confirmation-check.mjs --evidence <path>
```

When the legacy Cline orchestration path is explicitly enabled, before Cline may ask a follow-up question or attempt task completion for a next-eligible request, the validator must return both:

```text
TXKPRO_CONFIRMATIONS_CONFIRMED
TXKPRO_PLAN_CONTRACT_CONFIRMED
```

The temporary evidence JSON must use `evidenceContract: "semantic-provenance-v3"` and include all eight required confirmations with:
- `status: "CONFIRMED"`;
- the selected issue number and Task ID;
- at least one machine-verifiable provenance object for each confirmation;
- `source`: the specific authoritative repository file, live GitHub issue reference, or named live-state check;
- `finding`: the concrete fact actually supported or observed;
- either `locator` (section, heading, field, route, config key, etc.) or `checkType`;
- typed `assertion` with `subject`, confirmation-specific `predicate`, and exact `values`;
- `verification`: an executable proof bound to that assertion. Generic source/issue text proof must contain the assertion subject and every asserted value.

The same evidence JSON must also include `implementationPlan.contract: "sourced-plan-v1"`. Every API route, database field, status, event, URL pattern, credential, and owner in the implementation plan must be either:
- `SOURCED` from a specific confirmation evidence entry that actually mentions the decision; or
- labeled exactly `PROPOSED — requires product/technical decision`.

Before writing evidence, read `.github/TXKPRO_READONLY_CONFIRMATION_TEMPLATE.json` and `scripts/txkpro-confirmation-check.mjs`; do not guess the schema. Plain strings, vague labels, invented locators/findings, semantic extrapolation, assumed environment/credential state, and fabricated statuses/events/UAT owners are invalid. A plausible statement is not confirmation. If the cited source or executable check does not establish the fact, use `BLOCKED` or `UNRESOLVED`; never manufacture a positive confirmation.

If any confirmation is `BLOCKED` or `UNRESOLVED`, validation returns `TXKPRO_CONFIRMATIONS_BLOCKED`; the agent must continue automatically to the next provisional candidate and keep mutation authorization at NO.

The runtime hook gate blocks premature `attempt_completion`, `ask_followup_question`, and mode switching while confirmation evidence is pending.

### Machine-state authority

**Prose cannot upgrade runtime state.** The selector can only create a provisional candidate. `CONFIRMED_AWAITING_APPROVAL` may be written only from a parseable `TXKPRO_CONFIRMATION_VALIDATION_RESULT` emitted by the exact armed validator invocation, with matching issue/Task ID, `semantic-provenance-v3`, `sourced-plan-v1`, both success sentinels, a valid validation ID/evidence digest, all eight confirmation audits, and the validated plan. Arbitrary output that merely contains sentinel strings is ignored.

After the gate clears, the owner-facing planning response is a deterministic runtime artifact. Cline must submit exactly the persisted `ownerFacingResponse`; it may not add, remove, rename, or upgrade API routes, database fields, statuses, events, URL structures, credentials, owners, or other implementation decisions. `PROPOSED — requires product/technical decision`, `BLOCKED`, and `UNRESOLVED` are machine states and cannot be converted by narrative prose.

## Required "what's next" response contract

After all read-only confirmation work is complete, respond using this state model:

```text
Next eligible task confirmed: <Task ID> / #<issue>
Automated Definition of Ready: PASS
Read-only confirmations: CONFIRMED
Mutation authorized: NO
```

Then provide:
- dependency summary;
- risk;
- confirmation evidence/results;
- implementation contract/plan;
- verification and UAT plan;
- blockers/follow-ups, if any.

End with a mutation boundary such as:

```text
Awaiting explicit owner approval to implement <Task ID>.
```

Do not ask permission for additional read-only analysis that the protocol already requires.

## Agent run token/cost telemetry

Every roadmap implementation run must maintain one auditable usage record in its GitHub issue using the marker `<!-- txkpro-agent-usage:v1 -->`.

Before mutation begins:

```bash
node scripts/txkpro-agent-usage.mjs start \
  --issue <number> \
  --task-id <Task ID> \
  --cline-task-id <agent/session id>
```

The PRE-RUN record must contain:
- run ID and agent/session ID;
- estimated cumulative model tokens;
- expected token range and complexity class;
- warning, soft-budget, and escalation thresholds;
- configured Plan and Act models.

After every run — successful, failed, cancelled, blocked, or interrupted when telemetry is available — synchronize actual usage before the agent claims the run complete:

```bash
node scripts/txkpro-agent-usage.mjs finish \
  --cline-task-id <agent/session id> \
  --outcome <outcome>
```

The POST-RUN record must contain:
- input and output tokens;
- total model tokens as input + output;
- cache reads/writes separately so provider cache counters are not double-counted;
- provider-reported/Cline-recorded cost when available;
- tool calls, failed tool calls, and tool execution time;
- estimate variance and outcome;
- cumulative issue usage across runs.

GitHub stores the per-run summary only. Raw per-request provider telemetry stays in the local/provider telemetry source.

Cline runtime hooks automatically create the PRE-RUN record after explicit approval for a confirmed next-eligible task, observe active runs, and block normal completion until POST-RUN actuals are synchronized. Other agents must call the same script explicitly.

Budget thresholds are observability controls, not permission to weaken scope or skip verification. Crossing a warning/soft threshold should reduce redundant reads and repeated repair loops. Crossing the escalation threshold requires checking for circular debugging, repeated identical failures, or lack of measurable progress; stop safely and report a blocker when the run is genuinely stuck.

Never fabricate token counts or cost. If actual telemetry cannot be read, record/report that telemetry is unavailable and resolve the telemetry source before claiming the run fully finalized.

## Implementation rules

- Preserve unrelated user changes.
- Do not develop directly on `staging`.
- Prefer small, reviewable, reversible changes.
- Use additive, forward-only migrations.
- Never edit an already-applied migration.
- Enforce role + scope server-side.
- Never trust user-editable metadata for authorization.
- Use only canonical statuses/events.
- Keep notifications/reports/read models as consequences of canonical state.
- Preserve evidence separation among Verified Skills, Employer Training, Company Badges, Employer Certifications, and self-attested evidence.
- Never create an opaque hiring/employability score.
- Keep secrets, answer keys, private notes, tokens, and unnecessary personal data out of client bundles, logs, issues, PR descriptions, and generated artifacts.
- For UI work, read `docs/product-sources/ui/README.md` and the authoritative design-system standard before implementation.

## Verification gate

Before a PR is ready to merge, run all applicable focused tests plus:

```bash
npm run typecheck
npm run lint
npm run build
```

Authorization-changing work requires positive and negative server-side scope tests.

Canonical-state-changing work requires status-transition, idempotency, event, and audit verification.

Migration work requires migration order/ledger/constraint evidence.

## Staging and UAT

After required CI passes, approved work may be merged/deployed to test/staging and validated with SQL, APIs, logs, deployment status, migration records, and advisor tools.

Do not spend time on browser-based staging validation unless the user explicitly asks. When browser, signed-in, visual, responsive, keyboard/focus, or theme validation remains, hand the user a precise manual UAT checklist and use Project Status `Verification` when that validation is part of acceptance.

## Protocol evidence and Project status automation

Project transitions to `Verification` or `Done` are evidence-gated.

Create an evidence JSON document using the schema/template in:

- `.github/txkpro-protocol-evidence.schema.json`
- `.github/TXKPRO_PROTOCOL_EVIDENCE_TEMPLATE.json`

Validate it:

```bash
node scripts/txkpro-protocol-check.mjs --evidence <path>
```

Render/post the completion report:

```bash
node scripts/txkpro-completion-report.mjs --evidence <path> > /tmp/txkpro-comment.md
gh issue comment <issue-number> --repo QaloriHQ/txkpro-workforce --body-file /tmp/txkpro-comment.md
```

The repository automation will only advance the GitHub Project to `Verification` or `Done` when the structured evidence satisfies the protocol. `Done` also reconciles the GitHub issue state.

Do not manually close an issue as a substitute for protocol evidence.

## Completion language

Never say only "complete."

State which level is complete:
- implementation complete;
- staging deployed;
- verification complete;
- wave release complete;
- production released.

Every completion report must disclose:
- task/wave;
- PR and merge commit;
- branch merged into;
- CI result;
- migrations;
- staging deployment state;
- SQL/API/auth/privacy verification;
- advisor/security findings;
- manual UAT remaining;
- issue state;
- Project status;
- blockers/follow-ups;
- next eligible roadmap task.
