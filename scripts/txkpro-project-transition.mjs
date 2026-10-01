#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { validateEvidence } from "./lib/txkpro-evidence.mjs";

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

function runGh(args, options = {}) {
  const env = { ...process.env };
  if (options.projectToken) {
    const token = process.env.PROJECTS_TOKEN?.trim();
    if (!token) throw new Error("PROJECTS_TOKEN is required for Project transition.");
    env.GH_TOKEN = token;
  }

  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env
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
  return JSON.parse(runGh(args, { projectToken: true }));
}

const evidencePath = argValue("--evidence");
if (!evidencePath) {
  console.error("[project-transition] Use --evidence <file>.");
  process.exit(2);
}

try {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

  const issueRaw = runGh([
    "issue",
    "view",
    String(evidence.issue),
    "--repo",
    REPOSITORY,
    "--json",
    "number,title,body,state,url"
  ]);
  const issue = JSON.parse(issueRaw);
  const issueTaskId = metadataValue(issue.body, "Task ID");

  const validation = validateEvidence(evidence, {
    expectedIssue: issue.number,
    expectedTaskId: issueTaskId
  });

  if (!validation.valid) {
    throw new Error("Evidence validation failed: " + validation.errors.join(" | "));
  }

  const query = [
    "query($login: String!, $number: Int!, $cursor: String) {",
    "  user(login: $login) {",
    "    projectV2(number: $number) {",
    "      id",
    "      fields(first: 100) {",
    "        nodes {",
    "          ... on ProjectV2Field { id name dataType }",
    "          ... on ProjectV2SingleSelectField {",
    "            id name dataType",
    "            options { id name }",
    "          }",
    "        }",
    "      }",
    "      items(first: 100, after: $cursor) {",
    "        nodes {",
    "          id",
    "          content {",
    "            ... on Issue {",
    "              number",
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

  let cursor;
  let projectId = "";
  let fields = [];
  let itemId = "";

  while (true) {
    const response = graphql(query, {
      login: OWNER,
      number: PROJECT_NUMBER,
      cursor
    });

    const project = response?.data?.user?.projectV2;
    if (!project) throw new Error("Could not resolve canonical GitHub Project.");

    projectId = project.id;
    fields = project.fields?.nodes || [];

    for (const item of project.items?.nodes || []) {
      if (
        item?.content?.repository?.nameWithOwner === REPOSITORY &&
        Number(item?.content?.number) === Number(evidence.issue)
      ) {
        itemId = item.id;
        break;
      }
    }

    if (itemId || !project.items?.pageInfo?.hasNextPage) break;
    cursor = project.items.pageInfo.endCursor;
  }

  if (!itemId) {
    throw new Error("Issue #" + evidence.issue + " is not present in canonical Project #" + PROJECT_NUMBER + ".");
  }

  const statusField = fields.find((field) => normalize(field?.name) === "status");
  if (!statusField) throw new Error("Project Status field was not found.");

  const statusOption = (statusField.options || []).find(
    (option) => normalize(option.name) === normalize(evidence.target_status)
  );
  if (!statusOption) {
    throw new Error('Project Status option "' + evidence.target_status + '" was not found.');
  }

  const updateStatus = [
    "mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {",
    "  updateProjectV2ItemFieldValue(input: {",
    "    projectId: $projectId",
    "    itemId: $itemId",
    "    fieldId: $fieldId",
    "    value: { singleSelectOptionId: $optionId }",
    "  }) { projectV2Item { id } }",
    "}"
  ].join("\n");

  graphql(updateStatus, {
    projectId,
    itemId,
    fieldId: statusField.id,
    optionId: statusOption.id
  });

  const actualCompletionField = fields.find(
    (field) => normalize(field?.name) === "actual completion"
  );

  if (actualCompletionField) {
    if (evidence.target_status === "Done") {
      const setDate = [
        "mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {",
        "  updateProjectV2ItemFieldValue(input: {",
        "    projectId: $projectId",
        "    itemId: $itemId",
        "    fieldId: $fieldId",
        "    value: { date: $date }",
        "  }) { projectV2Item { id } }",
        "}"
      ].join("\n");

      graphql(setDate, {
        projectId,
        itemId,
        fieldId: actualCompletionField.id,
        date: new Date().toISOString().slice(0, 10)
      });
    } else {
      const clearDate = [
        "mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {",
        "  clearProjectV2ItemFieldValue(input: {",
        "    projectId: $projectId",
        "    itemId: $itemId",
        "    fieldId: $fieldId",
        "  }) { projectV2Item { id } }",
        "}"
      ].join("\n");

      graphql(clearDate, {
        projectId,
        itemId,
        fieldId: actualCompletionField.id
      });
    }
  }

  if (evidence.target_status === "Done" && normalize(issue.state) !== "closed") {
    runGh([
      "issue",
      "close",
      String(evidence.issue),
      "--repo",
      REPOSITORY,
      "--reason",
      "completed"
    ]);
  }

  if (evidence.target_status === "Verification" && normalize(issue.state) === "closed") {
    runGh([
      "issue",
      "reopen",
      String(evidence.issue),
      "--repo",
      REPOSITORY
    ]);
  }

  process.stdout.write(
    JSON.stringify(
      {
        issue: evidence.issue,
        taskId: evidence.task_id,
        projectStatus: evidence.target_status,
        issueState: evidence.target_status === "Done" ? "CLOSED" : "OPEN"
      },
      null,
      2
    ) + "\n"
  );
} catch (error) {
  console.error("[project-transition] " + error.message);
  process.exit(1);
}
