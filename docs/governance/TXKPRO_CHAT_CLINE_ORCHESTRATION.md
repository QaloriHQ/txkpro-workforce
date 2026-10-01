# TXKPRO Chat Orchestrator → Cline Executor Protocol

## Purpose

TXKPRO roadmap implementation uses an explicit separation of duties:

- ChatGPT Chat mode is the orchestration and reasoning authority.
- Cline Act mode is the constrained code-writing and command-execution authority.
- ChatGPT Chat mode verifies the resulting implementation before roadmap completion or status advancement.

Cline may execute a decision, but Cline may not create a product or technical decision during execution.

## Required flow

1. ChatGPT Chat mode reads the live roadmap, issue, dependencies, governance sources, product sources, and repository state.
2. ChatGPT resolves Definition of Ready and read-only confirmation evidence.
3. ChatGPT produces the implementation plan and resolves every implementation decision as sourced or explicitly owner-approved.
4. ChatGPT publishes an owner-authored GitHub issue comment containing the marker: <!-- txkpro-chat-implementation-contract:v1 -->
5. The comment contains a TXKPRO_CHAT_IMPLEMENTATION_CONTRACT with a valid content-bound contractId.
6. The owner invokes Cline Act with the exact Task ID and/or issue number.
7. Before Cline can enter an implementation run, the Cline runtime resolves and validates the pre-existing ChatGPT contract.
8. Cline executes only the contract scope. It may not re-select roadmap work, reinterpret requirements, invent routes/statuses/events/fields/credentials/owners, or silently broaden allowed paths.
9. If execution cannot proceed exactly as contracted, Cline returns BLOCKED; it does not improvise.
10. Before Cline may finish normally, it writes a TXKPRO_CLINE_EXECUTION_RESULT and validates it with: node scripts/txkpro-cline-execution-check.mjs --result <path> --contract <path>
11. Cline completion remains pending ChatGPT verification.
12. ChatGPT Chat mode independently checks branch/PR/diff/CI evidence against the original contract. Only ChatGPT verification plus existing protocol evidence may support roadmap status advancement.

## Contract storage and trust boundary

The implementation contract is transferred through the roadmap issue as an owner-authored GitHub comment. The runtime accepts only a comment authored by the configured roadmap owner and validates the contract hash before Cline Act starts.

This is an operational separation-of-duties boundary, not a cryptographic identity proof that distinguishes every client using the owner's GitHub credential. The runtime additionally requires the contract to pre-exist Cline Act, binds the run to its content hash, constrains known file-edit tools to allowedPaths, validates the execution result against the same contract, and prevents Cline from declaring roadmap completion.

## Chat implementation contract

Use .github/TXKPRO_CHAT_IMPLEMENTATION_CONTRACT_TEMPLATE.json. Required properties include issue/Task ID, confirmation validation ID/evidence digest, sourced-plan-v1, exact allowed repository paths, exact implementation steps, resolved decisions only (SOURCED or OWNER_APPROVED), verification commands, false production boundaries, and a SHA-256 contractId computed over canonical contract content excluding contractId.

Unresolved PROPOSED decisions are not executable. ChatGPT must resolve them with authoritative support or explicit owner decision before publishing an execution-ready contract.

## Cline execution result

Use .github/TXKPRO_CLINE_EXECUTION_RESULT_TEMPLATE.json. For IMPLEMENTED, every changed path must match scope.allowedPaths, every contract verification command must PASS with exit code 0, deviations must be empty, and production deployment/migration must remain false. For BLOCKED, at least one blocker is required. Cline must stop rather than substitute a different decision or broaden scope. The validated Cline result is implementation evidence, not final verification.

## Cline requests for roadmap reasoning

By default, Cline is not permitted to answer What's next?, select the next eligible task, or construct a new roadmap implementation plan. The Cline hook returns an executor-only handoff message directing the owner to ChatGPT Chat mode. TXKPRO_ALLOW_LEGACY_CLINE_ORCHESTRATION=true exists only as an explicitly enabled compatibility/emergency path. It is not the normal product workflow.

## Completion states

CHAT_ORCHESTRATION_REQUIRED
IMPLEMENTATION_RUN_ACTIVE
EXECUTION_VALIDATED_AWAITING_CHAT_REVIEW
RUN_COMPLETE_AWAITING_CHAT_VERIFICATION

Cline must never translate RUN_COMPLETE_AWAITING_CHAT_VERIFICATION into verification complete, Done, or equivalent.
