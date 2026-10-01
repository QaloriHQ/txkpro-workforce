#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const REPOSITORY =
  process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const MARKER = "<!-- txkpro-agent-usage:v1 -->";
const DATA_PREFIX = "<!-- txkpro-agent-usage-data:";
const DATA_SUFFIX = " -->";
const STATE_DIR =
  process.env.TXKPRO_AGENT_USAGE_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".txkpro", "agent-usage");

const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);

function argValue(name) {
  const index = ARGS.indexOf(name);
  return index >= 0 ? ARGS[index + 1] : undefined;
}

function hasArg(name) {
  return ARGS.includes(name);
}

function fail(message, code = 2) {
  console.error("[agent-usage] " + message);
  process.exit(code);
}

function safeId(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
}

function nowIso() {
  return new Date().toISOString();
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

function statePath(clineTaskId) {
  return path.join(STATE_DIR, safeId(clineTaskId) + ".json");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = filePath + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temp, filePath);
}

function runGh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_PAGER: "cat",
      GH_PROMPT_DISABLED: "1",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "GitHub command failed").trim(),
    );
  }

  return result.stdout || "";
}

function parseIssueNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function metadataValue(body, label) {
  const source = String(body || "");
  const needle = "**" + label + ":**";
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return "";
  const rest = source.slice(index + needle.length);
  const newline = rest.search(/\r?\n/);
  return (newline >= 0 ? rest.slice(0, newline) : rest).trim();
}

function inferTaskId(issue) {
  return metadataValue(issue?.body, "Task ID");
}

function resolveIssueByTaskId(taskId) {
  const query = "repo:" + REPOSITORY + " " + taskId + " in:title";
  const raw = runGh([
    "api",
    "search/issues",
    "-f",
    "q=" + query,
    "-F",
    "per_page=10",
  ]);
  const result = JSON.parse(raw);
  const items = Array.isArray(result?.items) ? result.items : [];
  const exact = items.find((item) =>
    String(item?.title || "")
      .toLowerCase()
      .includes("[" + String(taskId).toLowerCase() + "]"),
  );
  const selected = exact || items[0];
  if (!selected?.number) {
    throw new Error("Could not resolve GitHub issue for Task ID " + taskId + ".");
  }
  return Number(selected.number);
}

function fetchIssue(issueNumber) {
  return JSON.parse(
    runGh(["api", "repos/" + REPOSITORY + "/issues/" + issueNumber]),
  );
}

function loadIssueFixture(filePath) {
  const value = readJson(filePath);
  return value.issue && typeof value.issue === "object" ? value.issue : value;
}

function complexityFromIssue(issue) {
  const title = String(issue?.title || "");
  const body = String(issue?.body || "");
  const text = (title + "\n" + body).toLowerCase();

  const smallPattern =
    /(deploy and verify|run .*\bqa\b|clean up roadmap|narrow fix|copy change|explicit edit\/delete controls)/i;
  if (smallPattern.test(title)) {
    return {
      complexity: "SMALL",
      lowTokens: 70000,
      estimatedTokens: 105000,
      highTokens: 140000,
      method: "TXKPRO issue-complexity baseline v1",
    };
  }

  const veryLargeTerms = [
    "schema",
    "rls",
    "authorization",
    "cross-tenant",
    "role and scope",
    "event contract",
    "feature flags",
    "experimentation",
    "a/b testing",
    "mixpanel analytics foundation",
    "credential issuance",
    "payment",
    "payroll",
    "tremendous",
    "migration",
  ];
  const veryLargeHits = veryLargeTerms.filter((term) => text.includes(term)).length;
  if (veryLargeHits >= 2 || /canonical schema|security and ux qa/i.test(title)) {
    return {
      complexity: "VERY_LARGE",
      lowTokens: 500000,
      estimatedTokens: 675000,
      highTokens: 850000,
      method: "TXKPRO issue-complexity baseline v1",
    };
  }

  const largeTerms = [
    "backend",
    "workflow",
    "authoring",
    "analytics",
    "productionize",
    "directory",
    "reporting",
    "permissions",
    "media library",
    "guided onboarding",
    "instrument",
    "feedback system",
    "public roadmap",
    "retention intervention",
    "placement",
    "action center",
    "audit",
    "messaging",
    "scheduler",
    "multi-role",
    "cross-app",
  ];
  const largeHits = largeTerms.filter((term) => text.includes(term)).length;
  if (largeHits >= 1) {
    return {
      complexity: "LARGE",
      lowTokens: 300000,
      estimatedTokens: 425000,
      highTokens: 550000,
      method: "TXKPRO issue-complexity baseline v1",
    };
  }

  return {
    complexity: "MEDIUM",
    lowTokens: 150000,
    estimatedTokens: 225000,
    highTokens: 300000,
    method: "TXKPRO issue-complexity baseline v1",
  };
}

function estimateForIssue(issue) {
  const estimate = complexityFromIssue(issue);
  return {
    ...estimate,
    warningTokens: Math.round(estimate.estimatedTokens * 1.25),
    softBudgetTokens: Math.round(estimate.estimatedTokens * 1.5),
    escalationTokens: Math.round(estimate.estimatedTokens * 2.25),
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return "n/a";
  return Number(value).toLocaleString("en-US");
}

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "n/a";
  }
  return "$" + Number(value).toFixed(4);
}

function extractUsageData(body) {
  const source = String(body || "");
  const start = source.indexOf(DATA_PREFIX);
  if (start < 0) return null;
  const encodedStart = start + DATA_PREFIX.length;
  const end = source.indexOf(DATA_SUFFIX, encodedStart);
  if (end < 0) return null;

  try {
    const encoded = source.slice(encodedStart, end).trim();
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function encodeUsageData(data) {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function cumulativeForRuns(runs) {
  const finished = runs.filter((run) => run?.actual?.totalTokens !== undefined);
  return {
    runs: runs.length,
    finishedRuns: finished.length,
    totalTokens: finished.reduce(
      (sum, run) => sum + Number(run.actual?.totalTokens || 0),
      0,
    ),
    totalCostUsd: finished.reduce(
      (sum, run) => sum + Number(run.actual?.totalCostUsd || 0),
      0,
    ),
  };
}

function renderUsageComment(data) {
  const runs = Array.isArray(data.runs) ? data.runs : [];
  const cumulative = cumulativeForRuns(runs);
  data.cumulative = cumulative;
  data.updatedAt = nowIso();

  const lines = [
    MARKER,
    DATA_PREFIX + encodeUsageData(data) + DATA_SUFFIX,
    "",
    "## TXKPRO Agent Usage",
    "",
    "**Task:** " + (data.taskId || "unknown") + "  ",
    "**Issue:** #" + data.issue + "  ",
    "**Tracking:** one summary comment; updated before and after each agent run",
    "",
  ];

  for (const run of runs.slice(-20)) {
    lines.push("### Run " + run.runId);
    lines.push("");
    lines.push("**State:** " + String(run.state || "unknown") + "  ");
    lines.push("**Cline task:** " + String(run.clineTaskId || "unknown") + "  ");
    lines.push("**Started:** " + String(run.startedAt || "n/a") + "  ");
    if (run.completedAt) {
      lines.push("**Finished:** " + run.completedAt + "  ");
    }
    if (run.outcome) {
      lines.push("**Outcome:** " + run.outcome + "  ");
    }
    lines.push("");
    lines.push("**Before run**");
    lines.push("");
    lines.push(
      "- Estimated model tokens: " +
        formatNumber(run.estimate?.estimatedTokens),
    );
    lines.push(
      "- Expected range: " +
        formatNumber(run.estimate?.lowTokens) +
        "–" +
        formatNumber(run.estimate?.highTokens),
    );
    lines.push("- Complexity: " + (run.estimate?.complexity || "n/a"));
    lines.push(
      "- Warning / soft / escalation: " +
        formatNumber(run.estimate?.warningTokens) +
        " / " +
        formatNumber(run.estimate?.softBudgetTokens) +
        " / " +
        formatNumber(run.estimate?.escalationTokens),
    );
    lines.push("- Estimate method: " + (run.estimate?.method || "n/a"));
    lines.push(
      "- Models: Plan " +
        (run.models?.plan || "unknown") +
        "; Act " +
        (run.models?.act || "unknown"),
    );
    lines.push("");

    if (run.actual) {
      lines.push("**After run**");
      lines.push("");
      lines.push("- Input tokens: " + formatNumber(run.actual.tokensIn));
      lines.push("- Output tokens: " + formatNumber(run.actual.tokensOut));
      lines.push(
        "- Total model tokens: " + formatNumber(run.actual.totalTokens),
      );
      lines.push(
        "- Cache reads / writes: " +
          formatNumber(run.actual.cacheReads) +
          " / " +
          formatNumber(run.actual.cacheWrites),
      );
      lines.push("- Cost: " + formatUsd(run.actual.totalCostUsd));
      lines.push(
        "- Tool calls / failed tools: " +
          formatNumber(run.operations?.toolCalls || 0) +
          " / " +
          formatNumber(run.operations?.failedToolCalls || 0),
      );
      lines.push(
        "- Tool execution time: " +
          formatNumber(run.operations?.toolExecutionMs || 0) +
          " ms",
      );
      lines.push(
        "- Estimate variance: " +
          (run.actual.variancePercent === null ||
          run.actual.variancePercent === undefined
            ? "n/a"
            : (run.actual.variancePercent >= 0 ? "+" : "") +
              Number(run.actual.variancePercent).toFixed(1) +
              "%"),
      );
      lines.push("- Telemetry source: " + run.actual.telemetrySource);
      lines.push(
        "- Token accounting: input + output; cache counters are reported separately and are not double-counted",
      );
      lines.push("");
    }
  }

  lines.push("### Issue cumulative");
  lines.push("");
  lines.push("- Runs recorded: " + cumulative.runs);
  lines.push("- Runs with actuals: " + cumulative.finishedRuns);
  lines.push("- Total model tokens: " + formatNumber(cumulative.totalTokens));
  lines.push("- Total recorded cost: " + formatUsd(cumulative.totalCostUsd));
  lines.push("");
  lines.push(
    "_Raw per-request provider telemetry stays outside GitHub; this comment is the auditable per-run summary._",
  );

  return lines.join("\n");
}

function listIssueComments(issueNumber) {
  const raw = runGh([
    "api",
    "--paginate",
    "repos/" + REPOSITORY + "/issues/" + issueNumber + "/comments",
  ]);
  if (!raw.trim()) return [];
  return JSON.parse(raw.trim().replace(/\]\s*\[/g, ","));
}

function syncIssueComment(issueNumber, data) {
  if (hasArg("--no-sync")) return { synced: false, reason: "no-sync" };

  const comments = listIssueComments(issueNumber);
  const existing = comments.find((comment) =>
    String(comment?.body || "").includes(MARKER),
  );
  const body = renderUsageComment(data);

  if (existing?.id) {
    const response = JSON.parse(
      runGh([
        "api",
        "repos/" + REPOSITORY + "/issues/comments/" + existing.id,
        "-X",
        "PATCH",
        "-f",
        "body=" + body,
      ]),
    );
    return {
      synced: true,
      action: "updated",
      commentId: existing.id,
      url: response?.html_url || existing?.html_url || null,
    };
  }

  const response = JSON.parse(
    runGh([
      "api",
      "repos/" + REPOSITORY + "/issues/" + issueNumber + "/comments",
      "-f",
      "body=" + body,
    ]),
  );

  return {
    synced: true,
    action: "created",
    commentId: response?.id || null,
    url: response?.html_url || null,
  };
}

function loadIssueUsage(issueNumber, taskId) {
  if (hasArg("--no-sync")) {
    return {
      schemaVersion: 1,
      issue: issueNumber,
      taskId,
      repository: REPOSITORY,
      runs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  const comments = listIssueComments(issueNumber);
  const existing = comments.find((comment) =>
    String(comment?.body || "").includes(MARKER),
  );
  const parsed = existing ? extractUsageData(existing.body) : null;
  if (parsed) return parsed;

  return {
    schemaVersion: 1,
    issue: issueNumber,
    taskId,
    repository: REPOSITORY,
    runs: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makeRunId(taskId) {
  const timestamp = nowIso()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomBytes(2).toString("hex");
  return String(taskId || "task") + "-" + timestamp + "-" + suffix;
}

function clineRootCandidates() {
  const roots = new Set();
  if (process.env.CLINE_DATA_DIR?.trim()) {
    roots.add(path.resolve(process.env.CLINE_DATA_DIR.trim()));
  }
  roots.add(path.join(os.homedir(), ".cline"));
  return [...roots];
}

function candidateUsageFiles() {
  const files = [];
  for (const root of clineRootCandidates()) {
    const direct = [
      path.join(root, "data", "tasks", "taskHistory.json"),
      path.join(root, "data", "sessions", "sessions.index.json"),
      path.join(root, "tasks", "taskHistory.json"),
      path.join(root, "sessions", "sessions.index.json"),
    ];
    for (const item of direct) {
      if (fs.existsSync(item)) files.push(item);
    }

    for (const taskDir of [
      path.join(root, "data", "tasks"),
      path.join(root, "tasks"),
    ]) {
      if (!fs.existsSync(taskDir)) continue;
      for (const entry of fs.readdirSync(taskDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const historyItem = path.join(taskDir, entry.name, "history_item.json");
        if (fs.existsSync(historyItem)) files.push(historyItem);
      }
    }
  }

  return [...new Set(files)];
}

function flattenUsageEntries(value, sourcePath) {
  const entries = [];

  function add(item, fallbackId) {
    if (!item || typeof item !== "object") return;
    const id =
      item.id ||
      item.taskId ||
      item.sessionId ||
      item.ulid ||
      fallbackId ||
      null;
    if (!id) return;

    entries.push({
      id: String(id),
      tokensIn: Number(item.tokensIn ?? item.tokens_in ?? 0),
      tokensOut: Number(item.tokensOut ?? item.tokens_out ?? 0),
      cacheWrites: Number(item.cacheWrites ?? item.cache_writes ?? 0),
      cacheReads: Number(item.cacheReads ?? item.cache_reads ?? 0),
      totalCost: Number(item.totalCost ?? item.total_cost ?? item.cost ?? 0),
      modelId: item.modelId ?? item.model_id ?? null,
      ts: Number(item.ts ?? item.updatedAt ?? item.updated_at ?? 0),
      sourcePath,
    });
  }

  if (Array.isArray(value)) {
    for (const item of value) add(item);
    return entries;
  }

  if (Array.isArray(value?.entries)) {
    for (const item of value.entries) add(item);
  }

  if (value?.sessions && typeof value.sessions === "object") {
    for (const [id, item] of Object.entries(value.sessions)) {
      add(item, id);
    }
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.id || value.taskId || value.tokensIn !== undefined)
  ) {
    add(value);
  }

  return entries;
}

function readClineUsage(clineTaskId) {
  const fixture = argValue("--usage-file");
  const files = fixture ? [path.resolve(fixture)] : candidateUsageFiles();
  const entries = [];

  for (const file of files) {
    try {
      const value = readJson(file);
      entries.push(...flattenUsageEntries(value, file));
    } catch {
      // Ignore malformed or stale candidate files and continue.
    }
  }

  const exact = entries
    .filter((entry) => entry.id === String(clineTaskId))
    .sort((a, b) => b.ts - a.ts)[0];

  if (!exact) return null;

  return {
    tokensIn: Math.max(0, exact.tokensIn || 0),
    tokensOut: Math.max(0, exact.tokensOut || 0),
    cacheWrites: Math.max(0, exact.cacheWrites || 0),
    cacheReads: Math.max(0, exact.cacheReads || 0),
    totalCostUsd: Math.max(0, exact.totalCost || 0),
    modelId: exact.modelId,
    telemetrySource: exact.sourcePath,
  };
}

function readRunState(clineTaskId) {
  const file = statePath(clineTaskId);
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

function writeRunState(clineTaskId, state) {
  ensureStateDir();
  writeJson(statePath(clineTaskId), state);
}

function budgetState(run, usage) {
  const total = Number(usage?.tokensIn || 0) + Number(usage?.tokensOut || 0);
  const estimate = run?.estimate || {};

  if (estimate.escalationTokens && total >= estimate.escalationTokens) {
    return "ESCALATION";
  }
  if (estimate.softBudgetTokens && total >= estimate.softBudgetTokens) {
    return "SOFT_BUDGET";
  }
  if (estimate.warningTokens && total >= estimate.warningTokens) {
    return "WARNING";
  }
  return "NORMAL";
}

function startCommand() {
  let issueNumber = parseIssueNumber(argValue("--issue"));
  let taskId = argValue("--task-id")?.trim() || "";
  const clineTaskId = argValue("--cline-task-id")?.trim();
  if (!clineTaskId) fail("--cline-task-id is required for start.");

  if (!issueNumber && taskId) {
    issueNumber = resolveIssueByTaskId(taskId);
  }
  if (!issueNumber) {
    fail("Provide --issue <number> or a resolvable --task-id <Task ID>.");
  }

  const fixture = argValue("--issue-file");
  const issue = fixture ? loadIssueFixture(fixture) : fetchIssue(issueNumber);
  if (!taskId) taskId = inferTaskId(issue);
  if (!taskId) fail("Could not determine Task ID from issue metadata.");

  const existingState = readRunState(clineTaskId);
  if (
    existingState?.state === "ACTIVE" &&
    existingState?.issue === issueNumber &&
    existingState?.taskId === taskId
  ) {
    console.log(
      JSON.stringify(
        {
          status: "ALREADY_ACTIVE",
          runId: existingState.runId,
          issue: issueNumber,
          taskId,
          clineTaskId,
        },
        null,
        2,
      ),
    );
    return;
  }

  const estimate = estimateForIssue(issue);
  const usageData = loadIssueUsage(issueNumber, taskId);
  const runId = makeRunId(taskId);
  const run = {
    runId,
    clineTaskId,
    state: "ACTIVE",
    startedAt: nowIso(),
    completedAt: null,
    outcome: null,
    estimate,
    models: {
      plan: process.env.CLINE_PLAN_MODEL?.trim() || "unknown",
      act: process.env.CLINE_ACT_MODEL?.trim() || "unknown",
    },
    operations: {
      toolCalls: 0,
      failedToolCalls: 0,
      toolExecutionMs: 0,
    },
    actual: null,
  };

  usageData.issue = issueNumber;
  usageData.taskId = taskId;
  usageData.repository = REPOSITORY;
  usageData.runs = Array.isArray(usageData.runs) ? usageData.runs : [];
  usageData.runs.push(run);

  const sync = syncIssueComment(issueNumber, usageData);
  const state = {
    schemaVersion: 1,
    state: "ACTIVE",
    issue: issueNumber,
    taskId,
    clineTaskId,
    runId,
    startedAt: run.startedAt,
    estimate,
    operations: run.operations,
    issueTitle: issue?.title || null,
    sync,
  };
  writeRunState(clineTaskId, state);

  console.log(
    "TXKPRO_USAGE_RUN_STARTED issue=" +
      issueNumber +
      " taskId=" +
      taskId +
      " runId=" +
      runId,
  );
  console.log(
    JSON.stringify(
      {
        status: "ACTIVE",
        issue: issueNumber,
        taskId,
        clineTaskId,
        runId,
        estimate,
        sync,
      },
      null,
      2,
    ),
  );
}

function observeCommand() {
  const clineTaskId = argValue("--cline-task-id")?.trim();
  if (!clineTaskId) fail("--cline-task-id is required for observe.");
  const state = readRunState(clineTaskId);
  if (!state || state.state !== "ACTIVE") {
    console.log(
      JSON.stringify({ status: "NO_ACTIVE_RUN", clineTaskId }, null, 2),
    );
    return;
  }

  const success =
    String(argValue("--success") || "true").toLowerCase() !== "false";
  const executionMs = Number(argValue("--execution-ms") || 0);
  state.operations = state.operations || {
    toolCalls: 0,
    failedToolCalls: 0,
    toolExecutionMs: 0,
  };
  state.operations.toolCalls += 1;
  if (!success) state.operations.failedToolCalls += 1;
  if (Number.isFinite(executionMs) && executionMs > 0) {
    state.operations.toolExecutionMs += executionMs;
  }

  const usage = readClineUsage(clineTaskId);
  const currentBudgetState = usage
    ? budgetState({ estimate: state.estimate }, usage)
    : "UNKNOWN";
  const previousBudgetState = state.budgetState || "NORMAL";
  state.budgetState = currentBudgetState;
  state.lastObservedAt = nowIso();
  writeRunState(clineTaskId, state);

  console.log(
    JSON.stringify(
      {
        status: "OBSERVED",
        clineTaskId,
        runId: state.runId,
        operations: state.operations,
        budgetState: currentBudgetState,
        budgetStateChanged: currentBudgetState !== previousBudgetState,
        currentTokens: usage
          ? Number(usage.tokensIn || 0) + Number(usage.tokensOut || 0)
          : null,
      },
      null,
      2,
    ),
  );
}

function finishCommand() {
  const clineTaskId = argValue("--cline-task-id")?.trim();
  const outcome = argValue("--outcome")?.trim() || "completed";
  if (!clineTaskId) fail("--cline-task-id is required for finish.");

  const state = readRunState(clineTaskId);
  if (!state) {
    fail(
      "No agent-usage run state exists for Cline task " + clineTaskId,
      4,
    );
  }

  if (state.state === "FINISHED") {
    console.log(
      "TXKPRO_USAGE_RUN_FINISHED issue=" +
        state.issue +
        " taskId=" +
        state.taskId +
        " runId=" +
        state.runId,
    );
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  const usage = readClineUsage(clineTaskId);
  if (!usage) {
    fail(
      "Cline token/cost telemetry is not yet available for task " +
        clineTaskId +
        ". Do not claim post-run actuals until telemetry can be read.",
      4,
    );
  }

  const totalTokens = Number(usage.tokensIn || 0) + Number(usage.tokensOut || 0);
  const estimated = Number(state.estimate?.estimatedTokens || 0);
  const variancePercent =
    estimated > 0 ? ((totalTokens - estimated) / estimated) * 100 : null;

  const usageData = loadIssueUsage(state.issue, state.taskId);
  usageData.runs = Array.isArray(usageData.runs) ? usageData.runs : [];
  let run = usageData.runs.find((item) => item.runId === state.runId);
  if (!run) {
    run = {
      runId: state.runId,
      clineTaskId,
      startedAt: state.startedAt,
      estimate: state.estimate,
      models: {
        plan: process.env.CLINE_PLAN_MODEL?.trim() || "unknown",
        act: process.env.CLINE_ACT_MODEL?.trim() || "unknown",
      },
    };
    usageData.runs.push(run);
  }

  run.state = "FINISHED";
  run.completedAt = nowIso();
  run.outcome = outcome;
  run.operations = state.operations || run.operations || {
    toolCalls: 0,
    failedToolCalls: 0,
    toolExecutionMs: 0,
  };
  run.actual = {
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    cacheWrites: usage.cacheWrites,
    cacheReads: usage.cacheReads,
    totalTokens,
    totalCostUsd: usage.totalCostUsd,
    modelId: usage.modelId,
    telemetrySource: usage.telemetrySource,
    variancePercent,
  };

  const sync = syncIssueComment(state.issue, usageData);
  const nextState = {
    ...state,
    state: "FINISHED",
    completedAt: run.completedAt,
    outcome,
    actual: run.actual,
    sync,
  };
  writeRunState(clineTaskId, nextState);

  console.log(
    "TXKPRO_USAGE_RUN_FINISHED issue=" +
      state.issue +
      " taskId=" +
      state.taskId +
      " runId=" +
      state.runId,
  );
  console.log(JSON.stringify(nextState, null, 2));
}

function statusCommand() {
  const clineTaskId = argValue("--cline-task-id")?.trim();
  if (!clineTaskId) fail("--cline-task-id is required for status.");
  const state = readRunState(clineTaskId);
  console.log(
    JSON.stringify(state || { status: "NO_RUN", clineTaskId }, null, 2),
  );
}

function estimateCommand() {
  let issueNumber = parseIssueNumber(argValue("--issue"));
  let taskId = argValue("--task-id")?.trim() || "";
  if (!issueNumber && taskId) issueNumber = resolveIssueByTaskId(taskId);
  if (!issueNumber) fail("Provide --issue or --task-id.");

  const fixture = argValue("--issue-file");
  const issue = fixture ? loadIssueFixture(fixture) : fetchIssue(issueNumber);
  if (!taskId) taskId = inferTaskId(issue);

  console.log(
    JSON.stringify(
      {
        issue: issueNumber,
        taskId,
        title: issue?.title || null,
        estimate: estimateForIssue(issue),
      },
      null,
      2,
    ),
  );
}

if (!COMMAND || ["--help", "-h", "help"].includes(COMMAND)) {
  console.log(
    [
      "Usage:",
      "  node scripts/txkpro-agent-usage.mjs estimate --issue <n> [--task-id <id>]",
      "  node scripts/txkpro-agent-usage.mjs start --issue <n> --task-id <id> --cline-task-id <id>",
      "  node scripts/txkpro-agent-usage.mjs observe --cline-task-id <id> [--success true|false] [--execution-ms <n>]",
      "  node scripts/txkpro-agent-usage.mjs finish --cline-task-id <id> [--outcome <state>]",
      "  node scripts/txkpro-agent-usage.mjs status --cline-task-id <id>",
      "",
      "Test/debug options:",
      "  --issue-file <json>  Use a local issue fixture instead of GitHub.",
      "  --usage-file <json>  Use a local Cline usage fixture.",
      "  --no-sync            Do not create/update the GitHub issue comment.",
      "",
      "The GitHub issue receives one txkpro-agent-usage:v1 summary comment.",
      "Token totals use input + output. Cache counters are reported separately to avoid double-counting provider cache semantics.",
    ].join("\n"),
  );
  process.exit(0);
}

ensureStateDir();

try {
  if (COMMAND === "estimate") estimateCommand();
  else if (COMMAND === "start") startCommand();
  else if (COMMAND === "observe") observeCommand();
  else if (COMMAND === "finish") finishCommand();
  else if (COMMAND === "status") statusCommand();
  else fail("Unknown command: " + COMMAND);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}
