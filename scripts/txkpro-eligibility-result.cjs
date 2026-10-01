/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RESULT_CONTRACT = "txkpro-eligibility-result-v1";
const EVIDENCE_CONTRACT = "semantic-provenance-v3";
const PLAN_CONTRACT = "sourced-plan-v1";
const RESULT_MAX_AGE_MS = 10 * 60 * 1000;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function resultPathForEvidence(evidencePath) {
  return path.resolve(evidencePath) + ".eligibility-result.json";
}

function commandFromParameters(parameters) {
  const value =
    parameters?.command ?? parameters?.commands ?? parameters?.cmd ?? parameters;
  if (Array.isArray(value)) {
    if (value.length !== 1) return "";
    if (typeof value[0] === "string") return value[0].trim();
    if (value[0] && typeof value[0].command === "string") {
      return value[0].command.trim();
    }
    return "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function shellTokens(command) {
  if (!command || /[;&|<>\n\r`]/.test(command)) return null;
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g;
  let match;
  let consumed = "";
  while ((match = pattern.exec(command))) {
    if (command.slice(consumed.length, match.index).trim()) return null;
    consumed = command.slice(0, pattern.lastIndex);
    const token = match[1] !== undefined
      ? match[1].replace(/\\(["\\])/g, "$1")
      : match[2] !== undefined
        ? match[2]
        : match[3];
    tokens.push(token);
  }
  if (command.slice(consumed.length).trim()) return null;
  return tokens;
}

function parseValidatorInvocation(toolName, parameters, workspaceRoot) {
  if (!["run_commands", "execute_command"].includes(String(toolName || ""))) {
    return null;
  }
  const command = commandFromParameters(parameters);
  const tokens = shellTokens(command);
  if (!tokens || tokens.length < 4 || tokens.length % 2 !== 0) return null;
  if (tokens[0] !== "node" || tokens[1] !== "scripts/txkpro-confirmation-check.mjs") {
    return null;
  }

  let evidencePath = "";
  let resultPath = "";
  for (let index = 2; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!value || !["--evidence", "--result"].includes(flag)) return null;
    if (flag === "--evidence") evidencePath = value;
    if (flag === "--result") resultPath = value;
  }
  if (!evidencePath) return null;

  const resolvedEvidence = path.resolve(workspaceRoot, evidencePath);
  const resolvedResult = resultPath
    ? path.resolve(workspaceRoot, resultPath)
    : resultPathForEvidence(resolvedEvidence);
  return { command, evidencePath: resolvedEvidence, resultPath: resolvedResult };
}

function isSelectorInvocation(toolName, parameters) {
  if (!["run_commands", "execute_command"].includes(String(toolName || ""))) {
    return false;
  }
  const tokens = shellTokens(commandFromParameters(parameters));
  if (!tokens) return false;
  const direct =
    tokens[0] === "node" && tokens[1] === "scripts/roadmap-next-eligible.mjs";
  const npm =
    tokens[0] === "npm" &&
    tokens[1] === "run" &&
    tokens[2] === "roadmap:next:eligible";
  return direct || npm;
}

function gitHead(workspaceRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? String(result.stdout || "").trim() : "";
}

function validateResultArtifact({ artifactPath, evidencePath, workspaceRoot, gate }) {
  const errors = [];
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  } catch (error) {
    return { ok: false, errors: ["result artifact could not be read: " + error.message] };
  }

  if (artifact.resultContract !== RESULT_CONTRACT) errors.push("result contract mismatch");
  if (artifact.status !== "CONFIRMED") errors.push("result status is not CONFIRMED");
  if (artifact.evidenceContract !== EVIDENCE_CONTRACT) errors.push("evidence contract mismatch");
  if (artifact.planContract !== PLAN_CONTRACT) errors.push("plan contract mismatch");
  if (artifact.confirmationSentinelSeen !== true) errors.push("confirmation sentinel flag missing");
  if (artifact.planSentinelSeen !== true) errors.push("plan sentinel flag missing");
  if (path.resolve(String(artifact.evidencePath || "")) !== path.resolve(evidencePath)) {
    errors.push("evidence path mismatch");
  }
  if (path.resolve(String(artifact.resultPath || "")) !== path.resolve(artifactPath)) {
    errors.push("result path mismatch");
  }
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!path.resolve(evidencePath).startsWith(temporaryRoot)) {
    errors.push("evidence path must be under the system temporary directory");
  }
  if (!path.resolve(artifactPath).startsWith(temporaryRoot)) {
    errors.push("result artifact path must be under the system temporary directory");
  }
  if (Number(artifact.issue) !== Number(gate?.issue)) errors.push("candidate issue mismatch");
  if (String(artifact.taskId || "") !== String(gate?.roadmapTaskId || "")) {
    errors.push("candidate Task ID mismatch");
  }

  try {
    if (artifact.evidenceSha256 !== sha256File(evidencePath)) {
      errors.push("evidence hash mismatch");
    }
  } catch (error) {
    errors.push("evidence could not be hashed: " + error.message);
  }

  const validatorPath = path.join(workspaceRoot, "scripts", "txkpro-confirmation-check.mjs");
  try {
    if (artifact.validatorSha256 !== sha256File(validatorPath)) {
      errors.push("validator hash mismatch");
    }
  } catch (error) {
    errors.push("validator could not be hashed: " + error.message);
  }

  const head = gitHead(workspaceRoot);
  if (!head || artifact.repositoryHead !== head) errors.push("repository HEAD mismatch");
  const validatedAt = Date.parse(String(artifact.validatedAt || ""));
  if (!Number.isFinite(validatedAt) || Date.now() - validatedAt > RESULT_MAX_AGE_MS || validatedAt > Date.now() + 30000) {
    errors.push("result artifact is stale or has an invalid timestamp");
  }
  if (!String(artifact.canonicalPresentation || "").trim()) {
    errors.push("canonical presentation missing");
  } else if (artifact.presentationSha256 !== sha256(artifact.canonicalPresentation)) {
    errors.push("canonical presentation hash mismatch");
  }

  return { ok: errors.length === 0, errors, artifact };
}

function extractPresentationText(parameters) {
  const preferredKeys = [
    "response",
    "message",
    "result",
    "text",
    "final_response",
    "finalResponse",
    "question",
  ];
  if (typeof parameters === "string") return parameters.trim();
  if (!parameters || typeof parameters !== "object") return "";
  for (const key of preferredKeys) {
    if (typeof parameters[key] === "string") return parameters[key].trim();
  }
  return "";
}

module.exports = {
  EVIDENCE_CONTRACT,
  PLAN_CONTRACT,
  RESULT_CONTRACT,
  commandFromParameters,
  extractPresentationText,
  gitHead,
  isSelectorInvocation,
  parseValidatorInvocation,
  resultPathForEvidence,
  sha256,
  sha256File,
  validateResultArtifact,
};
