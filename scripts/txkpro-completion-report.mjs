#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { EVIDENCE_MARKER, validateEvidence } from "./lib/txkpro-evidence.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const evidencePath = argValue("--evidence");
if (!evidencePath) {
  console.error("[completion-report] Use --evidence <file>.");
  process.exit(2);
}

let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch (error) {
  console.error("[completion-report] Could not read evidence: " + error.message);
  process.exit(1);
}

const validation = validateEvidence(evidence);
if (!validation.valid) {
  for (const error of validation.errors) {
    console.error("[completion-report] " + error);
  }
  process.exit(1);
}

const dependencies =
  evidence.dependencies.length === 0
    ? "None"
    : evidence.dependencies
        .map(function (dep) {
          return dep.task_id + " — " + dep.classification + " — " + dep.evidence;
        })
        .join("; ");

const followups =
  evidence.known_followups.length === 0
    ? "None"
    : evidence.known_followups.join("; ");

const lines = [
  "## TXKPRO Protocol Completion Evidence",
  "",
  "- Task: " + evidence.task_id + " / issue #" + evidence.issue,
  "- Requested Project transition: **" + evidence.target_status + "**",
  "- Risk: " + evidence.risk,
  "- Dependencies: " + dependencies,
  "- Implementation complete: " + String(evidence.implementation.complete),
  "- Pull request: " + (evidence.implementation.pull_request || "Not applicable"),
  "- Merge commit: " + (evidence.implementation.merge_commit || "Not applicable"),
  "- Merged branch: " + (evidence.implementation.merged_branch || "Not applicable"),
  "- CI: " + (evidence.ci.required ? (evidence.ci.passed ? "passed" : "failed") : "not required"),
  "- Staging deployment: " + (evidence.deployment.staging_required ? (evidence.deployment.staging_deployed ? "deployed" : "not deployed") : "not required"),
  "- Migrations: " + (evidence.deployment.migrations_required ? (evidence.deployment.migrations_applied && evidence.deployment.migration_ledger_verified ? "applied + ledger verified" : "incomplete") : "not required"),
  "- Automated verification: " + (evidence.verification.automated_required ? (evidence.verification.automated_passed ? "passed" : "failed") : "not required"),
  "- SQL/API verification: " + evidence.verification.sql_api,
  "- Authorization/privacy: " + evidence.verification.authorization_privacy,
  "- Advisor/security: " + evidence.verification.advisor_security,
  "- Manual UAT: " + evidence.verification.manual_uat,
  "- Acceptance criteria: " + evidence.verification.acceptance_criteria,
  "- Blockers: None",
  "- Known follow-ups: " + followups,
  "- Next action: " + evidence.next_action,
  "",
  EVIDENCE_MARKER,
  "```json",
  JSON.stringify(evidence, null, 2),
  "```"
];

process.stdout.write(lines.join("\n") + "\n");
