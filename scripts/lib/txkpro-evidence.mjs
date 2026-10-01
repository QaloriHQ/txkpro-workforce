export const EVIDENCE_MARKER = "<!-- txkpro-protocol-evidence:v1 -->";

export function extractEvidenceFromText(text) {
  const body = String(text || "");
  const markerIndex = body.indexOf(EVIDENCE_MARKER);
  if (markerIndex < 0) return null;

  const afterMarker = body.slice(markerIndex + EVIDENCE_MARKER.length);
  const fenceStart = afterMarker.toLowerCase().indexOf("\`\`\`json");
  if (fenceStart < 0) {
    throw new Error("Protocol evidence marker exists but no JSON code block follows it.");
  }

  const jsonStart = fenceStart + 7;
  const fenceEnd = afterMarker.indexOf("\`\`\`", jsonStart);
  if (fenceEnd < 0) {
    throw new Error("Protocol evidence JSON block is not closed.");
  }

  const raw = afterMarker.slice(jsonStart, fenceEnd).trim();
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Protocol evidence JSON is invalid: " + error.message);
  }
}

export function validateEvidence(evidence, options = {}) {
  const errors = [];
  const warnings = [];
  const expectedIssue = options.expectedIssue;
  const expectedTaskId = options.expectedTaskId;

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, errors: ["Evidence must be a JSON object."], warnings };
  }

  const required = [
    "schema",
    "issue",
    "task_id",
    "target_status",
    "risk",
    "dependencies",
    "implementation",
    "ci",
    "deployment",
    "verification",
    "blockers",
    "known_followups",
    "next_action",
    "generated_at"
  ];

  for (const key of required) {
    if (!(key in evidence)) errors.push("Missing required field: " + key);
  }

  if (evidence.schema !== "txkpro.protocol.evidence.v1") {
    errors.push("schema must equal txkpro.protocol.evidence.v1");
  }

  if (!Number.isInteger(evidence.issue) || evidence.issue <= 0) {
    errors.push("issue must be a positive integer");
  }

  if (expectedIssue && Number(evidence.issue) !== Number(expectedIssue)) {
    errors.push("Evidence issue #" + evidence.issue + " does not match expected issue #" + expectedIssue + ".");
  }

  if (!String(evidence.task_id || "").trim()) {
    errors.push("task_id is required");
  }

  if (
    expectedTaskId &&
    String(evidence.task_id || "").trim().toLowerCase() !==
      String(expectedTaskId || "").trim().toLowerCase()
  ) {
    errors.push("Evidence task_id " + evidence.task_id + " does not match issue Task ID " + expectedTaskId + ".");
  }

  if (!["Verification", "Done"].includes(evidence.target_status)) {
    errors.push("target_status must be Verification or Done");
  }

  if (!["LOW", "MEDIUM", "HIGH"].includes(evidence.risk)) {
    errors.push("risk must be LOW, MEDIUM, or HIGH");
  }

  if (!Array.isArray(evidence.dependencies)) {
    errors.push("dependencies must be an array");
  } else {
    for (const dep of evidence.dependencies) {
      if (!String(dep?.task_id || "").trim()) {
        errors.push("Every dependency evidence entry requires task_id");
      }
      if (!["PROCEED", "PROCEED_WITH_EXPLICIT_EXCEPTION"].includes(dep?.classification)) {
        errors.push("Dependency " + (dep?.task_id || "(unknown)") + " has invalid classification.");
      }
      if (!String(dep?.evidence || "").trim()) {
        errors.push("Dependency " + (dep?.task_id || "(unknown)") + " requires evidence text.");
      }
    }
  }

  if (!Array.isArray(evidence.blockers)) {
    errors.push("blockers must be an array");
  } else if (evidence.blockers.length > 0) {
    errors.push("Evidence-gated status transition cannot proceed with blockers.");
  }

  if (!Array.isArray(evidence.known_followups)) {
    errors.push("known_followups must be an array");
  }

  const implementation = evidence.implementation || {};
  if (implementation.complete !== true) {
    errors.push("implementation.complete must be true");
  }

  const ci = evidence.ci || {};
  if (typeof ci.required !== "boolean") {
    errors.push("ci.required must be boolean");
  } else if (ci.required && ci.passed !== true) {
    errors.push("Required CI must be passed");
  }

  const deployment = evidence.deployment || {};
  if (typeof deployment.staging_required !== "boolean") {
    errors.push("deployment.staging_required must be boolean");
  } else if (deployment.staging_required) {
    if (deployment.staging_deployed !== true) {
      errors.push("Required staging deployment must be complete");
    }
    if (!String(deployment.revision || "").trim()) {
      errors.push("Required staging deployment needs a revision");
    }
  }

  if (deployment.migrations_required === true) {
    if (deployment.migrations_applied !== true) {
      errors.push("Required migrations must be applied");
    }
    if (deployment.migration_ledger_verified !== true) {
      errors.push("Required migration ledger must be verified");
    }
  }

  const verification = evidence.verification || {};
  if (verification.automated_required === true && verification.automated_passed !== true) {
    errors.push("Required automated verification must pass");
  }

  if (!["passed", "not_applicable", "pending"].includes(verification.sql_api)) {
    errors.push("verification.sql_api has an invalid value");
  }

  if (!["passed", "not_applicable", "pending"].includes(verification.authorization_privacy)) {
    errors.push("verification.authorization_privacy has an invalid value");
  }

  if (!["passed", "baseline_findings_only", "not_applicable", "pending"].includes(verification.advisor_security)) {
    errors.push("verification.advisor_security has an invalid value");
  }

  if (!["remaining", "observation_required", "passed", "not_required"].includes(verification.manual_uat)) {
    errors.push("verification.manual_uat has an invalid value");
  }

  if (!["met", "pending"].includes(verification.acceptance_criteria)) {
    errors.push("verification.acceptance_criteria has an invalid value");
  }

  if (evidence.target_status === "Verification") {
    if (!["remaining", "observation_required"].includes(verification.manual_uat)) {
      errors.push("Verification requires remaining manual UAT or an observation period.");
    }
  }

  if (evidence.target_status === "Done") {
    if (verification.acceptance_criteria !== "met") {
      errors.push("Done requires all acceptance criteria to be met.");
    }
    if (!["passed", "not_required"].includes(verification.manual_uat)) {
      errors.push("Done requires manual UAT to be passed or not required.");
    }
    if (verification.sql_api === "pending") {
      errors.push("Done cannot have pending SQL/API verification.");
    }
    if (verification.authorization_privacy === "pending") {
      errors.push("Done cannot have pending authorization/privacy verification.");
    }
    if (verification.advisor_security === "pending") {
      errors.push("Done cannot have pending advisor/security verification.");
    }
  }

  if (!String(evidence.next_action || "").trim()) {
    errors.push("next_action is required");
  }

  if (Number.isNaN(Date.parse(evidence.generated_at))) {
    errors.push("generated_at must be a valid ISO-8601 date-time");
  }

  if (!implementation.pull_request) {
    warnings.push("No pull request is recorded. This may be valid for a non-code task, but should be intentional.");
  }
  if (!implementation.merge_commit && deployment.staging_required) {
    warnings.push("No merge commit is recorded even though staging deployment is required.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
