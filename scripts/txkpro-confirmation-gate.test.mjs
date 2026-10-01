#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "txkpro-gate-test-"));
const hookTmp = path.join(temporaryRoot, "hook-tmp");
const testBin = path.join(temporaryRoot, "bin");
fs.mkdirSync(hookTmp, { recursive: true });
fs.mkdirSync(testBin, { recursive: true });

const issueBody = [
  "Employer Course management capability is assigned to Employer Admin.",
  "Employer Course and Lesson public pages owner is Employer.",
  "COURSE_PUBLICATION_STATUS values are draft and published.",
  "EMPLOYER_LEARNING_PUBLICATION_CHANGED event is emitted for Course publication.",
  "Public Course route uses /employers/[employer-slug]/courses/[course-slug].",
  "Public Course URL pattern is human-readable and SEO-first.",
  "Public Courses and Lessons require human-readable URLs and SEO-first rendering.",
].join("\n");

const ghPath = path.join(testBin, "gh");
fs.writeFileSync(
  ghPath,
  "#!/usr/bin/env node\n" +
    "process.stdout.write(JSON.stringify({title:'[W11-04B] Build public Employer course and lesson URLs with SEO',body:" +
    JSON.stringify(issueBody) +
    ",comments:[]}));\n",
  { mode: 0o755 },
);

const env = {
  ...process.env,
  TMPDIR: hookTmp,
  PATH: testBin + path.delimiter + process.env.PATH,
  TXKPRO_CI_PRESENT: "yes",
};

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    ...options,
  });
}

function runHook(name, input) {
  const result = run(process.execPath, [path.join(repoRoot, ".cline", "hooks", name)], {
    input: JSON.stringify(input),
  });
  assert.equal(result.status, 0, result.stderr || name + " failed");
  return JSON.parse(result.stdout);
}

function gatePath(taskId) {
  return path.join(hookTmp, "txkpro-cline-confirmation-gates", taskId + ".json");
}

function readGate(taskId) {
  return JSON.parse(fs.readFileSync(gatePath(taskId), "utf8"));
}

function initializeCandidate(taskId, issue = 53, roadmapTaskId = "W11-04B") {
  const prompt = runHook("UserPromptSubmit", {
    taskId,
    workspaceRoots: [repoRoot],
    userPromptSubmit: { prompt: "What's next?" },
  });
  assert.match(prompt.contextModification, /canonical result artifact/);

  const selector = runHook("PostToolUse", {
    taskId,
    workspaceRoots: [repoRoot],
    postToolUse: {
      toolName: "run_commands",
      parameters: { command: "node scripts/roadmap-next-eligible.mjs" },
      success: true,
      result: JSON.stringify({
        eligibilityState: "AUTOMATED_GATE_PASSED_CONFIRMATIONS_PENDING",
        readOnlyConfirmationsRequired: true,
        issue,
        taskId: roadmapTaskId,
      }),
    },
  });
  assert.match(selector.contextModification, /provisional candidate bound/);
  return readGate(taskId);
}

run("git", ["update-ref", "refs/heads/txkpro-ci-staging", "HEAD"]);

const evidence = {
  issue: 53,
  taskId: "W11-04B",
  evidenceContract: "semantic-provenance-v3",
  confirmations: {
    rolesAndScopes: {
      status: "CONFIRMED",
      evidence: [{
        source: "github-issue:#53",
        locator: "Employer Learning capability",
        finding: "Employer Course management capability is assigned to Employer Admin.",
        assertion: {
          subject: "Employer Course management capability",
          predicate: "capability_defined",
          values: ["Employer Admin"],
        },
        verification: {
          type: "github_issue_text_match",
          issue: 53,
          repository: "QaloriHQ/txkpro-workforce",
          needle: "Employer Course management capability is assigned to Employer Admin.",
        },
      }],
    },
    dataOwnership: {
      status: "CONFIRMED",
      evidence: [{
        source: "github-issue:#53",
        locator: "Employer Learning ownership",
        finding: "Employer owns Employer Course and Lesson public pages.",
        assertion: {
          subject: "Employer Course and Lesson public pages",
          predicate: "data_class_owner",
          values: ["Employer"],
        },
        verification: {
          type: "github_issue_text_match",
          issue: 53,
          repository: "QaloriHQ/txkpro-workforce",
          needle: "Employer Course and Lesson public pages owner is Employer.",
        },
      }],
    },
    statusesAndEvents: {
      status: "CONFIRMED",
      evidence: [
        {
          source: "github-issue:#53",
          locator: "Course publication status",
          finding: "COURSE_PUBLICATION_STATUS uses draft and published.",
          assertion: {
            subject: "COURSE_PUBLICATION_STATUS",
            predicate: "status_family_defined",
            values: ["draft", "published"],
          },
          verification: {
            type: "github_issue_text_match",
            issue: 53,
            repository: "QaloriHQ/txkpro-workforce",
            needle: "COURSE_PUBLICATION_STATUS values are draft and published.",
          },
        },
        {
          source: "github-issue:#53",
          locator: "Course publication event",
          finding: "EMPLOYER_LEARNING_PUBLICATION_CHANGED is emitted for Course publication.",
          assertion: {
            subject: "EMPLOYER_LEARNING_PUBLICATION_CHANGED",
            predicate: "event_defined",
            values: ["Course publication"],
          },
          verification: {
            type: "github_issue_text_match",
            issue: 53,
            repository: "QaloriHQ/txkpro-workforce",
            needle: "EMPLOYER_LEARNING_PUBLICATION_CHANGED event is emitted for Course publication.",
          },
        },
      ],
    },
    iaAndDesign: {
      status: "CONFIRMED",
      evidence: [
        {
          source: "github-issue:#53",
          locator: "Public Course route",
          finding: "Public Course route uses /employers/[employer-slug]/courses/[course-slug].",
          assertion: {
            subject: "Public Course route",
            predicate: "route_pattern_defined",
            values: ["/employers/[employer-slug]/courses/[course-slug]"],
          },
          verification: {
            type: "github_issue_text_match",
            issue: 53,
            repository: "QaloriHQ/txkpro-workforce",
            needle: "Public Course route uses /employers/[employer-slug]/courses/[course-slug].",
          },
        },
        {
          source: "github-issue:#53",
          locator: "Public Course URL pattern",
          finding: "The Public Course URL pattern is human-readable and SEO-first.",
          assertion: {
            subject: "Public Course URL pattern",
            predicate: "ia_requirement_defined",
            values: ["human-readable", "SEO-first"],
          },
          verification: {
            type: "github_issue_text_match",
            issue: 53,
            repository: "QaloriHQ/txkpro-workforce",
            needle: "Public Course URL pattern is human-readable and SEO-first.",
          },
        },
      ],
    },
    stagingTargets: {
      status: "CONFIRMED",
      evidence: [{
        source: "git-ref-check",
        checkType: "branch-presence",
        finding: "refs/heads/txkpro-ci-staging exists as the explicit CI staging Git ref.",
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
        finding: "TXKPRO_CI_PRESENT exists without exposing its value.",
        assertion: {
          subject: "TXKPRO_CI_PRESENT",
          predicate: "credential_present",
          values: ["TXKPRO_CI_PRESENT"],
        },
        verification: { type: "env_presence", name: "TXKPRO_CI_PRESENT" },
      }],
    },
    manualUat: {
      status: "CONFIRMED",
      evidence: [{
        source: "docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md",
        locator: "Standing user instruction:",
        finding: "Do not spend time on browser-based tests against the staging environment.",
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
        locator: "Public URL decision",
        finding: "Public Courses and Lessons require human-readable URLs and SEO-first rendering.",
        assertion: {
          subject: "Public Courses and Lessons",
          predicate: "decision_resolved",
          values: ["human-readable URLs", "SEO-first rendering"],
        },
        verification: {
          type: "github_issue_text_match",
          issue: 53,
          repository: "QaloriHQ/txkpro-workforce",
          needle: "Public Courses and Lessons require human-readable URLs and SEO-first rendering.",
        },
      }],
    },
  },
  implementationPlan: {
    contract: "sourced-plan-v1",
    coverage: {
      api_route: "DECISIONS",
      database_field: "NOT_APPLICABLE",
      status: "DECISIONS",
      event: "DECISIONS",
      url_pattern: "DECISIONS",
      credential: "DECISIONS",
      owner: "DECISIONS",
    },
    notApplicableReasons: {
      database_field: "This fixture does not introduce a database-field decision.",
    },
    decisions: [
      { kind: "api_route", name: "/employers/[employer-slug]/courses/[course-slug]", basis: "SOURCED", label: "", confirmation: "iaAndDesign", evidenceIndex: 0 },
      { kind: "status", name: "COURSE_PUBLICATION_STATUS", basis: "SOURCED", label: "", confirmation: "statusesAndEvents", evidenceIndex: 0 },
      { kind: "event", name: "EMPLOYER_LEARNING_PUBLICATION_CHANGED", basis: "SOURCED", label: "", confirmation: "statusesAndEvents", evidenceIndex: 1 },
      { kind: "url_pattern", name: "human-readable", basis: "SOURCED", label: "", confirmation: "iaAndDesign", evidenceIndex: 1 },
      { kind: "credential", name: "TXKPRO_CI_PRESENT", basis: "SOURCED", label: "", confirmation: "credentials", evidenceIndex: 0 },
      { kind: "owner", name: "Employer", basis: "SOURCED", label: "", confirmation: "dataOwnership", evidenceIndex: 0 },
      { kind: "test_requirement", name: "browser-based tests against the staging environment", basis: "SOURCED", label: "", confirmation: "manualUat", evidenceIndex: 0 },
    ],
  },
};

const evidencePath = path.join(hookTmp, "confirmations.json");
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

const invalidEvidence = structuredClone(evidence);
invalidEvidence.confirmations.statusesAndEvents.evidence = [{
  source: "docs/product-sources/core/TXKPRO_STATUS_DICTIONARY.txt",
  locator: "4. PROGRAM_STATUS",
  finding: "PROGRAM_STATUS contains draft, active, paused, and archived.",
  assertion: {
    subject: "PROGRAM_STATUS",
    predicate: "status_family_defined",
    values: ["draft", "active", "paused", "archived"],
  },
  verification: {
    type: "source_text_match",
    needle: "4. PROGRAM_STATUS\ndraft\nactive\npaused\narchived",
  },
}];
const invalidPath = path.join(temporaryRoot, "semantic-leap.json");
fs.writeFileSync(invalidPath, JSON.stringify(invalidEvidence, null, 2));
const invalid = run(process.execPath, [
  "scripts/txkpro-confirmation-check.mjs",
  "--evidence",
  invalidPath,
]);
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /candidate-specific evidence/);

const taskId = "task-123";
initializeCandidate(taskId);

for (const toolName of [
  "submit_and_exit",
  "attempt_completion",
  "ask_question",
  "ask_followup_question",
  "apply_patch",
]) {
  const blocked = runHook("PreToolUse", {
    taskId,
    workspaceRoots: [repoRoot],
    preToolUse: { toolName, parameters: { response: "unsupported confirmation" } },
  });
  assert.equal(blocked.cancel, true, toolName + " must be blocked while pending");
}

const temporaryEvidenceWrite = runHook("PreToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  preToolUse: {
    toolName: "write_to_file",
    parameters: { path: path.join(hookTmp, "allowed-evidence.json") },
  },
});
assert.equal(temporaryEvidenceWrite.cancel, false);

const repositoryWrite = runHook("PreToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  preToolUse: {
    toolName: "write_to_file",
    parameters: { path: path.join(repoRoot, "unsupported.json") },
  },
});
assert.equal(repositoryWrite.cancel, true);

const taskComplete = runHook("TaskComplete", {
  taskId,
  workspaceRoots: [repoRoot],
});
assert.equal(taskComplete.cancel, true);

const fakeSentinels = [
  "TXKPRO_CONFIRMATIONS_CONFIRMED",
  "TXKPRO_PLAN_CONTRACT_CONFIRMED",
  JSON.stringify({ issue: 53, taskId: "W11-04B" }),
].join("\n");
runHook("PostToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "echo harmless" },
    success: true,
    result: fakeSentinels,
  },
});
assert.equal(readGate(taskId).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

runHook("PostToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "read_file",
    parameters: { path: ".github/workflows/ci.yml" },
    success: true,
    result: fakeSentinels,
  },
});
assert.equal(readGate(taskId).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

const failedTask = "task-failed-validator";
initializeCandidate(failedTask);
runHook("PostToolUse", {
  taskId: failedTask,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
    success: false,
    result: fakeSentinels,
  },
});
assert.equal(readGate(failedTask).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

const validatorArgs = [
  "scripts/txkpro-confirmation-check.mjs",
  "--evidence",
  evidencePath,
];
let validator = run(process.execPath, validatorArgs);
assert.equal(validator.status, 0, validator.stderr);
assert.match(validator.stdout, /TXKPRO_CONFIRMATIONS_CONFIRMED/);
assert.match(validator.stdout, /TXKPRO_PLAN_CONTRACT_CONFIRMED/);

fs.appendFileSync(evidencePath, "\n");
let post = runHook("PostToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
    success: true,
    result: validator.stdout,
  },
});
assert.match(post.contextModification, /evidence hash mismatch/);
assert.equal(readGate(taskId).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

validator = run(process.execPath, validatorArgs);
assert.equal(validator.status, 0, validator.stderr);
post = runHook("PostToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
    success: true,
    result: validator.stdout,
  },
});
assert.match(post.contextModification, /validator-attested eligibility is ready/);
let gate = readGate(taskId);
assert.equal(gate.state, "ELIGIBILITY_CONFIRMED_READY_TO_PRESENT");
assert.equal(gate.confirmationSentinelSeen, true);
assert.equal(gate.planSentinelSeen, true);
assert.equal(gate.evidenceContract, "semantic-provenance-v3");
assert.equal(gate.planContract, "sourced-plan-v1");

const alteredPresentation = runHook("PreToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  preToolUse: {
    toolName: "submit_and_exit",
    parameters: { response: gate.canonicalPresentation + "\nUnsupported addition" },
  },
});
assert.equal(alteredPresentation.cancel, true);

const canonicalPresentation = runHook("PreToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  preToolUse: {
    toolName: "submit_and_exit",
    parameters: { response: gate.canonicalPresentation },
  },
});
assert.equal(canonicalPresentation.cancel, false);
gate = readGate(taskId);
assert.equal(gate.state, "CONFIRMED_AWAITING_APPROVAL");

const mutation = runHook("PreToolUse", {
  taskId,
  workspaceRoots: [repoRoot],
  preToolUse: { toolName: "apply_patch", parameters: {} },
});
assert.equal(mutation.cancel, true);

const mismatchTask = "task-mismatch";
initializeCandidate(mismatchTask, 54, "W11-04C");
post = runHook("PostToolUse", {
  taskId: mismatchTask,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
    success: true,
    result: validator.stdout,
  },
});
assert.match(post.contextModification, /candidate issue mismatch|candidate Task ID mismatch/);
assert.equal(readGate(mismatchTask).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

const staleTask = "task-stale-result";
initializeCandidate(staleTask);
const resultPath = evidencePath + ".eligibility-result.json";
const staleArtifact = JSON.parse(fs.readFileSync(resultPath, "utf8"));
staleArtifact.validatedAt = "2000-01-01T00:00:00.000Z";
fs.writeFileSync(resultPath, JSON.stringify(staleArtifact, null, 2));
post = runHook("PostToolUse", {
  taskId: staleTask,
  workspaceRoots: [repoRoot],
  postToolUse: {
    toolName: "run_commands",
    parameters: { command: "node scripts/txkpro-confirmation-check.mjs --evidence " + evidencePath },
    success: true,
    result: validator.stdout,
  },
});
assert.match(post.contextModification, /stale or has an invalid timestamp/);
assert.equal(readGate(staleTask).state, "READ_ONLY_CONFIRMATIONS_REQUIRED");

const template = JSON.parse(
  fs.readFileSync(".github/TXKPRO_READONLY_CONFIRMATION_TEMPLATE.json", "utf8"),
);
assert.equal(template.evidenceContract, "semantic-provenance-v3");
assert.equal(template.implementationPlan.contract, "sourced-plan-v1");
for (const kind of [
  "api_route",
  "database_field",
  "status",
  "event",
  "url_pattern",
  "credential",
  "owner",
]) {
  assert.ok(kind in template.implementationPlan.coverage);
  assert.ok(kind in template.implementationPlan.notApplicableReasons);
}

fs.rmSync(temporaryRoot, { recursive: true, force: true });
console.log("TXKPRO confirmation gate regression suite passed.");
