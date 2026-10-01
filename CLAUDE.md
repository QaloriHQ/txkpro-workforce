# Claude Code Instructions — TXKPRO Workforce

Before any repository work, read and follow `AGENTS.md`.

The authoritative implementation governance document is:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Claude-specific behavior:
- Use the repository scripts defined in `AGENTS.md` for live source discovery, dependency-aware next-eligible selection, task context, preflight, wave manifests, protocol evidence, and completion reporting.
- For "what's next" or equivalent requests, run `node scripts/roadmap-next-eligible.mjs --json`; do not describe the earliest Planned item as eligible before dependency and Definition-of-Ready checks pass.
- Continue all read-only discovery, task-context, dependency, source-review, and preflight work without asking the user for permission. Ask for explicit approval only before mutation.
- Do not treat local filesystem absence as proof a repository source is missing; query the latest `origin/main`.
- Do not bypass Definition of Ready, dependency/risk gates, verification gates, staging/UAT distinctions, or production authorization.
- Do not mark or describe work as Done without protocol evidence accepted by the repository automation.
