# Gemini CLI Instructions — TXKPRO Workforce

Read `AGENTS.md` before planning or modifying this repository.

Authoritative governance:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Use the shared TXKPRO scripts and evidence workflow described in `AGENTS.md`. For "what's next", run `node scripts/roadmap-next-eligible.mjs --json` and complete the returned read-only agent confirmations before calling a task eligible. Do not ask for permission to run read-only context, dependency, source-review, or preflight checks; approval is required only before mutation.

Agent-specific convenience or model behavior never overrides the protocol, canonical product sources, server-side authorization rules, dependency gates, or production authorization boundary.
