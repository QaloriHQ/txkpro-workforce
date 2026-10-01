#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../.cline/hooks/txkpro-orchestration-runtime.cjs");

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "txkpro-orchestration-"));
const hookTmp = path.join(tmp, "hook-tmp");
const usageState = path.join(tmp, "usage-state");
const clineDataDir = path.join(tmp, "cline-data");
const slackLifecycleOut = path.join(tmp, "slack-lifecycle.jsonl");
const slackLifecycleState = path.join(tmp, "slack-lifecycle-state");
fs.mkdirSync(hookTmp, { recursive: true });
fs.mkdirSync(usageState, { recursive: true });
fs.mkdirSync(slackLifecycleState, { recursive: true });

const slackBindingsPath = path.join(
  clineDataDir,
  "connectors",
  "slack",
  "TXKPRO-Cline.threads.json",
);
fs.mkdirSync(path.dirname(slackBindingsPath), { recursive: true });

function buildContract() {
  const value = {
    type: runtime.CHAT_CONTRACT_TYPE,
    schemaVersion: runtime.CHAT_CONTRACT_SCHEMA,
    orchestrator: runtime.CHAT_ORCHESTRATOR,
    executor: runtime.CLINE_EXECUTOR,
    state: runtime.CHAT_CONTRACT_READY,
    issue: 53,
    taskId: "W11-04B",
    confirmationValidationId: "a".repeat(64),
    evidenceDigest: "b".repeat(64),
    sourcePlanContract: "sourced-plan-v1",
    createdAt: "2026-10-01T20:00:00.000Z",
    scope: {
      summary: "Implement only the ChatGPT-approved employer route behavior.",
      allowedPaths: ["app/employer/**", "tests/employer/**"],
      steps: [
        "Implement the approved route behavior.",
        "Run required verification.",
        "Return the structured execution result.",
      ],
      decisions: [
        {
          kind: "url_pattern",
          name: "human-readable Employer course URL",
          basis: "SOURCED",
          sourceRef: "confirmation:unresolvedDecisions[0]",
        },
      ],
    },
    verification: {
      commands: ["npm run typecheck", "npm run lint", "npm run build"],
      manualUat: ["User-owned browser UAT."],
    },
    boundaries: {
      mutationAuthorized: false,
      productionDeploymentAuthorized: false,
      productionMigrationAuthorized: false,
    },
    contractId: "",
  };
  value.contractId = runtime.expectedContractId(value);
  return value;
}

const contract = buildContract();
const issueFixture = path.join(tmp, "issue.json");
fs.writeFileSync(
  issueFixture,
  JSON.stringify(
    {
      number: 53,
      title: "[W11-04B] Build public Employer course and lesson URLs with SEO",
      body: "**Task ID:** W11-04B",
      comments: [
        {
          author: { login: "QaloriHQ" },
          createdAt: "2026-10-01T20:01:00.000Z",
          url: "https://github.com/QaloriHQ/txkpro-workforce/issues/53#issuecomment-test",
          body:
            runtime.CHAT_CONTRACT_MARKER +
            "\n~~~json\n" +
            JSON.stringify(contract, null, 2) +
            "\n~~~",
        },
      ],
    },
    null,
    2,
  ),
);

const usageIssue = path.join(tmp, "usage-issue.json");
fs.writeFileSync(
  usageIssue,
  JSON.stringify({
    number: 53,
    title: "[W11-04B] Build public Employer course and lesson URLs with SEO",
    body: "**Task ID:** W11-04B\n**Dependencies:** None",
  }),
);

const env = {
  ...process.env,
  TMPDIR: hookTmp,
  TXKPRO_AGENT_USAGE_STATE_DIR: usageState,
  TXKPRO_AGENT_USAGE_NO_SYNC: "true",
  TXKPRO_AGENT_USAGE_ISSUE_FILE: usageIssue,
  TXKPRO_CHAT_CONTRACT_ISSUE_FILE: issueFixture,
  CLINE_DATA_DIR: clineDataDir,
  TXKPRO_SLACK_LIFECYCLE_TEST_OUT: slackLifecycleOut,
  TXKPRO_SLACK_LIFECYCLE_STATE_DIR: slackLifecycleState,
};

function runNode(args, input = "", extraEnv = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...env, ...extraEnv },
  });
}

function submit(taskId, prompt, extraEnv = {}) {
  const response = runNode(
    [path.join(".cline", "hooks", "UserPromptSubmit")],
    JSON.stringify({ taskId, userPromptSubmit: { prompt } }),
    extraEnv,
  );
  assert.equal(response.status, 0, response.stderr);
  return JSON.parse(response.stdout || "{}");
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
  const response = runNode(
    [path.join(".cline", "hooks", name)],
    JSON.stringify(payload),
  );
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

function writeSlackBinding(taskId) {
  const channel = "C123";
  const threadTs = "1700000000.000001";
  const threadId = "slack:" + channel + ":" + threadTs;
  fs.writeFileSync(
    slackBindingsPath,
    JSON.stringify(
      {
        [threadId]: {
          kind: "conversation",
          channelId: "slack:" + channel,
          isDM: false,
          serializedThread: JSON.stringify({
            id: threadId,
            channelId: "slack:" + channel,
            isDM: false,
            state: { sessionId: taskId },
          }),
          sessionId: taskId,
          state: { sessionId: taskId },
          updatedAt: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

function slackEvents() {
  if (!fs.existsSync(slackLifecycleOut)) return [];
  return fs
    .readFileSync(slackLifecycleOut, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

try {
  assert.equal(runtime.validateContract(contract).length, 0);
  assert.equal(contract.contractId, runtime.expectedContractId(contract));

  const resolved = runNode([
    "scripts/txkpro-chat-contract.mjs",
    "resolve",
    "--issue",
    "53",
    "--task-id",
    "W11-04B",
    "--issue-file",
    issueFixture,
  ]);
  assert.equal(resolved.status, 0, resolved.stderr);
  const resolution = JSON.parse(resolved.stdout);
  assert.equal(resolution.status, "READY");
  assert.equal(resolution.contractId, contract.contractId);

  const whatsNext = submit("chat-required", "What's next?");
  assert.equal(whatsNext.cancel, false);
  assert.match(whatsNext.contextModification, /ChatGPT Chat mode/);
  assert.equal(marker("chat-required").state, "CHAT_ORCHESTRATION_REQUIRED");

  const noReasoningTool = hook(
    "PreToolUse",
    "chat-required",
    "run_commands",
    { command: "node scripts/roadmap-next-eligible.mjs --json" },
  );
  assert.equal(noReasoningTool.cancel, true);

  writeSlackBinding("cline-act-1");
  const act = submit("cline-act-1", "Implement W11-04B");
  assert.equal(act.cancel, false);
  assert.match(act.contextModification, /CLINE ACT EXECUTOR/);
  const active = marker("cline-act-1");
  assert.equal(active.state, "IMPLEMENTATION_RUN_ACTIVE");
  assert.equal(active.chatContractId, contract.contractId);
  assert.equal(active.issue, 53);
  assert.equal(active.roadmapTaskId, "W11-04B");
  const readyEvents = slackEvents();
  assert.equal(readyEvents.length, 1);
  assert.equal(readyEvents[0].lifecycleState, "READY_TO_BEGIN");
  assert.equal(readyEvents[0].payload.channel, "C123");
  assert.equal(readyEvents[0].payload.thread_ts, "1700000000.000001");
  assert.match(readyEvents[0].payload.text, /READY TO BEGIN/);
  assert.match(readyEvents[0].payload.text, /W11-04B/);

  const outside = hook("PreToolUse", "cline-act-1", "write_to_file", {
    path: "app/admin/not-allowed.ts",
    content: "x",
  });
  assert.equal(outside.cancel, true);
  assert.match(outside.errorMessage, /outside the ChatGPT implementation contract/);

  const inside = hook("PreToolUse", "cline-act-1", "write_to_file", {
    path: "app/employer/course/page.tsx",
    content: "x",
  });
  assert.equal(inside.cancel, false);

  const premature = hook("PreToolUse", "cline-act-1", "attempt_completion", {
    result: "done",
  });
  assert.equal(premature.cancel, true);
  assert.match(premature.errorMessage, /structured execution result/);

  const contractPath = active.chatContractPath;
  const executionPath = path.join(tmp, "execution.json");
  fs.writeFileSync(
    executionPath,
    JSON.stringify(
      {
        type: runtime.EXECUTION_RESULT_TYPE,
        schemaVersion: runtime.EXECUTION_RESULT_SCHEMA,
        executor: runtime.CLINE_EXECUTOR,
        issue: 53,
        taskId: "W11-04B",
        contractId: contract.contractId,
        status: "IMPLEMENTED",
        summary: "Implemented only the approved employer route scope.",
        changedPaths: ["app/employer/course/page.tsx"],
        verification: [
          { command: "npm run typecheck", result: "PASS", exitCode: 0 },
          { command: "npm run lint", result: "PASS", exitCode: 0 },
          { command: "npm run build", result: "PASS", exitCode: 0 },
        ],
        deviations: [],
        blockers: [],
        productionDeploymentPerformed: false,
        productionMigrationPerformed: false,
      },
      null,
      2,
    ),
  );

  const command =
    "node scripts/txkpro-cline-execution-check.mjs --result " +
    executionPath +
    " --contract " +
    contractPath;
  const armed = hook("PreToolUse", "cline-act-1", "run_commands", { command });
  assert.equal(armed.cancel, false);
  assert.match(armed.contextModification, /execution validator armed/);

  hook(
    "PostToolUse",
    "cline-act-1",
    "run_commands",
    {},
    runtime.EXECUTION_SENTINEL,
    true,
  );
  assert.equal(marker("cline-act-1").state, "IMPLEMENTATION_RUN_ACTIVE");

  hook("PreToolUse", "cline-act-1", "run_commands", { command });
  const validation = runNode([
    "scripts/txkpro-cline-execution-check.mjs",
    "--result",
    executionPath,
    "--contract",
    contractPath,
  ]);
  assert.equal(validation.status, 0, validation.stderr);
  hook("PostToolUse", "cline-act-1", "run_commands", {}, validation.stdout, true);

  const reviewed = marker("cline-act-1");
  assert.equal(reviewed.state, "EXECUTION_VALIDATED_AWAITING_CHAT_REVIEW");
  assert.match(reviewed.executorFacingResponse, /ChatGPT Chat verification required/);

  const finalized = hook(
    "PreToolUse",
    "cline-act-1",
    "attempt_completion",
    { result: reviewed.executorFacingResponse },
  );
  assert.equal(finalized.cancel, false);
  const finished = marker("cline-act-1");
  assert.equal(finished.state, "RUN_COMPLETE_AWAITING_CHAT_VERIFICATION");

  const lifecycleEvents = slackEvents();
  assert.equal(lifecycleEvents.length, 2);
  assert.equal(
    lifecycleEvents[1].lifecycleState,
    "STOPPED_AWAITING_CHAT_VERIFICATION",
  );
  assert.equal(lifecycleEvents[1].payload.channel, "C123");
  assert.equal(lifecycleEvents[1].payload.thread_ts, "1700000000.000001");
  assert.match(lifecycleEvents[1].payload.text, /STOPPED/);
  assert.match(lifecycleEvents[1].payload.text, /Awaiting ChatGPT verification/);
  assert.match(lifecycleEvents[1].payload.text, /not Done/);

  const complete = runNode(
    [path.join(".cline", "hooks", "TaskComplete")],
    JSON.stringify({ taskId: "cline-act-1" }),
  );
  assert.equal(complete.status, 0, complete.stderr);
  assert.equal(slackEvents().length, 2, "STOPPED notification must be idempotent");

  const scopeViolation = JSON.parse(fs.readFileSync(executionPath, "utf8"));
  scopeViolation.changedPaths = ["app/admin/outside.ts"];
  const badExecution = path.join(tmp, "execution-bad.json");
  fs.writeFileSync(badExecution, JSON.stringify(scopeViolation, null, 2));
  const bad = runNode([
    "scripts/txkpro-cline-execution-check.mjs",
    "--result",
    badExecution,
    "--contract",
    contractPath,
  ]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /outside ChatGPT contract scope/);

  console.log("TXKPRO_CHAT_CLINE_ORCHESTRATION_TESTS_PASSED");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
