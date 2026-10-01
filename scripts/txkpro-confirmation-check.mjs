#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const evidencePath = argValue("--evidence");
if (!evidencePath) {
  console.error("[confirmation-check] Use --evidence <path>.");
  process.exit(2);
}

let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch (error) {
  console.error("[confirmation-check] Could not read evidence JSON: " + error.message);
  process.exit(2);
}

const requiredConfirmations = [
  "rolesAndScopes",
  "dataOwnership",
  "statusesAndEvents",
  "iaAndDesign",
  "stagingTargets",
  "credentials",
  "manualUat",
  "unresolvedDecisions",
];

const validationErrors = [];
if (!Number.isInteger(Number(evidence.issue)) || Number(evidence.issue) <= 0) {
  validationErrors.push("issue must be a positive integer");
}
if (!String(evidence.taskId || "").trim()) {
  validationErrors.push("taskId is required");
}
if (!evidence.confirmations || typeof evidence.confirmations !== "object") {
  validationErrors.push("confirmations object is required");
}

const statuses = [];
for (const key of requiredConfirmations) {
  const item = evidence.confirmations?.[key];
  if (!item || typeof item !== "object") {
    validationErrors.push("missing confirmation: " + key);
    continue;
  }

  const status = String(item.status || "").trim().toUpperCase();
  if (!["CONFIRMED", "BLOCKED", "UNRESOLVED"].includes(status)) {
    validationErrors.push(
      key + ".status must be CONFIRMED, BLOCKED, or UNRESOLVED",
    );
  }

  const evidenceList = Array.isArray(item.evidence)
    ? item.evidence.filter((value) => String(value || "").trim())
    : [];

  if (evidenceList.length === 0) {
    validationErrors.push(key + ".evidence must contain at least one source/result");
  }

  statuses.push({ key, status });
}

if (validationErrors.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "INVALID",
        validationErrors,
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const blocked = statuses.filter(
  (item) => item.status === "BLOCKED" || item.status === "UNRESOLVED",
);

if (blocked.length > 0) {
  console.log(
    "TXKPRO_CONFIRMATIONS_BLOCKED issue=" +
      evidence.issue +
      " taskId=" +
      evidence.taskId,
  );
  console.log(
    JSON.stringify(
      {
        status: "BLOCKED",
        issue: Number(evidence.issue),
        taskId: evidence.taskId,
        blockedConfirmations: blocked,
        mutationAuthorized: false,
        nextAction:
          "Continue read-only analysis with the next provisional candidate. Do not ask the user for permission to continue.",
      },
      null,
      2,
    ),
  );
  process.exit(3);
}

console.log(
  "TXKPRO_CONFIRMATIONS_CONFIRMED issue=" +
    evidence.issue +
    " taskId=" +
    evidence.taskId,
);
console.log(
  JSON.stringify(
    {
      status: "CONFIRMED",
      issue: Number(evidence.issue),
      taskId: evidence.taskId,
      readOnlyConfirmations: "CONFIRMED",
      nextEligibleTaskConfirmed: true,
      mutationAuthorized: false,
      nextAction:
        "Present the implementation/verification plan and await explicit owner approval before mutation.",
    },
    null,
    2,
  ),
);
