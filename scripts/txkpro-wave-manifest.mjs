#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

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

function projectStatus(item) {
  for (const value of item?.fieldValues?.nodes || []) {
    if (normalize(value?.field?.name) === "status") return value?.name || "";
  }
  return "";
}

function runGraphql(query, variables) {
  const token = process.env.PROJECTS_TOKEN?.trim();
  if (!token) throw new Error("PROJECTS_TOKEN is required for GitHub Project access.");

  const args = ["api", "graphql", "-f", "query=" + query];
  for (const [key, value] of Object.entries(variables || {})) {
    if (value === undefined || value === null || value === "") continue;
    args.push(typeof value === "number" ? "-F" : "-f", key + "=" + value);
  }

  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token }
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "GitHub GraphQL failed").trim());
  }

  return JSON.parse(result.stdout);
}

function dependencyList(body) {
  const raw = metadataValue(body, "Dependencies");
  if (!raw || /^(none|n\/a|na|-|—)$/i.test(raw)) return [];
  return raw.split(/[,;]/).map((value) => value.trim()).filter(Boolean);
}

const waveRaw = argValue("--wave");
if (!waveRaw) {
  console.error("[wave-manifest] Use --wave <W12 or Wave 12>.");
  process.exit(2);
}
const wanted = normalize(waveRaw).replace(/^wave\s*/, "w").replace(/^w\s*/, "w");

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
  let projectTitle = "";

  while (true) {
    const response = runGraphql(query, { login: OWNER, number: PROJECT_NUMBER, cursor });
    const project = response?.data?.user?.projectV2;
    if (!project) throw new Error("Could not resolve canonical GitHub Project.");
    projectTitle = project.title;
    items.push(...(project.items?.nodes || []));
    if (!project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
  }

  const repoItems = items.filter((item) => item?.content?.repository?.nameWithOwner === REPOSITORY);
  const taskMap = new Map();
  for (const item of repoItems) {
    const id = metadataValue(item.content.body, "Task ID");
    if (id) taskMap.set(normalize(id), item);
  }

  const waveItems = repoItems.filter((item) => {
    const raw =
      metadataValue(item.content.body, "Production Wave") ||
      metadataValue(item.content.body, "Wave");
    const normalized = normalize(raw).replace(/^wave\s*/, "w").replace(/^w\s*/, "w");
    return normalized === wanted;
  });

  if (waveItems.length === 0) {
    throw new Error("No roadmap issues found for " + waveRaw + ".");
  }

  const tasks = waveItems.map((item) => {
    const issue = item.content;
    const dependencies = dependencyList(issue.body);
    const dependencyStates = dependencies.map((dep) => {
      const depItem = taskMap.get(normalize(dep));
      return {
        taskId: dep,
        issue: depItem?.content?.number || null,
        projectStatus: depItem ? projectStatus(depItem) : "Missing",
        hardBlocked:
          !depItem ||
          !["done", "verification"].includes(normalize(projectStatus(depItem)))
      };
    });

    return {
      taskId: metadataValue(issue.body, "Task ID"),
      issue: issue.number,
      title: issue.title,
      issueState: issue.state,
      projectStatus: projectStatus(item),
      priority: metadataValue(issue.body, "Priority"),
      criticalPath: metadataValue(issue.body, "Critical Path"),
      workstream: metadataValue(issue.body, "Workstream"),
      release: metadataValue(issue.body, "Release"),
      dependencies,
      dependencyStates,
      url: issue.url,
      projectItemAddedAt: item.createdAt
    };
  });

  tasks.sort((a, b) => {
    const byAdded = String(a.projectItemAddedAt || "").localeCompare(String(b.projectItemAddedAt || ""));
    if (byAdded !== 0) return byAdded;
    return Number(a.issue) - Number(b.issue);
  });

  const firstEligible = tasks.find((task) => {
    if (normalize(task.projectStatus) !== "planned") return false;
    return task.dependencyStates.every((dep) => !dep.hardBlocked);
  });

  const manifest = {
    protocol: "docs/governance/TXKPRO_WAVE_IMPLEMENTATION_PROTOCOL.md",
    project: projectTitle,
    wave: waveRaw,
    repository: REPOSITORY,
    tasks,
    firstPotentiallyEligibleTask: firstEligible
      ? { taskId: firstEligible.taskId, issue: firstEligible.issue, title: firstEligible.title }
      : null,
    requiredManualUat: "Determine per task; browser/signed-in staging UAT is user-owned unless explicitly requested.",
    deploymentOrderRule: "Dependency order, then critical path; do not assume issue-number order.",
    completionRule: "Wave cannot be release-complete while any required item is Blocked or Verification."
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  } else {
    console.log("TXKPRO Wave Manifest — " + waveRaw);
    console.log("Project: " + projectTitle);
    console.log("Tasks: " + tasks.length);
    for (const task of tasks) {
      console.log(
        "- " +
          task.taskId +
          " (#" +
          task.issue +
          ") [" +
          (task.projectStatus || "unset") +
          "] " +
          task.title
      );
      if (task.dependencies.length) {
        console.log(
          "  Dependencies: " +
            task.dependencyStates
              .map((dep) => dep.taskId + "=" + dep.projectStatus)
              .join(", ")
        );
      }
    }
    if (firstEligible) {
      console.log("First potentially eligible: " + firstEligible.taskId + " (#" + firstEligible.issue + ")");
    } else {
      console.log("First potentially eligible: none — inspect blockers/statuses.");
    }
  }
} catch (error) {
  console.error("[wave-manifest] " + error.message);
  process.exit(1);
}
