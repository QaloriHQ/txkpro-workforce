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

function metadataValue(body, label) {
  const escaped = String(label).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const regex = new RegExp("\\*\\*" + escaped + ":\\*\\*\\s*([^\\r\\n]+)", "i");
  const match = String(body || "").match(regex);
  return match ? match[1].trim() : "";
}

function fieldValue(item, fieldName) {
  const wanted = String(fieldName).trim().toLowerCase();
  for (const value of item?.fieldValues?.nodes || []) {
    if (String(value?.field?.name || "").trim().toLowerCase() !== wanted) continue;
    return value?.name || value?.text || value?.date || "";
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

const issueRaw = argValue("--issue");
const issueNumber = Number(issueRaw);
if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  console.error("[task-context] Use --issue <positive issue number>.");
  process.exit(2);
}

const query = [
  "query($login: String!, $number: Int!, $cursor: String) {",
  "  user(login: $login) {",
  "    projectV2(number: $number) {",
  "      title",
  "      items(first: 100, after: $cursor) {",
  "        nodes {",
  "          id",
  "          createdAt",
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
  "              number title state body url createdAt closedAt",
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
  let cursor;
  let found = null;
  let projectTitle = "";

  while (true) {
    const response = runGraphql(query, {
      login: OWNER,
      number: PROJECT_NUMBER,
      cursor
    });
    const project = response?.data?.user?.projectV2;
    if (!project) throw new Error("Could not resolve canonical GitHub Project.");

    projectTitle = project.title;
    for (const item of project.items?.nodes || []) {
      if (
        item?.content?.repository?.nameWithOwner === REPOSITORY &&
        Number(item?.content?.number) === issueNumber
      ) {
        found = item;
        break;
      }
    }

    if (found || !project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
  }

  if (!found) {
    throw new Error("Issue #" + issueNumber + " was not found in canonical Project #" + PROJECT_NUMBER + ".");
  }

  const issue = found.content;
  const dependenciesRaw = metadataValue(issue.body, "Dependencies");
  const dependencies =
    !dependenciesRaw || /^(none|n\/a|na|-|—)$/i.test(dependenciesRaw)
      ? []
      : dependenciesRaw.split(/[,;]/).map((value) => value.trim()).filter(Boolean);

  const context = {
    project: projectTitle,
    projectOwner: OWNER,
    projectNumber: PROJECT_NUMBER,
    repository: REPOSITORY,
    issue: issue.number,
    title: issue.title,
    issueState: issue.state,
    url: issue.url,
    createdAt: issue.createdAt,
    projectStatus: fieldValue(found, "Status"),
    projectItemAddedAt: found.createdAt,
    taskId: metadataValue(issue.body, "Task ID"),
    productionWave: metadataValue(issue.body, "Production Wave"),
    release: metadataValue(issue.body, "Release"),
    workstream: metadataValue(issue.body, "Workstream"),
    priority: metadataValue(issue.body, "Priority"),
    criticalPath: metadataValue(issue.body, "Critical Path"),
    dependencies,
    sourceDocument: metadataValue(issue.body, "Source Document"),
    sourceSection: metadataValue(issue.body, "Source Section")
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(context, null, 2) + "\n");
  } else {
    console.log("#" + context.issue + " " + context.title);
    console.log("Task ID: " + (context.taskId || "(missing)"));
    console.log("Project Status: " + (context.projectStatus || "(unset)"));
    console.log("Wave: " + (context.productionWave || "(missing)"));
    console.log("Priority: " + (context.priority || "(missing)"));
    console.log("Critical Path: " + (context.criticalPath || "(missing)"));
    console.log("Dependencies: " + (context.dependencies.join(", ") || "None"));
    console.log("Source: " + ([context.sourceDocument, context.sourceSection].filter(Boolean).join(" / ") || "(not listed)"));
    console.log("URL: " + context.url);
  }
} catch (error) {
  console.error("[task-context] " + error.message);
  process.exit(1);
}
