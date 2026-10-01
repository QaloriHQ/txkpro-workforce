#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  extractEvidenceFromText,
  validateEvidence,
} from "./lib/txkpro-evidence.mjs";

const OWNER = process.env.TXKPRO_ROADMAP_OWNER?.trim() || "QaloriHQ";
const REPOSITORY =
  process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const PROJECT_NUMBER = Number(
  process.env.TXKPRO_ROADMAP_PROJECT_NUMBER?.trim() || "1",
);
const TOKEN = process.env.PROJECTS_TOKEN?.trim();
const startedAt = Date.now();

const cliArgs = new Set(process.argv.slice(2));
if (cliArgs.has("--help") || cliArgs.has("-h")) {
  console.log("Usage: node scripts/roadmap-next-eligible.mjs [--json]");
  console.log("");
  console.log(
    "Loads the canonical GitHub Project snapshot once, evaluates Planned candidates",
  );
  console.log(
    "in Project order, classifies declared dependencies, and returns the first",
  );
  console.log(
    "candidate whose automated Definition-of-Ready gate passes. Final read-only",
  );
  console.log(
    "agent confirmations from authoritative sources are still required before mutation.",
  );
  process.exit(0);
}

if (!TOKEN) {
  console.error(
    "[roadmap-eligible] missing PROJECTS_TOKEN. Add it as a GitHub Codespaces secret with read:project access.",
  );
  process.exit(2);
}

if (!Number.isInteger(PROJECT_NUMBER) || PROJECT_NUMBER <= 0) {
  console.error(
    "[roadmap-eligible] TXKPRO_ROADMAP_PROJECT_NUMBER must be a positive integer.",
  );
  process.exit(2);
}

let projectGraphqlCalls = 0;
let evidenceCommentCalls = 0;

const projectQuery = [
  "query($login: String!, $number: Int!, $cursor: String) {",
  "  user(login: $login) {",
  "    projectV2(number: $number) {",
  "      title",
  "      items(first: 100, after: $cursor) {",
  "        nodes {",
  "          id createdAt",
  "          fieldValues(first: 50) {",
  "            nodes {",
  "              ... on ProjectV2ItemFieldSingleSelectValue {",
  "                name",
  "                field { ... on ProjectV2SingleSelectField { name } }",
  "              }",
  "            }",
  "          }",
  "          content {",
  "            ... on Issue {",
  "              number title state createdAt body url",
  "              repository { nameWithOwner }",
  "            }",
  "          }",
  "        }",
  "        pageInfo { hasNextPage endCursor }",
  "      }",
  "    }",
  "  }",
  "}",
].join("\n");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function metadataValue(body, label) {
  const escaped = String(label).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const regex = new RegExp(
    "\\*\\*" + escaped + ":\\*\\*\\s*([^\\r\\n]+)",
    "i",
  );
  const match = String(body || "").match(regex);
  return match ? match[1].trim() : "";
}

function taskId(body) {
  return metadataValue(body, "Task ID");
}

function dependencyList(body) {
  const raw = metadataValue(body, "Dependencies");
  if (!raw || /^(none|n\/a|na|-|—)$/i.test(raw)) return [];
  return raw
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function projectStatus(item) {
  for (const value of item?.fieldValues?.nodes || []) {
    if (normalize(value?.field?.name) === "status") {
      return value?.name || "";
    }
  }
  return "";
}

function runGh(args, { projectToken = false } = {}) {
  const env = {
    ...process.env,
    GH_PAGER: "cat",
    GH_PROMPT_DISABLED: "1",
    ...(projectToken ? { GH_TOKEN: TOKEN } : {}),
  };

  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "GitHub command failed").trim(),
    );
  }
  return result.stdout || "";
}

function runProjectQuery(cursor) {
  projectGraphqlCalls += 1;
  const commandArgs = [
    "api",
    "graphql",
    "-f",
    "query=" + projectQuery,
    "-f",
    "login=" + OWNER,
    "-F",
    "number=" + PROJECT_NUMBER,
  ];
  if (cursor) commandArgs.push("-f", "cursor=" + cursor);

  return JSON.parse(runGh(commandArgs, { projectToken: true }));
}

function fetchIssueComments(issueNumber) {
  evidenceCommentCalls += 1;
  const raw = runGh([
    "api",
    "--paginate",
    "repos/" + REPOSITORY + "/issues/" + issueNumber + "/comments",
  ]);

  if (!raw.trim()) return [];
  return JSON.parse(raw.trim().replace(/\]\s*\[/g, ","));
}

function latestProtocolEvidence(issueNumber) {
  const comments = fetchIssueComments(issueNumber);
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const body = String(comments[index]?.body || "");
    if (!body.includes("<!-- txkpro-protocol-evidence:v1 -->")) continue;

    try {
      const evidence = extractEvidenceFromText(body);
      if (!evidence) continue;
      return {
        evidence,
        url: comments[index]?.html_url || null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function inferRisk(issue) {
  const text = (
    String(issue?.title || "") +
    "\n" +
    String(issue?.body || "")
  ).toLowerCase();

  const high = [
    "authorization",
    "credential",
    "secret",
    "privacy",
    "rls",
    "cross-tenant",
    "cross tenant",
    "identity",
    "payment",
    "destructive",
    "audit",
    "public exposure",
  ];
  if (high.some((term) => text.includes(term))) return "HIGH";

  const medium = [
    "schema",
    "migration",
    "api",
    "rpc",
    "dashboard",
    "report",
    "navigation",
    "workflow",
    "role view",
    "ui",
    "ux",
  ];
  if (medium.some((term) => text.includes(term))) return "MEDIUM";

  return "LOW";
}

function buildTaskContext(item) {
  const issue = item.content;
  const body = String(issue?.body || "");

  return {
    projectOwner: OWNER,
    projectNumber: PROJECT_NUMBER,
    repository: REPOSITORY,
    issue: issue.number,
    title: issue.title,
    issueState: issue.state,
    url: issue.url,
    createdAt: issue.createdAt,
    projectStatus: projectStatus(item),
    projectItemAddedAt: item.createdAt,
    taskId: taskId(body),
    productionWave:
      metadataValue(body, "Production Wave") || metadataValue(body, "Wave"),
    release: metadataValue(body, "Release"),
    workstream: metadataValue(body, "Workstream"),
    priority: metadataValue(body, "Priority"),
    criticalPath: metadataValue(body, "Critical Path"),
    dependencies: dependencyList(body),
    sourceDocument: metadataValue(body, "Source Document"),
    sourceSection: metadataValue(body, "Source Section"),
  };
}

function classifyDependency(taskMap, dependencyTaskId) {
  const dependencyItem = taskMap.get(normalize(dependencyTaskId));

  if (!dependencyItem) {
    return {
      taskId: dependencyTaskId,
      classification: "BLOCK",
      reason: "Dependency task was not found in the canonical GitHub Project.",
    };
  }

  const status = projectStatus(dependencyItem);
  if (normalize(status) === "done") {
    return {
      taskId: dependencyTaskId,
      issue: dependencyItem.content.number,
      projectStatus: status,
      classification: "PROCEED",
      reason: "Dependency is Done in the canonical Project.",
    };
  }

  if (normalize(status) === "verification") {
    const latest = latestProtocolEvidence(dependencyItem.content.number);
    const validation = latest
      ? validateEvidence(latest.evidence, {
          expectedIssue: dependencyItem.content.number,
          expectedTaskId: taskId(dependencyItem.content.body),
        })
      : { valid: false };

    if (
      validation.valid &&
      latest.evidence.target_status === "Verification" &&
      ["remaining", "observation_required"].includes(
        latest.evidence.verification?.manual_uat,
      )
    ) {
      return {
        taskId: dependencyTaskId,
        issue: dependencyItem.content.number,
        projectStatus: status,
        classification: "PROCEED_WITH_EXPLICIT_EXCEPTION",
        reason:
          "Dependency is in Verification with valid protocol evidence; remaining work is user-owned UAT/observation.",
        evidenceUrl: latest.url,
      };
    }
  }

  return {
    taskId: dependencyTaskId,
    issue: dependencyItem.content.number,
    projectStatus: status,
    classification: "BLOCK",
    reason: "Dependency Project Status is " + (status || "(unset)") + ".",
  };
}

function buildPreflight(item, taskMap) {
  const issue = item.content;
  const body = String(issue?.body || "");
  const dependencies = dependencyList(body).map((dependencyTaskId) =>
    classifyDependency(taskMap, dependencyTaskId),
  );

  const hardBlocks = [];
  if (!taskId(body)) {
    hardBlocks.push("Missing **Task ID:** metadata.");
  }

  if (!/acceptance criteria/i.test(body) && !/- \[[ xX]\]/.test(body)) {
    hardBlocks.push(
      "Acceptance criteria are not explicit/testable in the issue body.",
    );
  }

  if (dependencies.some((dependency) => dependency.classification === "BLOCK")) {
    hardBlocks.push("One or more declared dependencies are blocked.");
  }

  if (/credential exposure|secret exposure|security incident/i.test(body)) {
    hardBlocks.push(
      "Issue text indicates a possible security/credential incident requiring explicit resolution.",
    );
  }

  const confirmations = [
    "Confirm affected roles and scopes.",
    "Confirm canonical data ownership and permitted fields.",
    "Confirm canonical statuses/events and allowed transitions.",
    "Confirm required IA/design sources for user-facing work.",
    "Confirm target branch, staging Supabase project, and staging Vercel environment.",
    "Confirm required credentials exist without printing secret values.",
    "Confirm manual verification owner and UAT requirements.",
    "Confirm no unresolved product/privacy/policy/legal decision blocks the task.",
  ];

  return {
    issue: issue.number,
    taskId: taskId(body),
    title: issue.title,
    issueState: issue.state,
    projectStatus: projectStatus(item),
    risk: inferRisk(issue),
    dependencies,
    automatedDefinitionOfReady:
      hardBlocks.length === 0 ? "PASS" : "BLOCKED",
    hardBlocks,
    agentConfirmationsRequired: confirmations,
    mutationAllowedByAutomatedGate: hardBlocks.length === 0,
    protocol: "docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md",
  };
}

try {
  const items = [];
  let cursor;
  let projectTitle = "";

  while (true) {
    const response = runProjectQuery(cursor);
    const project = response?.data?.user?.projectV2;
    if (!project) {
      throw new Error("Could not resolve canonical GitHub Project.");
    }

    projectTitle = project.title;
    items.push(...(project.items?.nodes || []));

    if (!project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
    if (!cursor) {
      throw new Error(
        "Project pagination reported another page without a cursor.",
      );
    }
  }

  const repositoryItems = items.filter(
    (item) => item?.content?.repository?.nameWithOwner === REPOSITORY,
  );

  const taskMap = new Map();
  for (const item of repositoryItems) {
    const id = taskId(item?.content?.body);
    if (id) taskMap.set(normalize(id), item);
  }

  const candidates = repositoryItems
    .map((item) => ({
      item,
      issue: item.content,
      status: projectStatus(item),
    }))
    .filter(
      ({ issue, status }) =>
        issue?.state === "OPEN" && normalize(status) === "planned",
    )
    .sort((a, b) => {
      const byProject = String(a.item.createdAt || "").localeCompare(
        String(b.item.createdAt || ""),
      );
      if (byProject !== 0) return byProject;

      const byIssue = String(a.issue.createdAt || "").localeCompare(
        String(b.issue.createdAt || ""),
      );
      if (byIssue !== 0) return byIssue;

      return Number(a.issue.number || 0) - Number(b.issue.number || 0);
    });

  if (candidates.length === 0) {
    console.error(
      "[roadmap-eligible] No open issues in " +
        REPOSITORY +
        " have authoritative Project Status = Planned.",
    );
    process.exit(3);
  }

  const evaluated = [];
  let selected = null;

  for (const candidate of candidates) {
    const taskContext = buildTaskContext(candidate.item);
    const preflight = buildPreflight(candidate.item, taskMap);

    const evaluation = {
      issue: candidate.issue.number,
      title: candidate.issue.title,
      projectStatus: candidate.status,
      projectItemAddedAt: candidate.item.createdAt,
      issueCreatedAt: candidate.issue.createdAt,
      url: candidate.issue.url,
      taskContext,
      preflight,
      eligibleByAutomatedGate:
        preflight.automatedDefinitionOfReady === "PASS" &&
        preflight.mutationAllowedByAutomatedGate === true,
    };

    evaluated.push(evaluation);

    if (evaluation.eligibleByAutomatedGate) {
      selected = evaluation;
      break;
    }
  }

  const diagnostics = {
    projectGraphqlCalls,
    evidenceCommentCalls,
    evaluatedCandidates: evaluated.length,
    totalPlannedCandidates: candidates.length,
    elapsedMs: Date.now() - startedAt,
    executionModel:
      "single Project snapshot; no per-candidate task-context/preflight subprocesses",
  };

  if (!selected) {
    const result = {
      selected: null,
      project: projectTitle,
      projectOwner: OWNER,
      projectNumber: PROJECT_NUMBER,
      repository: REPOSITORY,
      evaluatedCandidates: evaluated,
      finalAgentConfirmationRequired: true,
      message:
        "No Planned candidate passed the automated Definition of Ready/dependency gate.",
      diagnostics,
    };

    if (cliArgs.has("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.message);
      for (const item of evaluated) {
        console.log(
          "#" +
            item.issue +
            " " +
            item.title +
            " — automated gate: " +
            item.preflight.automatedDefinitionOfReady,
        );
      }
      console.log(
        "Project queries: " +
          diagnostics.projectGraphqlCalls +
          " | evidence comment reads: " +
          diagnostics.evidenceCommentCalls +
          " | elapsed: " +
          diagnostics.elapsedMs +
          "ms",
      );
    }
    process.exit(4);
  }

  const result = {
    selected: {
      issue: selected.issue,
      title: selected.title,
      projectStatus: selected.projectStatus,
      projectItemAddedAt: selected.projectItemAddedAt,
      issueCreatedAt: selected.issueCreatedAt,
      url: selected.url,
      taskContext: selected.taskContext,
      preflight: selected.preflight,
    },
    project: projectTitle,
    projectOwner: OWNER,
    projectNumber: PROJECT_NUMBER,
    repository: REPOSITORY,
    skippedCandidates: evaluated
      .filter((item) => item.issue !== selected.issue)
      .map((item) => ({
        issue: item.issue,
        title: item.title,
        preflight: item.preflight,
      })),
    finalAgentConfirmationRequired: true,
    selectionMeaning:
      "First open Planned Project item in canonical order whose automated dependency/Definition-of-Ready gate passes. The agent must still complete the read-only confirmations listed by preflight before calling the task fully eligible for mutation.",
    approvalBoundary:
      "Read-only discovery, task context, dependency checks, source review, and preflight require no user approval. Explicit approval is required only before mutation.",
    diagnostics,
  };

  if (cliArgs.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("#" + result.selected.issue + " " + result.selected.title);
    console.log("Project Status: " + result.selected.projectStatus);
    console.log(
      "Automated Definition of Ready: " +
        result.selected.preflight.automatedDefinitionOfReady,
    );
    console.log("Risk: " + result.selected.preflight.risk);
    console.log("Final agent confirmation required: yes");
    console.log(
      "Project queries: " +
        diagnostics.projectGraphqlCalls +
        " | evidence comment reads: " +
        diagnostics.evidenceCommentCalls +
        " | elapsed: " +
        diagnostics.elapsedMs +
        "ms",
    );
    console.log("URL: " + result.selected.url);
  }
} catch (error) {
  console.error("[roadmap-eligible] " + error.message);
  process.exit(1);
}
