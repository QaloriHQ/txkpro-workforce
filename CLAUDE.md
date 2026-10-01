# Claude Code Instructions — TXKPRO Workforce

Before any repository work, read and follow `AGENTS.md`.

The authoritative implementation governance document is:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Claude-specific behavior:
- Use the repository scripts defined in `AGENTS.md` for live source discovery, dependency-aware next-eligible selection, task context, preflight, wave manifests, protocol evidence, and completion reporting.
- For "what's next" or equivalent requests, run `node scripts/roadmap-next-eligible.mjs --json`; treat its result as provisional until every required read-only agent confirmation is resolved from authoritative sources.
- Continue all read-only discovery, task-context, dependency, source-review, preflight, confirmation resolution, and planning work in the same turn without asking the user for permission.
- If a provisional candidate fails a required confirmation, continue to the next provisional candidate automatically.
- Confirmation evidence must use `semantic-provenance-v2` with `source`, `finding`, `locator` or `checkType`, plus a supported machine-verifiable `verification` object. Read the canonical template/validator instead of guessing; invented findings, locators, environment state, statuses, events, credentials, and UAT owners are invalid.
- Never say `Mutation Allowed: Yes` or equivalent before explicit owner approval. Before approval, mutation authorization is always NO.
- Ask for explicit approval only after the next eligible task has been confirmed and the implementation plan is complete.
- For every implementation run, write the PRE-RUN estimated token/cost budget and POST-RUN actual usage to the issue using `scripts/txkpro-agent-usage.mjs`; do not claim the run finalized while required actual telemetry is missing.
- Do not treat local filesystem absence as proof a repository source is missing; query the latest `origin/main`.
- Do not bypass Definition of Ready, dependency/risk gates, verification gates, staging/UAT distinctions, or production authorization.
- Do not mark or describe work as Done without protocol evidence accepted by the repository automation.
