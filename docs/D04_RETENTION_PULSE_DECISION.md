# D-04: MVP1 retention pulse scope

Owner approved on October 4, 2026. Canonical decision issue: [#216](https://github.com/QaloriHQ/txkpro-workforce/issues/216).

MVP1 includes Student-only Day 30/60/90 retention pulses. Employer-side pulses are deferred to a separately approved pilot/backlog task. This resolves the optional Employer pulse decision for W12-07; it does not require rebuilding the deployed Student retention system.

## Requirements, permissions and verification

- Student SMS requires active retention consent and a mobile number; STOP prevents subsequent sends.
- Retention milestones, responses and human intervention cases remain separate canonical records. Employment-start confirmation remains separate from retention.
- Employers gain no access to private Student responses or internal case notes through this decision.
- A needs-help response opens a human case; it causes no automatic Employer or employment action.
- Existing role/scope restrictions remain in force. The private response/case/note tables remain unavailable through direct anonymous/authenticated table reads; authorized case access uses guarded RPCs.
- Existing verification: `scripts/wave12-retention-workspace-qa.mjs`, `scripts/sql/w12-07-retention-qa.sql`, and the Wave 10 integration's rollback verification documented in `docs/WAVE10_RETENTION_PRODUCTION_INTEGRATION.md`. This documentation change adds no runtime behavior.
- Controlled live-provider messaging/STOP acceptance remains W14-07 and owner-controlled. No SMS or email is sent during decision/tracking reconciliation.

Future Employer pulse work must define its consent, permitted fields, roles/scopes, events, delivery, retention and positive/negative tests in a separately approved issue before code changes.

## Roadmap reconciliation

- W10-12 canonical verification record: [#217](https://github.com/QaloriHQ/txkpro-workforce/issues/217). Historical CSV Complete is evidence to review, not permission to manufacture Done. Existing integration commit: `2201a2bf9479ad388820c8d67de7d46cf79ffbd5`.
- W12-01: [#34](https://github.com/QaloriHQ/txkpro-workforce/issues/34), implemented by merged PR #131 at `9952a04c23384b24bc426bdd13aa405d9d4e219d`. Project status requires separate protocol evidence; issue closure alone is insufficient.
- W12-07: [#40](https://github.com/QaloriHQ/txkpro-workforce/issues/40), implemented by merged PR #193. Its failed Verification transition can be rerun now that the option exists. Remaining owner UAT is documented in `docs/WAVE12_RETENTION_CASE_WORKSPACE.md`.

The historical W12-01 migration file was recovered from staging ledger version `20260928233244` (SQL MD5 `ce59f4f1477e0d55167e8cb156fafd9b`). Its previous source filename/version differed and had been edited after application. The ledger SQL is now preserved as applied; the already-applied `20261003171815_workforce_wave12_invitation_scope_approval_compatibility.sql` remains the forward scoped-approval overload. This repair applies no migration and changes no current database authorization policy.

No production migration/deployment is authorized by this decision. Verification and Done transitions use the existing protocol status gate.
