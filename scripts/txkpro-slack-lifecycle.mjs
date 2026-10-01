#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sanitize(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9._-]+/g, "_");
}

function resolveClineDataDir() {
  const explicit = String(process.env.CLINE_DATA_DIR || "").trim();
  if (explicit) return explicit;
  const clineDir = String(process.env.CLINE_DIR || "").trim();
  if (clineDir) return path.join(clineDir, "data");
  return path.join(os.homedir(), ".cline", "data");
}

function resolveBindingsPath() {
  const override = String(process.env.TXKPRO_SLACK_BINDINGS_PATH || "").trim();
  if (override) return override;
  const botName = String(process.env.SLACK_BOT_USERNAME || "TXKPRO-Cline").trim();
  return path.join(
    resolveClineDataDir(),
    "connectors",
    "slack",
    sanitize(botName) + ".threads.json",
  );
}

function resolveStatePath(taskId) {
  const root =
    String(process.env.TXKPRO_SLACK_LIFECYCLE_STATE_DIR || "").trim() ||
    path.join(os.tmpdir(), "txkpro-slack-lifecycle");
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, sanitize(taskId) + ".json");
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseSerializedThread(value) {
  if (!String(value || "").trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function bindingSessionIds(binding) {
  const serialized = parseSerializedThread(binding?.serializedThread);
  return [
    binding?.sessionId,
    binding?.state?.sessionId,
    serialized?.sessionId,
    serialized?.state?.sessionId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function newestBindingForTask(bindings, taskId) {
  const matches = Object.entries(bindings || {})
    .filter(([, binding]) => bindingSessionIds(binding).includes(taskId))
    .map(([key, binding]) => ({ key, binding }))
    .sort((a, b) => {
      const left = Date.parse(a.binding?.updatedAt || "") || 0;
      const right = Date.parse(b.binding?.updatedAt || "") || 0;
      return right - left;
    });
  return matches[0] || null;
}

function stripSlackPrefix(value) {
  const text = String(value || "").trim();
  return text.startsWith("slack:") ? text.slice("slack:".length) : text;
}

function resolveRoute(match) {
  if (!match?.binding) return null;
  const binding = match.binding;
  const serialized = parseSerializedThread(binding.serializedThread);
  const channelId = String(
    binding.channelId || serialized?.channelId || "",
  ).trim();
  const channel = stripSlackPrefix(channelId).split(":")[0];
  if (!channel) return null;

  const isDM = Boolean(binding.isDM ?? serialized?.isDM);
  let threadTs = "";
  if (!isDM) {
    const threadId = String(serialized?.id || match.key || "").trim();
    const prefix = "slack:" + channel + ":";
    if (threadId.startsWith(prefix)) {
      threadTs = threadId.slice(prefix.length);
    }
  }

  return {
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  };
}

function labelFor(issue, taskId) {
  const task = String(taskId || "").trim() || "TXKPRO task";
  return Number.isInteger(issue) && issue > 0
    ? task + " (#" + issue + ")"
    : task;
}

function messageFor({ lifecycleState, issue, roadmapTaskId, contractId }) {
  const label = labelFor(issue, roadmapTaskId);
  const shortContract = String(contractId || "").trim().slice(0, 12);

  if (lifecycleState === "READY_TO_BEGIN") {
    return [
      "🟡 READY TO BEGIN — " + label,
      shortContract
        ? "ChatGPT contract " + shortContract + " is validated and bound. Cline Act is starting the approved implementation."
        : "A validated ChatGPT implementation contract is bound. Cline Act is starting the approved implementation.",
    ].join("\n");
  }

  if (lifecycleState === "STOPPED_BLOCKED") {
    return [
      "🟠 STOPPED — " + label,
      "Cline stopped with a validated BLOCKED execution result. Awaiting ChatGPT review. Roadmap status is not Done.",
    ].join("\n");
  }

  if (lifecycleState === "STOPPED_CANCELLED") {
    return [
      "⚪ STOPPED — " + label,
      "Cline execution was cancelled. Awaiting reconciliation/ChatGPT review. Roadmap status is not Done.",
    ].join("\n");
  }

  return [
    "🟢 STOPPED — " + label,
    "Cline execution evidence is validated and the execution run has stopped. Awaiting ChatGPT verification. Roadmap status is not Done.",
  ].join("\n");
}

function emit(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

async function main() {
  if (process.argv[2] !== "send") {
    emit({ status: "SKIPPED", reason: "unsupported_command" });
    return;
  }

  const taskId = String(argValue("--task-id") || "").trim();
  const lifecycleState = String(argValue("--state") || "").trim();
  const issue = Number(argValue("--issue"));
  const roadmapTaskId = String(argValue("--roadmap-task-id") || "").trim();
  const contractId = String(argValue("--contract-id") || "").trim();

  const allowedStates = new Set([
    "READY_TO_BEGIN",
    "STOPPED_AWAITING_CHAT_VERIFICATION",
    "STOPPED_BLOCKED",
    "STOPPED_CANCELLED",
  ]);

  if (!taskId || !allowedStates.has(lifecycleState)) {
    emit({ status: "SKIPPED", reason: "invalid_arguments" });
    return;
  }

  const statePath = resolveStatePath(taskId);
  const state = readJson(statePath, { sent: {} }) || { sent: {} };
  if (state.sent?.[lifecycleState]) {
    emit({
      status: "DUPLICATE",
      lifecycleState,
      taskId,
      sentAt: state.sent[lifecycleState],
    });
    return;
  }

  const bindingsPath = resolveBindingsPath();
  const bindings = readJson(bindingsPath, null);
  if (!bindings) {
    emit({
      status: "SKIPPED",
      reason: "slack_binding_store_unavailable",
      lifecycleState,
      taskId,
    });
    return;
  }

  const match = newestBindingForTask(bindings, taskId);
  const route = resolveRoute(match);
  if (!route) {
    emit({
      status: "SKIPPED",
      reason: "slack_thread_binding_not_found",
      lifecycleState,
      taskId,
    });
    return;
  }

  const text = messageFor({
    lifecycleState,
    issue: Number.isInteger(issue) && issue > 0 ? issue : null,
    roadmapTaskId,
    contractId,
  });
  const payload = { ...route, text };

  const testOut = String(
    process.env.TXKPRO_SLACK_LIFECYCLE_TEST_OUT || "",
  ).trim();

  if (testOut) {
    fs.mkdirSync(path.dirname(testOut), { recursive: true });
    fs.appendFileSync(
      testOut,
      JSON.stringify({
        lifecycleState,
        taskId,
        issue: Number.isInteger(issue) && issue > 0 ? issue : null,
        roadmapTaskId,
        contractId: contractId || null,
        payload,
      }) + "\n",
    );
    const sentAt = new Date().toISOString();
    state.sent = { ...(state.sent || {}), [lifecycleState]: sentAt };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    emit({
      status: "CAPTURED",
      lifecycleState,
      taskId,
      channel: route.channel,
      threaded: Boolean(route.thread_ts),
    });
    return;
  }

  const token = String(process.env.SLACK_BOT_TOKEN || "").trim();
  if (!token) {
    emit({
      status: "SKIPPED",
      reason: "SLACK_BOT_TOKEN_missing",
      lifecycleState,
      taskId,
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) {
      emit({
        status: "FAILED",
        reason: String(result?.error || "slack_api_error"),
        lifecycleState,
        taskId,
      });
      return;
    }

    const sentAt = new Date().toISOString();
    state.sent = { ...(state.sent || {}), [lifecycleState]: sentAt };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    emit({
      status: "SENT",
      lifecycleState,
      taskId,
      channel: route.channel,
      threaded: Boolean(route.thread_ts),
    });
  } catch (error) {
    emit({
      status: "FAILED",
      reason:
        error?.name === "AbortError"
          ? "slack_api_timeout"
          : String(error?.message || "slack_api_error"),
      lifecycleState,
      taskId,
    });
  } finally {
    clearTimeout(timer);
  }
}

await main();
