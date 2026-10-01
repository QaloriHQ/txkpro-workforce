#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const REMOTE = process.env.TXKPRO_REPO_REMOTE?.trim() || "origin";
const BRANCH = process.env.TXKPRO_REPO_BRANCH?.trim() || "main";
const REF = `${REMOTE}/${BRANCH}`;

function runGit(args, { allowNoMatch = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    console.error(`[repo-latest] unable to run git: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (allowNoMatch && result.status === 1) {
      return "";
    }
    const details = [result.stdout, result.stderr]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join("\n");
    console.error(`[repo-latest] git ${args.join(" ")} failed`);
    if (details) console.error(details);
    process.exit(result.status || 1);
  }

  return result.stdout;
}

function refresh() {
  runGit(["fetch", "--quiet", REMOTE, BRANCH]);
}

function requireArg(value, message) {
  if (!value?.trim()) {
    console.error(message);
    process.exit(2);
  }
  return value.trim();
}

function usage() {
  console.log(`Usage:
  node scripts/repo-latest.mjs status
  node scripts/repo-latest.mjs list [path-substring]
  node scripts/repo-latest.mjs find <path-substring>
  node scripts/repo-latest.mjs grep <extended-regex>
  node scripts/repo-latest.mjs exists <path>
  node scripts/repo-latest.mjs read <path>

Every command first fetches ${REMOTE}/${BRANCH}. The helper never merges,
checks out, resets, stages, or modifies the working tree.`);
}

const [command = "status", ...rest] = process.argv.slice(2);

if (command === "--help" || command === "-h" || command === "help") {
  usage();
  process.exit(0);
}

refresh();

switch (command) {
  case "status": {
    const local = runGit(["rev-parse", "--short", "HEAD"]).trim();
    const remote = runGit(["rev-parse", "--short", REF]).trim();
    const dirty = runGit(["status", "--short"]).trim();
    console.log(`local=${local}`);
    console.log(`remote=${remote}`);
    console.log(`behind_or_diverged=${local !== remote ? "yes" : "no"}`);
    console.log(`working_tree_dirty=${dirty ? "yes" : "no"}`);
    break;
  }

  case "list":
  case "find": {
    const filter = rest.join(" ").trim().toLowerCase();
    const files = runGit(["ls-tree", "-r", "--name-only", REF])
      .split(/\r?\n/)
      .filter(Boolean);

    const matches = filter
      ? files.filter((path) => path.toLowerCase().includes(filter))
      : files;

    process.stdout.write(matches.join("\n"));
    if (matches.length) process.stdout.write("\n");
    break;
  }

  case "grep": {
    const pattern = requireArg(
      rest.join(" "),
      "[repo-latest] grep requires an extended regular expression",
    );
    const output = runGit(
      ["grep", "-n", "-i", "-I", "-E", pattern, REF, "--", "."],
      { allowNoMatch: true },
    );
    process.stdout.write(output);
    break;
  }

  case "exists": {
    const path = requireArg(rest.join(" "), "[repo-latest] exists requires a path");
    const result = spawnSync("git", ["cat-file", "-e", `${REF}:${path}`], {
      encoding: "utf8",
      env: process.env,
    });
    if (result.error) {
      console.error(`[repo-latest] unable to run git: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status === 0) {
      console.log("yes");
      process.exit(0);
    }
    console.log("no");
    process.exit(3);
  }

  case "read": {
    const path = requireArg(rest.join(" "), "[repo-latest] read requires a path");
    process.stdout.write(runGit(["show", `${REF}:${path}`]));
    break;
  }

  default:
    console.error(`[repo-latest] unknown command: ${command}`);
    usage();
    process.exit(2);
}
