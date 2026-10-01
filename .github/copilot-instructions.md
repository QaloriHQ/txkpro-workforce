# GitHub Copilot Repository Instructions — TXKPRO Workforce

All code suggestions, edits, agent-mode tasks, and implementation plans must follow `AGENTS.md` and the authoritative `docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`.

Before implementing a roadmap issue, retrieve live issue/Project state and run the TXKPRO task-context/preflight scripts. For wave work, generate the wave manifest first.

Never:
- infer Project status from issue state alone;
- bypass dependencies or Definition of Ready;
- trust client/user-editable metadata for authorization;
- invent roles, statuses, events, data ownership, or UI conventions;
- claim Done merely because code was merged;
- deploy to production or apply production migrations without explicit user authorization.

Use structured protocol evidence for Verification/Done transitions.
