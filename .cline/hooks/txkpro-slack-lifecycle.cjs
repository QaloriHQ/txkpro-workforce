/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function notifySlackLifecycle({
  workspaceRoot,
  rawTaskId,
  state,
  issue,
  roadmapTaskId,
  contractId,
}) {
  if (process.env.TXKPRO_SLACK_LIFECYCLE_ENABLED === "false") {
    return { status: "SKIPPED", reason: "disabled" };
  }

  const script = path.join(
    workspaceRoot || process.cwd(),
    "scripts",
    "txkpro-slack-lifecycle.mjs",
  );
  const args = [
    script,
    "send",
    "--task-id",
    String(rawTaskId || ""),
    "--state",
    String(state || ""),
  ];
  if (issue) args.push("--issue", String(issue));
  if (roadmapTaskId) args.push("--roadmap-task-id", String(roadmapTaskId));
  if (contractId) args.push("--contract-id", String(contractId));

  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot || process.cwd(),
    encoding: "utf8",
    env: process.env,
    timeout: 8000,
  });

  if (result.error) {
    return {
      status: "FAILED",
      reason:
        result.error.code === "ETIMEDOUT"
          ? "lifecycle_helper_timeout"
          : String(result.error.message || "lifecycle_helper_error"),
    };
  }

  const output = String(result.stdout || "").trim();
  try {
    const lines = output.split(/\r?\n/).filter(Boolean);
    return JSON.parse(lines[lines.length - 1] || "{}");
  } catch {
    return {
      status: "FAILED",
      reason: "lifecycle_helper_malformed_output",
      exitCode: result.status,
    };
  }
}

module.exports = { notifySlackLifecycle };
