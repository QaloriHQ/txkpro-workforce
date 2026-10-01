# Claude Code Instructions — TXKPRO Workforce

Before any repository work, read and follow `AGENTS.md`.

The authoritative implementation governance document is:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Claude-specific behavior:
- Use the repository scripts defined in `AGENTS.md` for live source discovery, task context, preflight, wave manifests, protocol evidence, and completion reporting.
- Do not treat local filesystem absence as proof a repository source is missing; query the latest `origin/main`.
- Do not bypass Definition of Ready, dependency/risk gates, verification gates, staging/UAT distinctions, or production authorization.
- Do not mark or describe work as Done without protocol evidence accepted by the repository automation.
