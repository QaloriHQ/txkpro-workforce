# TXKPRO AI Agent Governance
## Chat orchestrator / Cline executor

For TXKPRO roadmap work, ChatGPT Chat mode is the orchestration and verification authority; Cline Act mode is the implementation executor. A valid TXKPRO_CHAT_IMPLEMENTATION_CONTRACT must pre-exist Cline Act and be bound to the run before repository mutation. Cline returns TXKPRO_CLINE_EXECUTION_RESULT; ChatGPT independently verifies the resulting branch/PR/CI against the contract before roadmap completion. See docs/governance/TXKPRO_CHAT_CLINE_ORCHESTRATION.md.


## Authority

The authoritative implementation process for TXKPRO Workforce is:

`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

`AGENTS.md` is the universal repository entry point that translates that protocol into mandatory instructions for coding agents.

Agent-specific files are adapters only. They may clarify how a tool should apply the protocol, but they may not weaken or override it.

## Supported agent adapters

- Cline: `.clinerules`
- OpenAI Codex / generic AGENTS-compatible agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Gemini CLI: `GEMINI.md`
- GitHub Copilot: `.github/copilot-instructions.md`
- Cursor: `.cursor/rules/txkpro-wave-protocol.mdc`
- Windsurf: `.windsurfrules`

Any other coding AI must be instructed to read `AGENTS.md` before acting in the repository.

## Shared execution commands

### Select the next eligible roadmap task

```bash
node scripts/roadmap-next-eligible.mjs --json
```

This is the canonical "what's next" command. It evaluates Planned candidates in Project order, automatically runs task context and protocol preflight, and skips candidates blocked by declared dependencies or automated Definition-of-Ready failures.

`roadmap-next-planned.mjs` returns only the earliest Planned **candidate**. It must not be described as eligible without the dependency/preflight gate.

After the selector returns a candidate, the agent must complete the returned read-only confirmations from authoritative sources. Read-only discovery/preflight does not require user approval; mutation does.

### Inspect one issue

```bash
node scripts/txkpro-task-context.mjs --issue <number> --json
```

### Run Definition of Ready / dependency preflight

```bash
node scripts/txkpro-preflight.mjs --issue <number>
```

### Build a wave manifest

```bash
node scripts/txkpro-wave-manifest.mjs --wave <W12>
```

### Validate completion evidence

```bash
node scripts/txkpro-protocol-check.mjs --evidence <path>
```

### Render the issue evidence comment

```bash
node scripts/txkpro-completion-report.mjs --evidence <path>
```

## Eligibility confirmation boundary

`roadmap-next-eligible.mjs` returns provisional candidates whose automated dependency/Definition-of-Ready gate passed. That result is not permission to mutate and is not yet a fully confirmed "next eligible" task.

Every coding AI must, in the same planning turn:

1. resolve affected roles/scopes;
2. resolve canonical data ownership/permitted fields;
3. resolve canonical statuses/events/transitions;
4. resolve applicable IA/design sources;
5. confirm target branch and staging environment configuration;
6. confirm required credential presence without exposing values;
7. confirm manual UAT ownership/requirements;
8. confirm no unresolved product/privacy/policy/legal blocker remains.

These checks are read-only and automatically authorized.

If a provisional candidate fails or cannot resolve one of these confirmations, the AI must continue to the next provisional candidate without asking for permission to continue analysis.

Only after all confirmations pass may the AI say:

```text
Next eligible task confirmed: <Task ID> / #<issue>
Automated Definition of Ready: PASS
Read-only confirmations: CONFIRMED
Mutation authorized: NO
```

The next step is then to present the implementation/verification plan and wait for explicit owner approval before mutation.

Machine-state invariant: **Prose cannot upgrade runtime state.** For Cline, only a structured `TXKPRO_CONFIRMATION_VALIDATION_RESULT` from the exact armed validator command may create `CONFIRMED_AWAITING_APPROVAL`. Both confirmation/plan success sentinels must belong to that same result and match the current provisional issue/Task ID. The persisted validator audit and sourced/proposed plan are authoritative; the owner-facing planning response is rendered deterministically from that state, and narrative prose may not add decisions or upgrade `PROPOSED`, `BLOCKED`, or `UNRESOLVED`.

Forbidden planning behavior includes:
- "Would you like me to gather the confirmation details?";
- "Mutation Allowed: Yes" before explicit approval;
- ending immediately after automated preflight PASS;
- treating a provisional candidate as fully eligible.

## Evidence-gated Project status automation

The GitHub workflow `.github/workflows/protocol-status.yml` listens for trusted issue comments containing the marker:

`<!-- txkpro-protocol-evidence:v1 -->`

The following transitions are automated only when the JSON evidence validates:

- `Verification`
- `Done`

`Done` also reconciles the issue state by closing the issue after the Project transition succeeds.

A manual issue closure does not prove `Done`. The normal roadmap-sync workflow intentionally no longer converts a closed issue to Done without protocol evidence.

## Credential separation

Coding agents may use the Codespaces `PROJECTS_TOKEN` for read-only roadmap queries.

GitHub Actions uses its own repository secret named `PROJECTS_TOKEN` for Project field updates. That Actions secret must have sufficient Projects write permission for the existing roadmap sync and protocol status workflows.

Do not expose the Project write credential to coding-agent prompts, logs, issue comments, or client-side code.

## Remote connector policy

Slack is the primary remote Cline transport for TXKPRO Workforce and runs in Socket Mode. Discord is a fallback transport.

Connector constraints never override the Wave Implementation Protocol. A response-size limit, truncation, timeout, or transport error is not permission to:
- skip dependency evaluation;
- skip Definition of Ready;
- skip authoritative-source review;
- downgrade `roadmap-next-eligible.mjs` to the candidate-only selector;
- label a Planned candidate eligible without the required checks.

The presentation may be shorter than the internal/read-only work, but protocol execution must remain complete.

Slack access is restricted by workspace/team ID and owner Slack user ID through `.devcontainer/slack-access-hook.sh`.

## Browser UAT

Browser/signed-in staging validation remains user-owned by default. Coding agents should continue non-browser staging validation and then hand off a precise UAT checklist unless the user explicitly requests browser testing.

## Production

No coding agent may infer production authorization from staging approval, a green CI run, a merged PR, a Project status, or a prior deployment. Production deployment and production database migrations require separate explicit user authorization.
