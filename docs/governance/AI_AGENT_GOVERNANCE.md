# TXKPRO AI Agent Governance

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

## Browser UAT

Browser/signed-in staging validation remains user-owned by default. Coding agents should continue non-browser staging validation and then hand off a precise UAT checklist unless the user explicitly requests browser testing.

## Production

No coding agent may infer production authorization from staging approval, a green CI run, a merged PR, a Project status, or a prior deployment. Production deployment and production database migrations require separate explicit user authorization.
