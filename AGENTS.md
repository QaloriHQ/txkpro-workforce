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

For the next eligible task:

```bash
node scripts/roadmap-next-planned.mjs --json
```

Never infer roadmap status from issue state alone.

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

Explicit user approval is required before mutation when the active agent supports a plan/act boundary.

Production deployment and production database migrations always require separate explicit user authorization.

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
