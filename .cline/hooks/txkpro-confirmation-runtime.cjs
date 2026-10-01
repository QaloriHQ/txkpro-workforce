#!/usr/bin/env node

const { createHash } = require("node:crypto");

const RESULT_TYPE = "TXKPRO_CONFIRMATION_VALIDATION_RESULT";
const RESULT_SCHEMA_VERSION = "runtime-validation-v1";
const EVIDENCE_CONTRACT = "semantic-provenance-v3";
const PLAN_CONTRACT = "sourced-plan-v1";
const CONFIRMATION_SENTINEL = "TXKPRO_CONFIRMATIONS_CONFIRMED";
const PLAN_SENTINEL = "TXKPRO_PLAN_CONTRACT_CONFIRMED";
const BLOCKED_SENTINEL = "TXKPRO_CONFIRMATIONS_BLOCKED";
const PROPOSED_LABEL = "PROPOSED — requires product/technical decision";
const REQUIRED_CONFIRMATIONS = [
  "rolesAndScopes",
  "dataOwnership",
  "statusesAndEvents",
  "iaAndDesign",
  "stagingTargets",
  "credentials",
  "manualUat",
  "unresolvedDecisions",
];
const CONSTRAINED_PLAN_KINDS = new Set([
  "api_route",
  "database_field",
  "status",
  "event",
  "url_pattern",
  "credential",
  "owner",
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function validationIdentitySeed(result) {
  return {
    type: result.type,
    schemaVersion: result.schemaVersion,
    issue: Number(result.issue),
    taskId: String(result.taskId || ""),
    evidenceContract: result.evidenceContract,
    planContract: result.planContract,
    evidenceDigest: result.evidenceDigest,
    confirmationResult: result.confirmationResult,
    planResult: result.planResult,
  };
}

function expectedValidationId(result) {
  return sha256(JSON.stringify(validationIdentitySeed(result)));
}

function extractCommand(parameters) {
  if (typeof parameters?.command === "string") return parameters.command;
  if (typeof parameters?.cmd === "string") return parameters.cmd;
  if (typeof parameters?.commands === "string") return parameters.commands;
  if (Array.isArray(parameters?.commands) && parameters.commands.length === 1) {
    return String(parameters.commands[0] || "");
  }
  return "";
}

function parseValidatorInvocation(toolName, parameters) {
  if (!["execute_command", "run_commands"].includes(String(toolName || ""))) {
    return null;
  }
  const command = extractCommand(parameters).trim();
  if (!command || /[\r\n;&|><`]/.test(command)) return null;

  const match = command.match(
    /^(?:node|nodejs)\s+(?:\.\/)?scripts\/txkpro-confirmation-check\.mjs\s+--evidence\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/,
  );
  if (!match) return null;

  const evidencePath = match[1] || match[2] || match[3] || "";
  if (!evidencePath) return null;

  return {
    toolName: String(toolName),
    command,
    commandDigest: sha256(command),
    evidencePath,
  };
}

function parseJsonValue(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.type === RESULT_TYPE || value.selected || value.status) return value;
    for (const key of ["stdout", "output", "result", "content", "text"]) {
      if (value[key] != null) {
        const parsed = parseJsonValue(value[key], depth + 1);
        if (parsed) return parsed;
      }
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

function parseValidationResult(value) {
  const parsed = parseJsonValue(value);
  return parsed?.type === RESULT_TYPE ? parsed : null;
}

function parseSelectorResult(value) {
  const parsed = parseJsonValue(value);
  if (
    parsed?.selected?.eligibilityState ===
      "AUTOMATED_GATE_PASSED_CONFIRMATIONS_PENDING" &&
    Number.isInteger(Number(parsed?.selected?.issue)) &&
    String(parsed?.selected?.taskContext?.taskId || "").trim()
  ) {
    return parsed;
  }
  return null;
}

function candidateListFromSelector(selector) {
  const raw = Array.isArray(selector?.provisionalCandidates)
    ? selector.provisionalCandidates
    : [];
  const candidates = raw
    .map((candidate) => ({
      issue: Number(candidate?.issue),
      taskId: String(candidate?.taskContext?.taskId || "").trim(),
    }))
    .filter((candidate) => Number.isInteger(candidate.issue) && candidate.issue > 0 && candidate.taskId);

  const selected = {
    issue: Number(selector?.selected?.issue),
    taskId: String(selector?.selected?.taskContext?.taskId || "").trim(),
  };
  if (
    Number.isInteger(selected.issue) &&
    selected.issue > 0 &&
    selected.taskId &&
    !candidates.some(
      (candidate) =>
        candidate.issue === selected.issue && candidate.taskId === selected.taskId,
    )
  ) {
    candidates.unshift(selected);
  }
  return candidates;
}

function identityMatches(result, expected = {}) {
  if (expected.issue != null && Number(result.issue) !== Number(expected.issue)) {
    return false;
  }
  if (
    expected.taskId &&
    String(result.taskId || "").trim() !== String(expected.taskId).trim()
  ) {
    return false;
  }
  return true;
}

function validateCommonArtifact(result, expected = {}) {
  const errors = [];
  if (!result || typeof result !== "object") return ["validator result is not an object"];
  if (result.type !== RESULT_TYPE) errors.push("result.type is invalid");
  if (result.schemaVersion !== RESULT_SCHEMA_VERSION) {
    errors.push("result.schemaVersion is invalid");
  }
  if (!Number.isInteger(Number(result.issue)) || Number(result.issue) <= 0) {
    errors.push("result.issue must be a positive integer");
  }
  if (!String(result.taskId || "").trim()) errors.push("result.taskId is required");
  if (result.evidenceContract !== EVIDENCE_CONTRACT) {
    errors.push("result.evidenceContract is invalid");
  }
  if (result.planContract !== PLAN_CONTRACT) {
    errors.push("result.planContract is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(String(result.evidenceDigest || ""))) {
    errors.push("result.evidenceDigest is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(String(result.validationId || ""))) {
    errors.push("result.validationId is invalid");
  } else if (result.validationId !== expectedValidationId(result)) {
    errors.push("result.validationId does not match the validated result identity");
  }
  if (!identityMatches(result, expected)) {
    errors.push("validator result issue/task identity does not match the provisional candidate");
  }
  if (result.mutationAuthorized !== false) {
    errors.push("result.mutationAuthorized must be false");
  }
  if (!Array.isArray(result.successSentinels)) {
    errors.push("result.successSentinels must be an array");
  }
  return errors;
}

function validatePlan(result, errors) {
  const plan = result?.implementationPlan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    errors.push("result.implementationPlan is required");
    return;
  }
  if (plan.contract !== PLAN_CONTRACT) {
    errors.push("result.implementationPlan.contract is invalid");
  }
  if (!Array.isArray(plan.decisions) || plan.decisions.length === 0) {
    errors.push("result.implementationPlan.decisions must be non-empty");
    return;
  }
  for (const [index, decision] of plan.decisions.entries()) {
    const prefix = "result.implementationPlan.decisions[" + index + "]";
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      errors.push(prefix + " must be an object");
      continue;
    }
    const kind = String(decision.kind || "").trim();
    const name = String(decision.name || "").trim();
    const basis = String(decision.basis || "").trim().toUpperCase();
    if (!kind) errors.push(prefix + ".kind is required");
    if (!name) errors.push(prefix + ".name is required");
    if (!["SOURCED", "PROPOSED"].includes(basis)) {
      errors.push(prefix + ".basis is invalid");
      continue;
    }
    if (basis === "PROPOSED" && decision.label !== PROPOSED_LABEL) {
      errors.push(prefix + ".label must preserve the canonical PROPOSED label");
    }
    if (
      CONSTRAINED_PLAN_KINDS.has(kind) &&
      basis === "SOURCED" &&
      (!REQUIRED_CONFIRMATIONS.includes(String(decision.confirmation || "")) ||
        !Number.isInteger(Number(decision.evidenceIndex)) ||
        Number(decision.evidenceIndex) < 0)
    ) {
      errors.push(prefix + " has an invalid sourced evidence reference");
    }
  }
}

function validateConfirmationAudit(result, errors, requireConfirmed) {
  const confirmations = result?.confirmations;
  if (!confirmations || typeof confirmations !== "object" || Array.isArray(confirmations)) {
    errors.push("result.confirmations is required");
    return;
  }

  for (const key of REQUIRED_CONFIRMATIONS) {
    const confirmation = confirmations[key];
    if (!confirmation || typeof confirmation !== "object") {
      errors.push("result.confirmations." + key + " is required");
      continue;
    }
    if (requireConfirmed && confirmation.status !== "CONFIRMED") {
      errors.push("result.confirmations." + key + ".status must be CONFIRMED");
    }
    if (!Array.isArray(confirmation.validatedEvidence) || confirmation.validatedEvidence.length === 0) {
      errors.push("result.confirmations." + key + ".validatedEvidence must be non-empty");
      continue;
    }
    confirmation.validatedEvidence.forEach((entry, index) => {
      const prefix =
        "result.confirmations." + key + ".validatedEvidence[" + index + "]";
      if (!String(entry?.source || "").trim()) errors.push(prefix + ".source is required");
      if (!String(entry?.assertion?.subject || "").trim()) {
        errors.push(prefix + ".assertion.subject is required");
      }
      if (!String(entry?.assertion?.predicate || "").trim()) {
        errors.push(prefix + ".assertion.predicate is required");
      }
      if (!Array.isArray(entry?.assertion?.values) || entry.assertion.values.length === 0) {
        errors.push(prefix + ".assertion.values must be non-empty");
      }
      if (!String(entry?.verification?.type || "").trim()) {
        errors.push(prefix + ".verification.type is required");
      }
      if (entry?.verification?.result !== "PASS") {
        errors.push(prefix + ".verification.result must be PASS");
      }
    });
  }
}

function validateConfirmedArtifact(result, expected = {}) {
  const errors = validateCommonArtifact(result, expected);
  if (result?.status !== "CONFIRMED") errors.push("result.status must be CONFIRMED");
  if (result?.confirmationResult !== "CONFIRMED") {
    errors.push("result.confirmationResult must be CONFIRMED");
  }
  if (result?.planResult !== "CONFIRMED") {
    errors.push("result.planResult must be CONFIRMED");
  }
  if (!result?.successSentinels?.includes(CONFIRMATION_SENTINEL)) {
    errors.push("confirmation success sentinel is missing from the structured result");
  }
  if (!result?.successSentinels?.includes(PLAN_SENTINEL)) {
    errors.push("plan success sentinel is missing from the structured result");
  }
  validateConfirmationAudit(result, errors, true);
  validatePlan(result, errors);
  return errors;
}

function validateBlockedArtifact(result, expected = {}) {
  const errors = validateCommonArtifact(result, expected);
  if (result?.status !== "BLOCKED") errors.push("result.status must be BLOCKED");
  if (result?.confirmationResult !== "BLOCKED") {
    errors.push("result.confirmationResult must be BLOCKED");
  }
  if (result?.planResult !== "CONFIRMED") {
    errors.push("result.planResult must be CONFIRMED");
  }
  if (result?.blockedSentinel !== BLOCKED_SENTINEL) {
    errors.push("blocked sentinel is missing from the structured result");
  }
  if (result?.successSentinels?.includes(CONFIRMATION_SENTINEL)) {
    errors.push("blocked result must not contain confirmation success sentinel");
  }
  validateConfirmationAudit(result, errors, false);
  validatePlan(result, errors);
  return errors;
}

function renderOwnerFacingSummary(result) {
  const lines = [
    "Next eligible task confirmed: " + result.taskId + " / #" + result.issue,
    "Automated Definition of Ready: PASS",
    "Read-only confirmations: CONFIRMED",
    "Implementation plan contract: CONFIRMED",
    "Mutation authorized: NO",
    "",
    "Validation audit:",
  ];

  for (const key of REQUIRED_CONFIRMATIONS) {
    const confirmation = result.confirmations[key];
    lines.push("- " + key + " | status=" + confirmation.status);
    confirmation.validatedEvidence.forEach((entry, index) => {
      lines.push(
        "  evidence[" +
          index +
          "] | source=" +
          entry.source +
          " | subject=" +
          entry.assertion.subject +
          " | predicate=" +
          entry.assertion.predicate +
          " | values=" +
          JSON.stringify(entry.assertion.values) +
          " | verification=" +
          entry.verification.type +
          " | result=" +
          entry.verification.result,
      );
    });
  }

  lines.push("", "Validated implementation plan:");
  result.implementationPlan.decisions.forEach((decision, index) => {
    const basis =
      decision.basis === "PROPOSED"
        ? PROPOSED_LABEL
        : "SOURCED — " +
          String(decision.confirmation || "") +
          "[" +
          String(decision.evidenceIndex ?? "") +
          "]";
    lines.push(
      "- decision[" +
        index +
        "] | kind=" +
        decision.kind +
        " | name=" +
        decision.name +
        " | " +
        basis,
    );
  });

  lines.push(
    "",
    "Validation ID: " + result.validationId,
    "Evidence digest: " + result.evidenceDigest,
    "Awaiting explicit owner approval before mutation.",
  );
  return lines.join("\n");
}

function extractCompletionText(parameters) {
  for (const key of ["result", "message", "text", "response", "content"]) {
    if (typeof parameters?.[key] === "string") return parameters[key];
  }
  return "";
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function completionMatches(parameters, expected) {
  return normalizeText(extractCompletionText(parameters)) === normalizeText(expected);
}

module.exports = {
  BLOCKED_SENTINEL,
  CONFIRMATION_SENTINEL,
  EVIDENCE_CONTRACT,
  PLAN_CONTRACT,
  PLAN_SENTINEL,
  PROPOSED_LABEL,
  REQUIRED_CONFIRMATIONS,
  RESULT_SCHEMA_VERSION,
  RESULT_TYPE,
  candidateListFromSelector,
  completionMatches,
  expectedValidationId,
  parseSelectorResult,
  parseValidationResult,
  parseValidatorInvocation,
  renderOwnerFacingSummary,
  sha256,
  validateBlockedArtifact,
  validateConfirmedArtifact,
};
