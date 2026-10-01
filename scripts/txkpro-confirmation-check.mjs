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
  console.error(
    "[confirmation-check] Could not read evidence JSON: " + error.message,
  );
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

const allowedStatuses = new Set(["CONFIRMED", "BLOCKED", "UNRESOLVED"]);

const vagueSourceValues = new Set(
  [
    "role matrix",
    "data ownership rules",
    "status dictionary",
    "event map",
    "ui standard",
    "design system",
    "staging config",
    "presence checks only",
    "manual uat rule",
    "issue/source review",
    "issue review",
    "source review",
    "environment",
    "config",
    "github",
  ].map((value) => value.toLowerCase()),
);

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sourceLooksSpecific(source) {
  const normalized = source.toLowerCase();
  if (vagueSourceValues.has(normalized)) return false;

  return (
    source.includes("/") ||
    source.includes("\\") ||
    /^https?:\/\//i.test(source) ||
    /^github[- ](issue|project|pull request)[: #]/i.test(source) ||
    /^(environment|credential|repository|deployment|staging|runtime|project)-[a-z0-9-]+-check$/i.test(
      source,
    ) ||
    /^[A-Za-z0-9_.-]+:[A-Za-z0-9_#./:-]+$/.test(source)
  );
}

function validateEvidenceEntry(key, entry, index) {
  const prefix = key + ".evidence[" + index + "]";

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return [
      prefix +
        " must be an object with source, finding, and locator or checkType",
    ];
  }

  const errors = [];
  const source = textValue(entry.source);
  const locator = textValue(entry.locator);
  const checkType = textValue(entry.checkType);
  const finding = textValue(entry.finding);

  if (!source) {
    errors.push(prefix + ".source is required");
  } else if (source.length < 8 || !sourceLooksSpecific(source)) {
    errors.push(
      prefix +
        ".source must identify a specific authoritative artifact or named live-state check",
    );
  }

  if (!locator && !checkType) {
    errors.push(prefix + " requires locator or checkType");
  }

  if (locator && locator.length < 3) {
    errors.push(prefix + ".locator is too vague");
  }

  if (checkType && checkType.length < 3) {
    errors.push(prefix + ".checkType is too vague");
  }

  if (!finding) {
    errors.push(prefix + ".finding is required");
  } else if (finding.length < 12) {
    errors.push(prefix + ".finding must state the concrete result that was observed");
  }

  return errors;
}

const validationErrors = [];

if (!Number.isInteger(Number(evidence.issue)) || Number(evidence.issue) <= 0) {
  validationErrors.push("issue must be a positive integer");
}

if (!String(evidence.taskId || "").trim()) {
  validationErrors.push("taskId is required");
}

if (
  !evidence.confirmations ||
  typeof evidence.confirmations !== "object" ||
  Array.isArray(evidence.confirmations)
) {
  validationErrors.push("confirmations object is required");
}

const statuses = [];

for (const key of requiredConfirmations) {
  const item = evidence.confirmations?.[key];

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    validationErrors.push("missing confirmation: " + key);
    continue;
  }

  const status = String(item.status || "")
    .trim()
    .toUpperCase();

  if (!allowedStatuses.has(status)) {
    validationErrors.push(
      key + ".status must be CONFIRMED, BLOCKED, or UNRESOLVED",
    );
  }

  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    validationErrors.push(
      key + ".evidence must contain at least one structured provenance entry",
    );
  } else {
    item.evidence.forEach((entry, index) => {
      validationErrors.push(...validateEvidenceEntry(key, entry, index));
    });
  }

  statuses.push({ key, status });
}

if (validationErrors.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "INVALID",
        issue: Number.isInteger(Number(evidence.issue))
          ? Number(evidence.issue)
          : null,
        taskId: String(evidence.taskId || "").trim() || null,
        validationErrors,
        requiredEvidenceShape: {
          source:
            "Specific authoritative file/URL/issue identifier or named live-state check",
          locator:
            "Section, heading, line/range, issue field, route, config key, or other source locator",
          checkType:
            "Named live-state check when locator does not apply",
          finding:
            "Concrete observation supported by the source/check",
        },
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
      evidenceContract: "structured-provenance-v1",
      nextAction:
        "Present the implementation/verification plan and await explicit owner approval before mutation.",
    },
    null,
    2,
  ),
);
