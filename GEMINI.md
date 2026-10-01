# Gemini CLI Instructions — TXKPRO Workforce

Read `AGENTS.md` before planning or modifying this repository.

Authoritative governance:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Use the shared TXKPRO scripts and evidence workflow described in `AGENTS.md`. For "what's next", run `node scripts/roadmap-next-eligible.mjs --json`, then immediately resolve every returned read-only agent confirmation from authoritative sources in the same planning turn. Do not ask whether to gather those details. Each confirmation must use structured provenance objects with `source`, `finding`, and either `locator` or `checkType`; do not infer or assume confirmations. If a provisional candidate fails a required confirmation, continue to the next provisional candidate automatically. Only after confirmations pass may the task be called next eligible. Mutation authorization remains NO until explicit owner approval.

Every implementation run must use `scripts/txkpro-agent-usage.mjs` to record a PRE-RUN estimate in the GitHub issue before mutation and POST-RUN actual token/cost usage before completion. Never fabricate unavailable telemetry.

Agent-specific convenience or model behavior never overrides the protocol, canonical product sources, server-side authorization rules, dependency gates, or production authorization boundary.
