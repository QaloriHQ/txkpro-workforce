#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  extractEvidenceFromText,
  validateEvidence
} from "./lib/txkpro-evidence.mjs";

const REPOSITORY = process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const OWNER = process.env.TXKPRO_ROADMAP_OWNER?.trim() || "QaloriHQ";
const PROJECT_NUMBER = Number(process.env.TXKPRO_ROADMAP_PROJECT_NUMBER?.trim() || "1");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function metadataValue(body, label) {
  const escaped = String(label).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const regex = new RegExp("\\*\\*" + escaped + ":\\*\\*\\s*([^\\r\\n]+)", "i");
  const match = String(body || "").match(regex);
  return match ? match[1].trim() : "";
}

function taskId(body) {
  return metadataValue(body, "Task ID");
}

function projectStatus(item) {
  for (const value of item?.fieldValues?.nodes || []) {
    if (normalize(value?.field?.name) === "status") return value?.name || "";
  }
  return "";
}

function runGh(args, projectToken) {
  const token = projectToken ? process.env.PROJECTS_TOKEN?.trim() : undefined;
  if (projectToken && !token) throw new Error("PROJECTS_TOKEN is required for GitHub Project access.");

  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, ...(projectToken ? { GH_TOKEN: token } : {}) }
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "gh command failed").trim());
  }
  return result.stdout;
}

function graphql(query, variables) {
  const args = ["api", "graphql", "-f", "query=" + query];
  for (const [key, value] of Object.entries(variables || {})) {
    if (value === undefined || value === null || value === "") continue;
    args.push(typeof value === "number" ? "-F" : "-f", key + "=" + value);
  }
  return JSON.parse(runGh(args, true));
}

function comments(issueNumber) {
  const raw = runGh(["api", "--paginate", "repos/" + REPOSITORY + "/issues/" + issueNumber + "/comments"], false);
  if (!raw.trim()) return [];
  return JSON.parse(raw.trim().replace(/\]\s*\[/g, ","));
}

function latestEvidence(issueNumber) {
  const list = comments(issueNumber);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const body = String(list[i]?.body || "");
    if (!body.includes("<!-- txkpro-protocol-evidence:v1 -->")) continue;
    try {
      const evidence = extractEvidenceFromText(body);
      if (evidence) return { evidence, url: list[i].html_url };
    } catch {
      continue;
    }
  }
  return null;
}

function inferRisk(issue) {
  const text = (String(issue?.title || "") + "\n" + String(issue?.body || "")).toLowerCase();
  const high = ["authorization", "credential", "secret", "privacy", "rls", "cross-tenant", "cross tenant", "identity", "payment", "destructive", "audit", "public exposure"];
  if (high.some((term) => text.includes(term))) return "HIGH";
  const medium = ["schema", "migration", "api", "rpc", "dashboard", "report", "navigation", "workflow", "role view", "ui", "ux"];
  if (medium.some((term) => text.includes(term))) return "MEDIUM";
  return "LOW";
}

const issueNumber = Number(argValue("--issue"));
if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  console.error("[preflight] Use --issue <positive issue number>.");
  process.exit(2);
}

const query = [
  "query($login: String!, $number: Int!, $cursor: String) {",
  "  user(login: $login) {",
  "    projectV2(number: $number) {",
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
  "              number title state body url",
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

try {
  const items = [];
  let cursor;
  while (true) {
    const response = graphql(query, { login: OWNER, number: PROJECT_NUMBER, cursor });
    const project = response?.data?.user?.projectV2;
    if (!project) throw new Error("Could not resolve canonical GitHub Project.");
    items.push(...(project.items?.nodes || []));
    if (!project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
  }

  const repoItems = items.filter((item) => item?.content?.repository?.nameWithOwner === REPOSITORY);
  const item = repoItems.find((candidate) => Number(candidate?.content?.number) === issueNumber);
  if (!item) throw new Error("Issue #" + issueNumber + " is not in the canonical Project.");

  const issue = item.content;
  const rawDependencies = metadataValue(issue.body, "Dependencies");
  const dependencies =
    !rawDependencies || /^(none|n\/a|na|-|—)$/i.test(rawDependencies)
      ? []
      : rawDependencies.split(/[,;]/).map((value) => value.trim()).filter(Boolean);

  const dependencyResults = dependencies.map((dependencyTaskId) => {
    const dependencyItem = repoItems.find((candidate) => normalize(taskId(candidate?.content?.body)) === normalize(dependencyTaskId));
    if (!dependencyItem) {
      return { taskId: dependencyTaskId, classification: "BLOCK", reason: "Dependency not found in Project." };
    }

    const status = projectStatus(dependencyItem);
    if (normalize(status) === "done") {
      return {
        taskId: dependencyTaskId,
        issue: dependencyItem.content.number,
        projectStatus: status,
        classification: "PROCEED",
        reason: "Dependency is Done."
      };
    }

    if (normalize(status) === "verification") {
      const latest = latestEvidence(dependencyItem.content.number);
      const validation = latest
        ? validateEvidence(latest.evidence, {
            expectedIssue: dependencyItem.content.number,
            expectedTaskId: taskId(dependencyItem.content.body)
          })
        : { valid: false };

      if (
        validation.valid &&
        latest.evidence.target_status === "Verification" &&
        ["remaining", "observation_required"].includes(latest.evidence.verification?.manual_uat)
      ) {
        return {
          taskId: dependencyTaskId,
          issue: dependencyItem.content.number,
          projectStatus: status,
          classification: "PROCEED_WITH_EXPLICIT_EXCEPTION",
          reason: "Valid Verification evidence leaves only user-owned UAT/observation.",
          evidenceUrl: latest.url
        };
      }
    }

    return {
      taskId: dependencyTaskId,
      issue: dependencyItem.content.number,
      projectStatus: status,
      classification: "BLOCK",
      reason: "Dependency Project Status is " + (status || "(unset)") + "."
    };
  });

  const body = String(issue.body || "");
  const hardBlocks = [];
  if (!taskId(body)) hardBlocks.push("Missing **Task ID:** metadata.");
  if (!/acceptance criteria/i.test(body) && !/- \[[ xX]\]/.test(body)) {
    hardBlocks.push("Acceptance criteria are not explicit/testable in the issue body.");
  }
  if (dependencyResults.some((dep) => dep.classification === "BLOCK")) {
    hardBlocks.push("One or more declared dependencies are blocked.");
  }
  if (/credential exposure|secret exposure|security incident/i.test(body)) {
    hardBlocks.push("Issue text indicates a possible security/credential incident requiring explicit resolution.");
  }

  const confirmations = [
    "Confirm affected roles and scopes.",
    "Confirm canonical data ownership and permitted fields.",
    "Confirm canonical statuses/events and allowed transitions.",
    "Confirm required IA/design sources for user-facing work.",
    "Confirm target branch, staging Supabase project, and staging Vercel environment.",
    "Confirm required credentials exist without printing secret values.",
    "Confirm manual verification owner and UAT requirements.",
    "Confirm no unresolved product/privacy/policy/legal decision blocks the task."
  ];

  const result = {
    issue: issue.number,
    taskId: taskId(body),
    title: issue.title,
    issueState: issue.state,
    projectStatus: projectStatus(item),
    risk: inferRisk(issue),
    dependencies: dependencyResults,
    automatedDefinitionOfReady: hardBlocks.length === 0 ? "PASS" : "BLOCKED",
    hardBlocks,
    agentConfirmationsRequired: confirmations,
    mutationAllowedByAutomatedGate: hardBlocks.length === 0,
    protocol: "docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md"
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log("TXKPRO protocol preflight — #" + result.issue + " " + result.taskId);
    console.log("Automated Definition of Ready: " + result.automatedDefinitionOfReady);
    console.log("Risk: " + result.risk);
    if (result.dependencies.length === 0) {
      console.log("Dependencies: None");
    } else {
      for (const dep of result.dependencies) {
        console.log("Dependency " + dep.taskId + ": " + dep.classification + " — " + dep.reason);
      }
    }
    if (result.hardBlocks.length) {
      console.log("Hard blockers:");
      for (const block of result.hardBlocks) console.log("- " + block);
    }
    console.log("Agent confirmations still required before mutation:");
    for (const confirmation of confirmations) console.log("- " + confirmation);
  }

  if (hardBlocks.length > 0) process.exit(3);
} catch (error) {
  console.error("[preflight] " + error.message);
  process.exit(1);
}
