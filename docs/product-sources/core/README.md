# TXKPRO Canonical Product Sources

These files mirror the canonical TXKPRO Workforce product/domain sources needed by repository-based coding agents.

## Governance

The authoritative implementation process is:

- `../../governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md`

Every coding agent must follow `/AGENTS.md`, which makes that protocol mandatory.

## Product/domain source hierarchy

After the live GitHub issue/Project item and roadmap metadata, use these canonical sources:

1. `TXKPRO_WORKFORCE_MVP1_PRD.txt`
2. `TXKPRO_WORKFORCE_MVP1_TRD.txt`
3. `TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt`
4. `TXKPRO_ROLE_PERMISSIONS_MATRIX.txt`
5. `TXKPRO_STATUS_DICTIONARY.txt`
6. `TXKPRO_CROSS_APP_EVENT_MAP.txt`
7. Applicable IA/user-flow sources in `../ui/`
8. `../ui/UI_DESIGN_SYSTEM_STANDARD.txt`
9. Current repository, staging database, and deployed environment

The live GitHub Project remains authoritative for current task status, sequence, and dependency reconciliation. These source files define intended product/domain behavior; existing code or database behavior must not silently override them.

## Conflict rule

If authoritative sources materially conflict, stop and record the conflict as a product decision/blocker. Do not invent or silently reconcile behavior.
