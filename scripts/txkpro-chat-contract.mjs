#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../.cline/hooks/txkpro-orchestration-runtime.cjs");

const REPOSITORY = process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const OWNER = process.env.TXKPRO_ROADMAP_OWNER?.trim() || "QaloriHQ";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runGh(args) {
  const token = process.env.PROJECTS_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  });
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.stdout || result.error?.message || "GitHub CLI failed").trim());
  return JSON.parse(result.stdout || "{}");
}

function metadataValue(body, label) {
  const escaped = String(label).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const match = String(body || "").match(new RegExp("\\*\\*" + escaped + ":\\*\\*\\s*([^\\r\\n]+)", "i"));
  return match ? match[1].trim() : "";
}

function loadIssueFixture(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("issue fixture must be an object");
  return parsed;
}

function resolveIssueNumber(issueRaw, taskId, issueFixture) {
  const issue = Number(issueRaw || issueFixture?.number || 0);
  if (Number.isInteger(issue) && issue > 0) return issue;
  if (!taskId) throw new Error("resolve requires --issue or --task-id");
  const items = runGh(["issue", "list", "--repo", REPOSITORY, "--state", "all", "--search", taskId, "--limit", "100", "--json", "number,title,body"]);
  const matches = (Array.isArray(items) ? items : []).filter((item) => metadataValue(item?.body, "Task ID").toUpperCase() === taskId.toUpperCase() || String(item?.title || "").toUpperCase().includes(taskId.toUpperCase()));
  if (matches.length !== 1) throw new Error("Could not uniquely resolve " + taskId + " to one GitHub issue; matches=" + matches.length);
  return Number(matches[0].number);
}

function loadIssue(issueNumber, issueFixture) {
  if (issueFixture) return issueFixture;
  return runGh(["issue", "view", String(issueNumber), "--repo", REPOSITORY, "--json", "number,title,body,comments"]);
}

function resolveFromIssue(issue, expected) {
  const comments = Array.isArray(issue?.comments) ? [...issue.comments].reverse() : [];
  const failures = [];
  for (const comment of comments) {
    if (String(comment?.author?.login || "") !== OWNER) continue;
    const contract = runtime.parseContractComment(comment?.body);
    if (!contract) continue;
    const errors = runtime.validateContract(contract, expected);
    if (errors.length === 0) {
      return {
        type: "TXKPRO_CHAT_CONTRACT_RESOLUTION",
        schemaVersion: "chat-contract-resolution-v1",
        status: "READY",
        issue: Number(contract.issue),
        taskId: String(contract.taskId),
        contractId: contract.contractId,
        confirmationValidationId: contract.confirmationValidationId,
        evidenceDigest: contract.evidenceDigest,
        commentAuthor: String(comment.author.login),
        commentUrl: String(comment.url || ""),
        commentCreatedAt: String(comment.createdAt || ""),
        contract,
      };
    }
    failures.push(errors.join("; "));
  }
  throw new Error(failures.length > 0 ? "No valid ChatGPT implementation contract found: " + failures.join(" | ") : "No owner-authored ChatGPT implementation contract comment found.");
}

const command = process.argv[2] || "";
try {
  if (command === "validate") {
    const contractPath = argValue("--contract");
    if (!contractPath) throw new Error("validate requires --contract <path>");
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const expected = { issue: argValue("--issue") ? Number(argValue("--issue")) : null, taskId: argValue("--task-id") || "" };
    const errors = runtime.validateContract(contract, expected);
    if (errors.length > 0) throw new Error(errors.join("; "));
    process.stdout.write(JSON.stringify({ type: "TXKPRO_CHAT_CONTRACT_VALIDATION_RESULT", schemaVersion: "chat-contract-validation-v1", status: "READY", issue: Number(contract.issue), taskId: contract.taskId, contractId: contract.contractId, contract }, null, 2) + "\n");
    process.exit(0);
  }

  if (command === "resolve") {
    const taskId = String(argValue("--task-id") || "").trim();
    const issueFile = argValue("--issue-file") || process.env.TXKPRO_CHAT_CONTRACT_ISSUE_FILE || "";
    const fixture = issueFile ? loadIssueFixture(issueFile) : null;
    const issueNumber = resolveIssueNumber(argValue("--issue"), taskId, fixture);
    const issue = loadIssue(issueNumber, fixture);
    const resolution = resolveFromIssue(issue, { issue: issueNumber, taskId });
    process.stdout.write(JSON.stringify(resolution, null, 2) + "\n");
    process.exit(0);
  }

  throw new Error("Use validate --contract <path> [--issue N] [--task-id ID] or resolve --issue N|--task-id ID.");
} catch (error) {
  console.error("[chat-contract] " + error.message);
  process.exit(2);
}
