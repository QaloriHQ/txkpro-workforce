## TXKPRO orchestration boundary

For roadmap implementation, ChatGPT Chat mode owns orchestration/reasoning and post-run verification. Cline Act mode owns code-writing and execution only under a validated pre-existing TXKPRO_CHAT_IMPLEMENTATION_CONTRACT. Do not replace this separation with agent-specific planning or self-certification. See docs/governance/TXKPRO_CHAT_CLINE_ORCHESTRATION.md.

# Gemini CLI Instructions — TXKPRO Workforce

Read `AGENTS.md` before planning or modifying this repository.

Authoritative governance:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Use the shared TXKPRO scripts and evidence workflow described in `AGENTS.md`. For "what's next", run `node scripts/roadmap-next-eligible.mjs --json`, then immediately resolve every returned read-only agent confirmation from authoritative sources in the same planning turn. Do not ask whether to gather those details. Each confirmation must use `semantic-provenance-v3` with typed `assertion {subject,predicate,values}` plus machine-verifiable `verification`; generic proof text must contain the assertion subject and every asserted value. Also build `implementationPlan.contract: sourced-plan-v1`; every API route, database field, status, event, URL pattern, credential, and owner must be SOURCED or labeled `PROPOSED — requires product/technical decision`. Read the canonical template/validator and do not infer or assume confirmations. If a provisional candidate fails a required confirmation, continue to the next provisional candidate automatically. Only after confirmations pass may the task be called next eligible. Mutation authorization remains NO until explicit owner approval.

Every implementation run must use `scripts/txkpro-agent-usage.mjs` to record a PRE-RUN estimate in the GitHub issue before mutation and POST-RUN actual token/cost usage before completion. Never fabricate unavailable telemetry.

Agent-specific convenience or model behavior never overrides the protocol, canonical product sources, server-side authorization rules, dependency gates, or production authorization boundary.

Prose cannot upgrade runtime state. Only the exact armed validator command's structured `TXKPRO_CONFIRMATION_VALIDATION_RESULT` may clear the next-eligible gate, and the final planning response must exactly use the persisted validator-derived `ownerFacingResponse`; do not add decisions or upgrade `PROPOSED`, `BLOCKED`, or `UNRESOLVED`.
