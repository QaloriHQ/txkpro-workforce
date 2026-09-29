#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/roadmap-next-planned.mjs [--json]

Reads TXKPRO GitHub Project #1 with PROJECTS_TOKEN and returns the earliest-added
open issue whose authoritative Project Status field is Planned.`);
  process.exit(0);
}

const token = process.env.PROJECTS_TOKEN?.trim();
if (!token) {
  console.error(
    "[roadmap] missing PROJECTS_TOKEN. Add it as a GitHub Codespaces secret with read:project access.",
  );
  process.exit(2);
}

const owner = process.env.TXKPRO_ROADMAP_OWNER?.trim() || "QaloriHQ";
const repository =
  process.env.TXKPRO_ROADMAP_REPO?.trim() || "QaloriHQ/txkpro-workforce";
const projectNumber = Number(
  process.env.TXKPRO_ROADMAP_PROJECT_NUMBER?.trim() || "1",
);

if (!Number.isInteger(projectNumber) || projectNumber <= 0) {
  console.error("[roadmap] TXKPRO_ROADMAP_PROJECT_NUMBER must be a positive integer.");
  process.exit(2);
}

const query = `
query($login: String!, $number: Int!, $cursor: String) {
  user(login: $login) {
    projectV2(number: $number) {
      id
      title
      items(first: 100, after: $cursor) {
        nodes {
          id
          createdAt
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
            }
          }
          content {
            ... on Issue {
              number
              title
              state
              createdAt
              body
              url
              repository {
                nameWithOwner
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

function runGraphql(cursor) {
  const commandArgs = [
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `login=${owner}`,
    "-F",
    `number=${projectNumber}`,
  ];

  if (cursor) {
    commandArgs.push("-f", `cursor=${cursor}`);
  }

  const result = spawnSync("gh", commandArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_TOKEN: token,
    },
  });

  if (result.error) {
    console.error(`[roadmap] unable to run gh: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join("\n");
    console.error("[roadmap] GitHub Project query failed.");
    if (details) console.error(details);
    process.exit(result.status || 1);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(`[roadmap] GitHub returned invalid JSON: ${error.message}`);
    process.exit(1);
  }
}

const items = [];
let cursor;

while (true) {
  const response = runGraphql(cursor);
  const project = response?.data?.user?.projectV2;

  if (!project) {
    const errors = response?.errors;
    console.error(
      `[roadmap] Could not resolve GitHub user Project #${projectNumber} for ${owner}.`,
    );
    if (errors) console.error(JSON.stringify(errors));
    process.exit(1);
  }

  items.push(...(project.items?.nodes || []));

  if (!project.items?.pageInfo?.hasNextPage) {
    break;
  }

  cursor = project.items.pageInfo.endCursor;
  if (!cursor) {
    console.error("[roadmap] Project pagination reported another page without a cursor.");
    process.exit(1);
  }
}

function projectStatus(item) {
  for (const value of item?.fieldValues?.nodes || []) {
    if (value?.field?.name === "Status") {
      return value?.name || "";
    }
  }
  return "";
}

function dependenciesFromBody(body) {
  const match = String(body || "").match(
    /\*\*Dependencies:\*\*\s*([^\r\n]+)/i,
  );
  return match?.[1]?.trim() || "None listed";
}

const candidates = items
  .map((item) => ({
    item,
    issue: item?.content,
    status: projectStatus(item),
  }))
  .filter(
    ({ issue, status }) =>
      issue?.repository?.nameWithOwner === repository &&
      issue?.state === "OPEN" &&
      status === "Planned",
  )
  .sort((a, b) => {
    const itemCreated =
      String(a.item.createdAt || "").localeCompare(String(b.item.createdAt || ""));
    if (itemCreated !== 0) return itemCreated;

    const issueCreated =
      String(a.issue.createdAt || "").localeCompare(String(b.issue.createdAt || ""));
    if (issueCreated !== 0) return issueCreated;

    return Number(a.issue.number || 0) - Number(b.issue.number || 0);
  });

if (candidates.length === 0) {
  console.error(
    `[roadmap] No open issues in ${repository} have authoritative Project Status = Planned.`,
  );
  process.exit(3);
}

const next = candidates[0];
const result = {
  issue: next.issue.number,
  title: next.issue.title,
  projectStatus: next.status,
  projectItemAddedAt: next.item.createdAt,
  issueCreatedAt: next.issue.createdAt,
  dependencies: dependenciesFromBody(next.issue.body),
  url: next.issue.url,
  projectOwner: owner,
  projectNumber,
  repository,
  whyNext:
    "Earliest-added GitHub Project item among open repository issues whose authoritative Project Status field is Planned.",
};

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`#${result.issue} ${result.title}`);
  console.log(`Project Status: ${result.projectStatus}`);
  console.log(`Project item added: ${result.projectItemAddedAt}`);
  console.log(`Issue created: ${result.issueCreatedAt}`);
  console.log(`Dependencies: ${result.dependencies}`);
  console.log(`Why next: ${result.whyNext}`);
  console.log(`URL: ${result.url}`);
}
