# GitHub Copilot Repository Instructions — TXKPRO Workforce

All code suggestions, edits, agent-mode tasks, and implementation plans must follow `AGENTS.md` and the authoritative `docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`.

For "what's next" or equivalent requests, run `node scripts/roadmap-next-eligible.mjs --json`. The earliest Planned item is only a candidate; dependency classification and Definition-of-Ready preflight must pass before it may be described as eligible.

Before implementing a roadmap issue, retrieve live issue/Project state and run the TXKPRO task-context/preflight scripts. For wave work, generate the wave manifest first. Read-only discovery, dependency checks, source review, and preflight are automatically authorized; request approval only before mutation.

Never:
- infer Project status from issue state alone;
- call an earliest-Planned candidate eligible before protocol preflight;
- bypass dependencies or Definition of Ready;
- trust client/user-editable metadata for authorization;
- invent roles, statuses, events, data ownership, or UI conventions;
- claim Done merely because code was merged;
- deploy to production or apply production migrations without explicit user authorization.

Use structured protocol evidence for Verification/Done transitions.
