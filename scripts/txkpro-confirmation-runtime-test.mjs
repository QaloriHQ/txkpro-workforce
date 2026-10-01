#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../.cline/hooks/txkpro-confirmation-runtime.cjs");
const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "txkpro-confirmation-runtime-"));
const hookTmp = path.join(tmp, "hook-tmp");
const bin = path.join(tmp, "bin");
fs.mkdirSync(hookTmp, { recursive: true });
fs.mkdirSync(bin, { recursive: true });

const mockGh = path.join(bin, "gh");
fs.writeFileSync(
  mockGh,
  `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "title": "[W11-04B] Build public Employer course and lesson URLs with SEO",
  "body": "## Product decision\\n\\nApproved 2026-09-25: public Courses/Lessons require human-readable URLs and SEO-first rendering.",
  "comments": []
}
JSON
`,
);
fs.chmodSync(mockGh, 0o755);

const env = {
  ...process.env,
  TMPDIR: hookTmp,
  PATH: bin + path.delimiter + process.env.PATH,
  TXKPRO_CI_PRESENT: "yes",
};

function runNode(args, { input = "", extraEnv = {} } = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...env, ...extraEnv },
  });
}

function hook(name, taskId, toolName, parameters = {}, result, success = true) {
  const key = name === "PreToolUse" ? "preToolUse" : "postToolUse";
  const payload = {
    taskId,
    [key]: {
      toolName,
      ...(name === "PreToolUse"
        ? { parameters }
        : { result, success, executionTimeMs: 1 }),
    },
  };
  const response = runNode([path.join(".cline", "hooks", name)], {
    input: JSON.stringify(payload),
  });
  assert.equal(response.status, 0, response.stderr);
  return JSON.parse(response.stdout || "{}");
}

function submit(taskId, prompt) {
  const response = runNode([path.join(".cline", "hooks", "UserPromptSubmit")], {
    input: JSON.stringify({
      taskId,
      userPromptSubmit: { prompt },
    }),
  });
  assert.equal(response.status, 0, response.stderr);
  return JSON.parse(response.stdout || "{}");
}

function markerPath(taskId) {
  return path.join(
    hookTmp,
    "txkpro-cline-confirmation-gates",
    taskId.replace(/[^A-Za-z0-9._-]/g, "_") + ".json",
  );
}

function marker(taskId) {
  return JSON.parse(fs.readFileSync(markerPath(taskId), "utf8"));
}

function selectorResult(issue = 53, taskId = "W11-04B") {
  return {
    selected: {
      issue,
      title: "[W11-04B] Build public Employer course and lesson URLs with SEO",
      eligibilityState: "AUTOMATED_GATE_PASSED_CONFIRMATIONS_PENDING",
      taskContext: { taskId },
      preflight: { automatedDefinitionOfReady: "PASS" },
    },
    provisionalCandidates: [
      {
        issue,
        eligibilityState: "AUTOMATED_GATE_PASSED_CONFIRMATIONS_PENDING",
        taskContext: { taskId },
      },
      {
        issue: 54,
        eligibilityState: "AUTOMATED_GATE_PASSED_CONFIRMATIONS_PENDING",
        taskContext: { taskId: "W11-04C" },
      },
    ],
    readOnlyConfirmationsRequired: true,
  };
}

function validEvidence() {
  return {
    issue: 53,
    taskId: "W11-04B",
    evidenceContract: "semantic-provenance-v3",
    confirmations: {
      rolesAndScopes: {
        status: "CONFIRMED",
        evidence: [{
          source: "docs/product-sources/core/TXKPRO_ROLE_PERMISSIONS_MATRIX.txt",
          locator: "EMPLOYER",
          finding: "The canonical role source defines employer_admin as an Employer operational administration role.",
          assertion: {
            subject: "employer_admin",
            predicate: "role_defined",
            values: ["employer operational administration"],
          },
          verification: {
            type: "source_text_match",
            needle: "- employer_admin: employer operational administration.",
          },
        }],
      },
      dataOwnership: {
        status: "CONFIRMED",
        evidence: [{
          source: "docs/product-sources/core/TXKPRO_DATA_OWNERSHIP_AND_SCOPE_RULES.txt",
          locator: "DATA CLASS: EMPLOYER PROFILE",
          finding: "The canonical data source identifies Employer Profile as owned by the Employer domain.",
          assertion: {
            subject: "EMPLOYER PROFILE",
            predicate: "data_class_owner",
            values: ["Employer domain"],
          },
          verification: {
            type: "source_text_match",
            needle: "DATA CLASS: EMPLOYER PROFILE\\nCanonical owner: Employer domain",
          },
        }],
      },
      statusesAndEvents: {
        status: "CONFIRMED",
        evidence: [{
          source: "docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt",
          locator: "4. PROGRAM_STATUS",
          finding: "The canonical status source defines draft, active, paused, and archived specifically for PROGRAM_STATUS.",
          assertion: {
            subject: "PROGRAM_STATUS",
            predicate: "status_family_defined",
            values: ["draft", "active", "paused", "archived"],
          },
          verification: {
            type: "source_text_match",
            needle: "4. PROGRAM_STATUS\\ndraft\\nactive\\npaused\\narchived",
          },
        }],
      },
      iaAndDesign: {
        status: "CONFIRMED",
        evidence: [{
          source: "docs/product-sources/ui/UI_DESIGN_SYSTEM_STANDARD.txt",
          locator: "0. AUTHORITY",
          finding: "The UI Design System Standard identifies itself as the authoritative UI and UX source for all TXKPRO applications.",
          assertion: {
            subject: "TXKPRO APPLICATIONS",
            predicate: "ui_authority_defined",
            values: ["AUTHORITATIVE UI / UX DESIGN SYSTEM SOURCE OF TRUTH"],
          },
          verification: {
            type: "source_text_match",
            needle: "THIS DOCUMENT IS THE AUTHORITATIVE UI / UX DESIGN SYSTEM SOURCE OF TRUTH\\nFOR ALL TXKPRO APPLICATIONS.",
          },
        }],
      },
      stagingTargets: {
        status: "CONFIRMED",
        evidence: [{
          source: "git-ref-check",
          checkType: "branch-presence",
          finding: "The CI staging Git ref exists in repository state.",
          assertion: {
            subject: "refs/heads/txkpro-ci-staging",
            predicate: "git_ref_exists",
            values: ["refs/heads/txkpro-ci-staging"],
          },
          verification: {
            type: "git_ref_exists",
            ref: "refs/heads/txkpro-ci-staging",
          },
        }],
      },
      credentials: {
        status: "CONFIRMED",
        evidence: [{
          source: "environment-variable-presence-check",
          checkType: "required-env-var-presence",
          finding: "TXKPRO_CI_PRESENT is present without printing its value.",
          assertion: {
            subject: "TXKPRO_CI_PRESENT",
            predicate: "credential_present",
            values: ["TXKPRO_CI_PRESENT"],
          },
          verification: {
            type: "env_presence",
            name: "TXKPRO_CI_PRESENT",
          },
        }],
      },
      manualUat: {
        status: "CONFIRMED",
        evidence: [{
          source: "docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md",
          locator: "Standing user instruction:",
          finding: "The governance protocol says not to spend time running browser-based tests against the staging environment.",
          assertion: {
            subject: "browser-based tests against the staging environment",
            predicate: "uat_requirement_defined",
            values: ["Do not spend time"],
          },
          verification: {
            type: "source_text_match",
            needle: "- Do not spend time running browser-based tests against the staging environment.",
          },
        }],
      },
      unresolvedDecisions: {
        status: "CONFIRMED",
        evidence: [{
          source: "github-issue:#53",
          locator: "Product decision",
          finding: "The live issue contains an approved decision that public Courses/Lessons require human-readable URLs and SEO-first rendering.",
          assertion: {
            subject: "public Courses/Lessons",
            predicate: "decision_resolved",
            values: ["human-readable URLs", "SEO-first rendering"],
          },
          verification: {
            type: "github_issue_text_match",
            issue: 53,
            repository: "QaloriHQ/txkpro-workforce",
            needle: "Approved 2026-09-25: public Courses/Lessons require human-readable URLs and SEO-first rendering.",
          },
        }],
      },
    },
    implementationPlan: {
      contract: "sourced-plan-v1",
      decisions: [
        {
          kind: "url_pattern",
          name: "human-readable URLs",
          basis: "SOURCED",
          label: "",
          confirmation: "unresolvedDecisions",
          evidenceIndex: 0,
        },
        {
          kind: "test_requirement",
          name: "browser-based tests against the staging environment",
          basis: "SOURCED",
          label: "",
          confirmation: "manualUat",
          evidenceIndex: 0,
        },
        {
          kind: "api_route",
          name: "/employer/[employer-slug]/training/[course-slug]",
          basis: "PROPOSED",
          label: "PROPOSED — requires product/technical decision",
          confirmation: "",
          evidenceIndex: 0,
        },
      ],
    },
  };
}

function writeEvidence(name, evidence) {
  const target = path.join(tmp, name);
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  return target;
}

function runValidator(evidencePath, extraEnv = {}) {
  return runNode(
    ["scripts/txkpro-confirmation-check.mjs", "--evidence", evidencePath],
    { extraEnv },
  );
}

function arm(taskId, evidencePath) {
  return hook(
    "PreToolUse",
    taskId,
    "run_commands",
    { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
  );
}

function postValidator(taskId, output, success = true) {
  return hook("PostToolUse", taskId, "run_commands", {}, output, success);
}

function initializePending(taskId = "task-123") {
  const submitResult = submit(taskId, "What's next?");
  assert.match(submitResult.contextModification, /semantic-provenance-v3/);
  hook(
    "PostToolUse",
    taskId,
    "run_commands",
    {},
    JSON.stringify(selectorResult()),
    true,
  );
  const current = marker(taskId);
  assert.equal(current.state, "READ_ONLY_CONFIRMATIONS_REQUIRED");
  assert.equal(current.automatedGatePassed, true);
  assert.equal(current.provisionalIssue, 53);
  assert.equal(current.provisionalTaskId, "W11-04B");
  return current;
}

try {
  const ref = spawnSync("git", ["update-ref", "refs/heads/txkpro-ci-staging", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(ref.status, 0, ref.stderr);

  const validPath = writeEvidence("valid.json", validEvidence());
  const validRun = runValidator(validPath);
  assert.equal(validRun.status, 0, validRun.stderr);
  const validResult = JSON.parse(validRun.stdout);
  assert.equal(validResult.type, runtime.RESULT_TYPE);
  assert.equal(validResult.schemaVersion, runtime.RESULT_SCHEMA_VERSION);
  assert.equal(validResult.status, "CONFIRMED");
  assert.deepEqual(validResult.successSentinels.sort(), [
    runtime.CONFIRMATION_SENTINEL,
    runtime.PLAN_SENTINEL,
  ].sort());
  assert.equal(runtime.validateConfirmedArtifact(validResult, {
    issue: 53,
    taskId: "W11-04B",
  }).length, 0);

  const v2 = validEvidence();
  v2.evidenceContract = "semantic-provenance-v2";
  const v2Run = runValidator(writeEvidence("v2.json", v2));
  assert.equal(v2Run.status, 2);
  assert.match(v2Run.stderr, /semantic-provenance-v3/);

  const unsupportedRun = runValidator(
    path.join(".github", "fixtures", "w11-04b-unsupported-confirmations.json"),
    { SEO_METADATA_API_KEY: "present-only-for-fixture" },
  );
  assert.equal(unsupportedRun.status, 2);
  assert.match(
    unsupportedRun.stderr,
    /assertion subject and every asserted value|does not contain the assertion/i,
  );

  initializePending();

  for (const toolName of [
    "attempt_completion",
    "ask_followup_question",
    "switch_mode",
  ]) {
    const blocked = hook("PreToolUse", "task-123", toolName, {});
    assert.equal(blocked.cancel, true, toolName + " must be blocked while pending");
  }

  const onlyConfirmation = JSON.stringify({
    ...validResult,
    successSentinels: [runtime.CONFIRMATION_SENTINEL],
  });
  arm("task-123", validPath);
  postValidator("task-123", onlyConfirmation, true);
  assert.equal(marker("task-123").state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

  const onlyPlan = JSON.stringify({
    ...validResult,
    successSentinels: [runtime.PLAN_SENTINEL],
  });
  arm("task-123", validPath);
  postValidator("task-123", onlyPlan, true);
  assert.equal(marker("task-123").state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

  postValidator(
    "task-123",
    runtime.CONFIRMATION_SENTINEL + "\n" + runtime.PLAN_SENTINEL,
    true,
  );
  assert.equal(marker("task-123").state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

  arm("task-123", validPath);
  postValidator(
    "task-123",
    "{\"note\":\"" +
      runtime.CONFIRMATION_SENTINEL +
      " " +
      runtime.PLAN_SENTINEL +
      "\"}",
    true,
  );
  assert.equal(marker("task-123").state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

  const mismatched = validEvidence();
  mismatched.issue = 54;
  mismatched.taskId = "W11-04C";
  const mismatchPath = writeEvidence("mismatch.json", mismatched);
  const mismatchRun = runValidator(mismatchPath);
  assert.equal(mismatchRun.status, 0, mismatchRun.stderr);
  arm("task-123", mismatchPath);
  postValidator("task-123", mismatchRun.stdout, true);
  assert.equal(marker("task-123").state, "READ_ONLY_CONFIRMATIONS_REQUIRED");
  assert.match(
    JSON.stringify(marker("task-123").lastValidationFailure),
    /identity does not match/,
  );

  arm("task-123", validPath);
  postValidator("task-123", validRun.stdout, true);
  const cleared = marker("task-123");
  assert.equal(cleared.state, "CONFIRMED_AWAITING_APPROVAL");
  assert.equal(cleared.issue, 53);
  assert.equal(cleared.roadmapTaskId, "W11-04B");
  assert.equal(cleared.validatorSuccess, true);
  assert.equal(cleared.confirmationResult, "CONFIRMED");
  assert.equal(cleared.planResult, "CONFIRMED");
  assert.equal(cleared.evidenceContract, "semantic-provenance-v3");
  assert.equal(cleared.planContract, "sourced-plan-v1");
  assert.equal(cleared.validationId, validResult.validationId);
  assert.equal(cleared.evidenceDigest, validResult.evidenceDigest);
  assert.deepEqual(
    cleared.validatedImplementationPlan,
    validResult.implementationPlan,
  );
  assert.deepEqual(cleared.validatedConfirmations, validResult.confirmations);
  assert.match(cleared.ownerFacingResponse, /Validation audit:/);
  assert.match(
    cleared.ownerFacingResponse,
    /PROPOSED — requires product\/technical decision/,
  );

  const exact = hook("PreToolUse", "task-123", "attempt_completion", {
    result: cleared.ownerFacingResponse,
  });
  assert.equal(exact.cancel, false);

  const injected = hook("PreToolUse", "task-123", "attempt_completion", {
    result:
      cleared.ownerFacingResponse +
      "\n- status=course_live — approved canonical Course status",
  });
  assert.equal(injected.cancel, true);
  assert.match(injected.errorMessage, /does not exactly match/);

  assert.equal(
    runtime.parseValidatorInvocation("run_commands", {
      command:
        "echo " +
        runtime.CONFIRMATION_SENTINEL +
        " " +
        runtime.PLAN_SENTINEL,
    }),
    null,
  );
  assert.equal(
    runtime.parseValidatorInvocation("run_commands", {
      command:
        "node scripts/txkpro-confirmation-check.mjs --evidence /tmp/x.json && echo " +
        runtime.CONFIRMATION_SENTINEL,
    }),
    null,
  );

  console.log("TXKPRO_CONFIRMATION_RUNTIME_TESTS_PASSED");
} finally {
  spawnSync("git", ["update-ref", "-d", "refs/heads/txkpro-ci-staging"], {
    cwd: root,
    encoding: "utf8",
  });
  fs.rmSync(tmp, { recursive: true, force: true });
}
