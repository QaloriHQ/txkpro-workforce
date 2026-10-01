# GitHub Copilot Repository Instructions — TXKPRO Workforce

All code suggestions, edits, agent-mode tasks, and implementation plans must follow `AGENTS.md` and the authoritative `docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`.

For "what's next" or equivalent requests, run `node scripts/roadmap-next-eligible.mjs --json`. The earliest Planned item is only a candidate; dependency classification and Definition-of-Ready preflight must pass before it may be described as eligible.

Before implementing a roadmap issue, retrieve live issue/Project state and run the TXKPRO task-context/preflight scripts. For wave work, generate the wave manifest first. Read-only discovery, dependency checks, source review, preflight, required confirmation resolution, and plan construction are automatically authorized and must continue in the same turn. Do not ask the user whether to gather confirmation details. Request approval only after the next eligible task is confirmed and immediately before mutation.

Every roadmap implementation run must record estimated token/cost usage before mutation and actual token/cost usage after the run using `scripts/txkpro-agent-usage.mjs`; the issue summary is cumulative across runs.

Never:
- infer Project status from issue state alone;
- call an earliest-Planned or automated-gate-only candidate eligible before all required read-only confirmations pass;
- report mutation as allowed/authorized before explicit owner approval;
- bypass dependencies or Definition of Ready;
- trust client/user-editable metadata for authorization;
- invent roles, statuses, events, data ownership, or UI conventions;
- claim Done merely because code was merged;
- deploy to production or apply production migrations without explicit user authorization.

Use structured protocol evidence for Verification/Done transitions.
