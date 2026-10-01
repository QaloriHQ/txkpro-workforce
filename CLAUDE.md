## TXKPRO orchestration boundary

For roadmap implementation, ChatGPT Chat mode owns orchestration/reasoning and post-run verification. Cline Act mode owns code-writing and execution only under a validated pre-existing TXKPRO_CHAT_IMPLEMENTATION_CONTRACT. Do not replace this separation with agent-specific planning or self-certification. See docs/governance/TXKPRO_CHAT_CLINE_ORCHESTRATION.md.

# Claude Code Instructions — TXKPRO Workforce

Before any repository work, read and follow `AGENTS.md`.

The authoritative implementation governance document is:
`docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Claude-specific behavior:
- Use the repository scripts defined in `AGENTS.md` for live source discovery, dependency-aware next-eligible selection, task context, preflight, wave manifests, protocol evidence, and completion reporting.
- For "what's next" or equivalent requests, run `node scripts/roadmap-next-eligible.mjs --json`; treat its result as provisional until every required read-only agent confirmation is resolved from authoritative sources.
- Continue all read-only discovery, task-context, dependency, source-review, preflight, confirmation resolution, and planning work in the same turn without asking the user for permission.
- If a provisional candidate fails a required confirmation, continue to the next provisional candidate automatically.
- Confirmation evidence must use `semantic-provenance-v3` with typed `assertion {subject,predicate,values}` plus machine-verifiable `verification`; generic proof text must contain the assertion subject and every asserted value. The same evidence file must include `implementationPlan.contract: sourced-plan-v1`, and every API route, database field, status, event, URL pattern, credential, and owner must be SOURCED or labeled `PROPOSED — requires product/technical decision`. Read the canonical template/validator instead of guessing.
- Never say `Mutation Allowed: Yes` or equivalent before explicit owner approval. Before approval, mutation authorization is always NO.
- Ask for explicit approval only after the next eligible task has been confirmed and the implementation plan is complete.
- For every implementation run, write the PRE-RUN estimated token/cost budget and POST-RUN actual usage to the issue using `scripts/txkpro-agent-usage.mjs`; do not claim the run finalized while required actual telemetry is missing.
- Do not treat local filesystem absence as proof a repository source is missing; query the latest `origin/main`.
- Do not bypass Definition of Ready, dependency/risk gates, verification gates, staging/UAT distinctions, or production authorization.
- Do not mark or describe work as Done without protocol evidence accepted by the repository automation.

- **Prose cannot upgrade runtime state.** For next-eligible planning, only the exact armed validator command's structured `TXKPRO_CONFIRMATION_VALIDATION_RESULT` may clear the gate. Use the persisted validator-derived `ownerFacingResponse` exactly; never add decisions or narratively upgrade `PROPOSED`, `BLOCKED`, or `UNRESOLVED`.
