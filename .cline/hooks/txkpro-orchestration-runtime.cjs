#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { createHash } = require("node:crypto");

const CHAT_CONTRACT_TYPE = "TXKPRO_CHAT_IMPLEMENTATION_CONTRACT";
const CHAT_CONTRACT_SCHEMA = "chat-orchestrator-v1";
const CHAT_CONTRACT_MARKER = "<!-- txkpro-chat-implementation-contract:v1 -->";
const CHAT_ORCHESTRATOR = "ChatGPT Chat mode";
const CLINE_EXECUTOR = "Cline Act mode";
const CHAT_CONTRACT_READY = "READY_FOR_OWNER_APPROVAL";
const EXECUTION_RESULT_TYPE = "TXKPRO_CLINE_EXECUTION_RESULT";
const EXECUTION_RESULT_SCHEMA = "cline-execution-v1";
const EXECUTION_VALIDATION_TYPE = "TXKPRO_CLINE_EXECUTION_VALIDATION_RESULT";
const EXECUTION_VALIDATION_SCHEMA = "cline-execution-validation-v1";
const EXECUTION_SENTINEL = "TXKPRO_CLINE_EXECUTION_VALIDATED";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function contractIdentitySeed(contract) {
  const copy = { ...(contract || {}) };
  delete copy.contractId;
  return canonicalize(copy);
}

function expectedContractId(contract) {
  return sha256(JSON.stringify(contractIdentitySeed(contract)));
}

function normalizeRepoPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function pathIsSafe(value) {
  const normalized = normalizeRepoPath(value);
  return normalized.length > 0 && !normalized.startsWith("/") && !normalized.split("/").includes("..");
}

function globToRegExp(pattern) {
  let value = normalizeRepoPath(pattern);
  value = value.replace(/[.+?^$()|[\]\\]/g, "\\$&");
  value = value.replace(/\*\*/g, "__TXKPRO_GLOBSTAR__");
  value = value.replace(/\*/g, "[^/]*");
  value = value.replace(/__TXKPRO_GLOBSTAR__/g, ".*");
  return new RegExp("^" + value + "$");
}

function pathMatchesAllowed(target, allowedPaths) {
  const normalized = normalizeRepoPath(target);
  if (!pathIsSafe(normalized)) return false;
  return (allowedPaths || []).some((pattern) => {
    const p = normalizeRepoPath(pattern);
    if (!p) return false;
    if (p === "*" || p === "**") return true;
    try {
      return globToRegExp(p).test(normalized);
    } catch {
      return false;
    }
  });
}

function validateContract(contract, expected = {}) {
  const errors = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return ["contract must be an object"];
  if (contract.type !== CHAT_CONTRACT_TYPE) errors.push("contract.type is invalid");
  if (contract.schemaVersion !== CHAT_CONTRACT_SCHEMA) errors.push("contract.schemaVersion is invalid");
  if (contract.orchestrator !== CHAT_ORCHESTRATOR) errors.push("contract.orchestrator must be ChatGPT Chat mode");
  if (contract.executor !== CLINE_EXECUTOR) errors.push("contract.executor must be Cline Act mode");
  if (contract.state !== CHAT_CONTRACT_READY) errors.push("contract.state must be READY_FOR_OWNER_APPROVAL");
  if (!Number.isInteger(Number(contract.issue)) || Number(contract.issue) <= 0) errors.push("contract.issue must be a positive integer");
  if (!String(contract.taskId || "").trim()) errors.push("contract.taskId is required");
  if (expected.issue != null && Number(contract.issue) !== Number(expected.issue)) errors.push("contract issue does not match requested issue");
  if (expected.taskId && String(contract.taskId || "").trim() !== String(expected.taskId).trim()) errors.push("contract taskId does not match requested taskId");
  if (!/^[a-f0-9]{64}$/.test(String(contract.confirmationValidationId || ""))) errors.push("contract.confirmationValidationId is invalid");
  if (!/^[a-f0-9]{64}$/.test(String(contract.evidenceDigest || ""))) errors.push("contract.evidenceDigest is invalid");
  if (contract.sourcePlanContract !== "sourced-plan-v1") errors.push("contract.sourcePlanContract must be sourced-plan-v1");
  if (!String(contract.createdAt || "").trim() || Number.isNaN(Date.parse(contract.createdAt))) errors.push("contract.createdAt must be an ISO timestamp");

  const scope = contract.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    errors.push("contract.scope is required");
  } else {
    if (!String(scope.summary || "").trim()) errors.push("contract.scope.summary is required");
    if (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length === 0) {
      errors.push("contract.scope.allowedPaths must be non-empty");
    } else {
      for (const [index, entry] of scope.allowedPaths.entries()) {
        if (!pathIsSafe(String(entry || "").replace(/\*+/g, "x"))) errors.push("contract.scope.allowedPaths[" + index + "] is invalid");
      }
    }
    if (!Array.isArray(scope.steps) || scope.steps.length === 0) {
      errors.push("contract.scope.steps must be non-empty");
    } else if (scope.steps.some((step) => !String(step || "").trim())) {
      errors.push("contract.scope.steps entries must be non-empty");
    }
    if (!Array.isArray(scope.decisions)) {
      errors.push("contract.scope.decisions must be an array");
    } else {
      scope.decisions.forEach((decision, index) => {
        const prefix = "contract.scope.decisions[" + index + "]";
        if (!String(decision?.kind || "").trim()) errors.push(prefix + ".kind is required");
        if (!String(decision?.name || "").trim()) errors.push(prefix + ".name is required");
        if (!["SOURCED", "OWNER_APPROVED"].includes(String(decision?.basis || ""))) errors.push(prefix + ".basis must be SOURCED or OWNER_APPROVED");
        if (String(decision?.basis || "") === "SOURCED" && !String(decision?.sourceRef || "").trim()) errors.push(prefix + ".sourceRef is required for SOURCED decisions");
        if (String(decision?.basis || "") === "OWNER_APPROVED" && !String(decision?.approvalRef || "").trim()) errors.push(prefix + ".approvalRef is required for OWNER_APPROVED decisions");
      });
    }
  }

  const verification = contract.verification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    errors.push("contract.verification is required");
  } else if (!Array.isArray(verification.commands) || verification.commands.length === 0 || verification.commands.some((command) => !String(command || "").trim())) {
    errors.push("contract.verification.commands must be non-empty");
  }

  const boundaries = contract.boundaries;
  if (!boundaries || typeof boundaries !== "object" || Array.isArray(boundaries)) {
    errors.push("contract.boundaries is required");
  } else {
    if (boundaries.mutationAuthorized !== false) errors.push("contract.boundaries.mutationAuthorized must be false before owner approval");
    if (boundaries.productionDeploymentAuthorized !== false) errors.push("contract.boundaries.productionDeploymentAuthorized must be false");
    if (boundaries.productionMigrationAuthorized !== false) errors.push("contract.boundaries.productionMigrationAuthorized must be false");
  }

  if (!/^[a-f0-9]{64}$/.test(String(contract.contractId || ""))) {
    errors.push("contract.contractId is invalid");
  } else if (contract.contractId !== expectedContractId(contract)) {
    errors.push("contract.contractId does not match contract content");
  }
  return errors;
}

function parseContractComment(body) {
  const text = String(body || "");
  const markerIndex = text.indexOf(CHAT_CONTRACT_MARKER);
  if (markerIndex < 0) return null;
  const tail = text.slice(markerIndex + CHAT_CONTRACT_MARKER.length);
  const fenced = tail.match(/~~~(?:json)?\s*([\s\S]*?)~~~/i);
  const candidate = fenced ? fenced[1].trim() : tail.trim();
  if (!candidate.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractCommand(parameters) {
  if (typeof parameters?.command === "string") return parameters.command;
  if (typeof parameters?.cmd === "string") return parameters.cmd;
  if (typeof parameters?.commands === "string") return parameters.commands;
  if (Array.isArray(parameters?.commands) && parameters.commands.length === 1) return String(parameters.commands[0] || "");
  return "";
}

function parseExecutionValidatorInvocation(toolName, parameters) {
  if (!["execute_command", "run_commands"].includes(String(toolName || ""))) return null;
  const command = extractCommand(parameters).trim();
  if (!command || /[\r\n;&|><\x60]/.test(command)) return null;
  const match = command.match(/^(?:node|nodejs)\s+(?:\.\/)?scripts\/txkpro-cline-execution-check\.mjs\s+--result\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+--contract\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/);
  if (!match) return null;
  const resultPath = match[1] || match[2] || match[3] || "";
  const contractPath = match[4] || match[5] || match[6] || "";
  if (!resultPath || !contractPath) return null;
  return { toolName: String(toolName), command, commandDigest: sha256(command), resultPath, contractPath };
}

function parseJsonValue(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.type === EXECUTION_VALIDATION_TYPE) return value;
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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseExecutionValidationResult(value) {
  const parsed = parseJsonValue(value);
  return parsed?.type === EXECUTION_VALIDATION_TYPE ? parsed : null;
}

function executionValidationIdentitySeed(result) {
  return {
    type: result.type,
    schemaVersion: result.schemaVersion,
    status: result.status,
    executionStatus: result.executionStatus,
    issue: Number(result.issue),
    taskId: String(result.taskId || ""),
    contractId: String(result.contractId || ""),
    resultDigest: String(result.resultDigest || ""),
  };
}

function expectedExecutionValidationId(result) {
  return sha256(JSON.stringify(executionValidationIdentitySeed(result)));
}

function validateExecutionInput(execution, contract) {
  const errors = [];
  errors.push(...validateContract(contract));
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    errors.push("execution result must be an object");
    return errors;
  }
  if (execution.type !== EXECUTION_RESULT_TYPE) errors.push("execution.type is invalid");
  if (execution.schemaVersion !== EXECUTION_RESULT_SCHEMA) errors.push("execution.schemaVersion is invalid");
  if (execution.executor !== CLINE_EXECUTOR) errors.push("execution.executor must be Cline Act mode");
  if (Number(execution.issue) !== Number(contract?.issue)) errors.push("execution.issue does not match contract");
  if (String(execution.taskId || "") !== String(contract?.taskId || "")) errors.push("execution.taskId does not match contract");
  if (String(execution.contractId || "") !== String(contract?.contractId || "")) errors.push("execution.contractId does not match contract");
  if (!["IMPLEMENTED", "BLOCKED"].includes(String(execution.status || ""))) errors.push("execution.status must be IMPLEMENTED or BLOCKED");
  if (!String(execution.summary || "").trim()) errors.push("execution.summary is required");

  if (!Array.isArray(execution.changedPaths)) {
    errors.push("execution.changedPaths must be an array");
  } else {
    for (const changed of execution.changedPaths) {
      if (!pathMatchesAllowed(changed, contract?.scope?.allowedPaths || [])) errors.push("execution changed path is outside ChatGPT contract scope: " + changed);
    }
  }
  if (execution.productionDeploymentPerformed !== false) errors.push("execution.productionDeploymentPerformed must be false");
  if (execution.productionMigrationPerformed !== false) errors.push("execution.productionMigrationPerformed must be false");

  if (execution.status === "IMPLEMENTED") {
    if (!Array.isArray(execution.deviations) || execution.deviations.length !== 0) errors.push("IMPLEMENTED execution must have zero deviations");
    if (!Array.isArray(execution.verification)) {
      errors.push("IMPLEMENTED execution.verification must be an array");
    } else {
      for (const requiredCommand of contract?.verification?.commands || []) {
        const item = execution.verification.find((entry) => String(entry?.command || "") === String(requiredCommand));
        if (!item) errors.push("required verification command missing: " + requiredCommand);
        else if (item.result !== "PASS" || Number(item.exitCode) !== 0) errors.push("required verification command did not PASS: " + requiredCommand);
      }
    }
  }
  if (execution.status === "BLOCKED" && (!Array.isArray(execution.blockers) || execution.blockers.length === 0)) {
    errors.push("BLOCKED execution must include blockers");
  }
  return errors;
}

function validateExecutionValidationArtifact(result, expected = {}) {
  const errors = [];
  if (!result || typeof result !== "object") return ["execution validator result is not an object"];
  if (result.type !== EXECUTION_VALIDATION_TYPE) errors.push("execution result.type is invalid");
  if (result.schemaVersion !== EXECUTION_VALIDATION_SCHEMA) errors.push("execution result.schemaVersion is invalid");
  if (result.status !== "VALIDATED") errors.push("execution result.status must be VALIDATED");
  if (!["IMPLEMENTED", "BLOCKED"].includes(String(result.executionStatus || ""))) errors.push("execution result.executionStatus is invalid");
  if (expected.issue != null && Number(result.issue) !== Number(expected.issue)) errors.push("execution validator issue does not match active contract");
  if (expected.taskId && String(result.taskId || "") !== String(expected.taskId)) errors.push("execution validator taskId does not match active contract");
  if (expected.contractId && String(result.contractId || "") !== String(expected.contractId)) errors.push("execution validator contractId does not match active contract");
  if (!/^[a-f0-9]{64}$/.test(String(result.resultDigest || ""))) errors.push("execution result.resultDigest is invalid");
  if (!/^[a-f0-9]{64}$/.test(String(result.validationId || ""))) errors.push("execution result.validationId is invalid");
  else if (result.validationId !== expectedExecutionValidationId(result)) errors.push("execution result.validationId does not match result identity");
  if (!Array.isArray(result.successSentinels) || !result.successSentinels.includes(EXECUTION_SENTINEL)) errors.push("execution validation sentinel is missing");
  return errors;
}

function renderExecutorFacingSummary(result) {
  const execution = result.validatedExecution || {};
  const lines = [
    "Cline Act execution reported: " + result.executionStatus,
    "Task: " + result.taskId + " / #" + result.issue,
    "ChatGPT contract: " + result.contractId,
    "",
    "Changed paths:",
  ];
  if (Array.isArray(execution.changedPaths) && execution.changedPaths.length > 0) execution.changedPaths.forEach((entry) => lines.push("- " + entry));
  else lines.push("- none");
  lines.push("", "Verification:");
  if (Array.isArray(execution.verification) && execution.verification.length > 0) {
    execution.verification.forEach((entry) => lines.push("- " + String(entry.command || "") + " | result=" + String(entry.result || "") + " | exitCode=" + String(entry.exitCode ?? "")));
  } else {
    lines.push("- none reported");
  }
  if (Array.isArray(execution.blockers) && execution.blockers.length > 0) {
    lines.push("", "Blockers:");
    execution.blockers.forEach((entry) => lines.push("- " + String(entry)));
  }
  lines.push(
    "",
    "Production deployment performed: NO",
    "Production migration performed: NO",
    "Execution validation ID: " + result.validationId,
    "ChatGPT Chat verification required before roadmap completion or status advancement.",
  );
  return lines.join("\n");
}

module.exports = {
  CHAT_CONTRACT_MARKER,
  CHAT_CONTRACT_READY,
  CHAT_CONTRACT_SCHEMA,
  CHAT_CONTRACT_TYPE,
  CHAT_ORCHESTRATOR,
  CLINE_EXECUTOR,
  EXECUTION_RESULT_SCHEMA,
  EXECUTION_RESULT_TYPE,
  EXECUTION_SENTINEL,
  EXECUTION_VALIDATION_SCHEMA,
  EXECUTION_VALIDATION_TYPE,
  canonicalize,
  expectedContractId,
  expectedExecutionValidationId,
  normalizeRepoPath,
  parseContractComment,
  parseExecutionValidationResult,
  parseExecutionValidatorInvocation,
  pathMatchesAllowed,
  renderExecutorFacingSummary,
  sha256,
  validateContract,
  validateExecutionInput,
  validateExecutionValidationArtifact,
};
