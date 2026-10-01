#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const OWNER = process.env.TXKPRO_ROADMAP_OWNER?.trim() || "QaloriHQ";
const REPOSITORY = process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const PROJECT_NUMBER = Number(process.env.TXKPRO_ROADMAP_PROJECT_NUMBER?.trim() || "1");
const TOKEN = process.env.PROJECTS_TOKEN?.trim();

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/roadmap-next-eligible.mjs [--json]");
  console.log("");
  console.log("Evaluates open Planned roadmap items in canonical Project order.");
  console.log("For each candidate it automatically runs task context + protocol preflight.");
  console.log("Returns the first candidate whose automated Definition of Ready/dependency gate passes.");
  console.log("Final agent confirmations from the protocol are still required before mutation.");
  process.exit(0);
}

if (!TOKEN) {
  console.error("[roadmap-eligible] missing PROJECTS_TOKEN. Add it as a GitHub Codespaces secret with read:project access.");
  process.exit(2);
}

if (!Number.isInteger(PROJECT_NUMBER) || PROJECT_NUMBER <= 0) {
  console.error("[roadmap-eligible] TXKPRO_ROADMAP_PROJECT_NUMBER must be a positive integer.");
  process.exit(2);
}

const query = [
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
  "}"
].join("\n");

function projectStatus(item) {
  for (const value of item?.fieldValues?.nodes || []) {
    if (String(value?.field?.name || "").trim().toLowerCase() === "status") {
      return value?.name || "";
    }
  }
  return "";
}

function runProjectQuery(cursor) {
  const commandArgs = [
    "api", "graphql",
    "-f", "query=" + query,
    "-f", "login=" + OWNER,
    "-F", "number=" + PROJECT_NUMBER
  ];
  if (cursor) commandArgs.push("-f", "cursor=" + cursor);

  const result = spawnSync("gh", commandArgs, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: TOKEN }
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "GitHub Project query failed").trim());
  }
  return JSON.parse(result.stdout);
}

function runNodeScript(script, scriptArgs) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    encoding: "utf8",
    env: process.env
  });

  let parsed = null;
  if (String(result.stdout || "").trim()) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = null;
    }
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    parsed
  };
}

try {
  const items = [];
  let cursor;
  let projectTitle = "";

  while (true) {
    const response = runProjectQuery(cursor);
    const project = response?.data?.user?.projectV2;
    if (!project) throw new Error("Could not resolve canonical GitHub Project.");
    projectTitle = project.title;
    items.push(...(project.items?.nodes || []));
    if (!project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
    if (!cursor) throw new Error("Project pagination reported another page without a cursor.");
  }

  const candidates = items
    .map((item) => ({ item, issue: item?.content, status: projectStatus(item) }))
    .filter(({ issue, status }) =>
      issue?.repository?.nameWithOwner === REPOSITORY &&
      issue?.state === "OPEN" &&
      status === "Planned"
    )
    .sort((a, b) => {
      const byProject = String(a.item.createdAt || "").localeCompare(String(b.item.createdAt || ""));
      if (byProject !== 0) return byProject;
      const byIssue = String(a.issue.createdAt || "").localeCompare(String(b.issue.createdAt || ""));
      if (byIssue !== 0) return byIssue;
      return Number(a.issue.number || 0) - Number(b.issue.number || 0);
    });

  if (candidates.length === 0) {
    console.error("[roadmap-eligible] No open issues in " + REPOSITORY + " have authoritative Project Status = Planned.");
    process.exit(3);
  }

  const evaluated = [];
  let selected = null;

  for (const candidate of candidates) {
    const issueNumber = candidate.issue.number;
    const contextResult = runNodeScript("scripts/txkpro-task-context.mjs", ["--issue", String(issueNumber), "--json"]);
    const preflightResult = runNodeScript("scripts/txkpro-preflight.mjs", ["--issue", String(issueNumber), "--json"]);

    const evaluation = {
      issue: issueNumber,
      title: candidate.issue.title,
      projectStatus: candidate.status,
      projectItemAddedAt: candidate.item.createdAt,
      issueCreatedAt: candidate.issue.createdAt,
      url: candidate.issue.url,
      context: contextResult.parsed,
      preflight: preflightResult.parsed,
      contextExitCode: contextResult.status,
      preflightExitCode: preflightResult.status,
      eligibleByAutomatedGate:
        contextResult.status === 0 &&
        preflightResult.status === 0 &&
        preflightResult.parsed?.automatedDefinitionOfReady === "PASS" &&
        preflightResult.parsed?.mutationAllowedByAutomatedGate === true
    };

    if (!evaluation.context && contextResult.stderr.trim()) {
      evaluation.contextError = contextResult.stderr.trim();
    }
    if (!evaluation.preflight && preflightResult.stderr.trim()) {
      evaluation.preflightError = preflightResult.stderr.trim();
    }

    evaluated.push(evaluation);

    if (!selected && evaluation.eligibleByAutomatedGate) {
      selected = evaluation;
      break;
    }
  }

  if (!selected) {
    const result = {
      selected: null,
      project: projectTitle,
      projectOwner: OWNER,
      projectNumber: PROJECT_NUMBER,
      repository: REPOSITORY,
      evaluatedCandidates: evaluated,
      finalAgentConfirmationRequired: true,
      message: "No Planned candidate passed the automated Definition of Ready/dependency gate."
    };
    if (args.has("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.message);
      for (const item of evaluated) {
        console.log("#" + item.issue + " " + item.title + " — automated gate: BLOCKED");
      }
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
      taskContext: selected.context,
      preflight: selected.preflight
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
        contextError: item.contextError || null,
        preflightError: item.preflightError || null
      })),
    finalAgentConfirmationRequired: true,
    selectionMeaning:
      "First open Planned Project item in canonical order whose task context resolves and automated protocol preflight passes. The agent must still complete the read-only confirmations listed by preflight before calling the task fully eligible for mutation.",
    approvalBoundary:
      "Read-only discovery, task context, dependency checks, source review, and preflight require no user approval. Explicit approval is required only before mutation."
  };

  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("#" + result.selected.issue + " " + result.selected.title);
    console.log("Project Status: " + result.selected.projectStatus);
    console.log("Automated Definition of Ready: " + result.selected.preflight.automatedDefinitionOfReady);
    console.log("Risk: " + result.selected.preflight.risk);
    console.log("Final agent confirmation required: yes");
    console.log("URL: " + result.selected.url);
  }
} catch (error) {
  console.error("[roadmap-eligible] " + error.message);
  process.exit(1);
}
