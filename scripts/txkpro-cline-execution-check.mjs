#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtime = require("../.cline/hooks/txkpro-orchestration-runtime.cjs");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

try {
  const resultPath = argValue("--result");
  const contractPath = argValue("--contract");
  if (!resultPath || !contractPath) throw new Error("Use --result <path> --contract <path>.");
  const execution = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const errors = runtime.validateExecutionInput(execution, contract);
  if (errors.length > 0) throw new Error(errors.join("; "));

  const resultDigest = runtime.sha256(JSON.stringify(runtime.canonicalize(execution)));
  const artifact = {
    type: runtime.EXECUTION_VALIDATION_TYPE,
    schemaVersion: runtime.EXECUTION_VALIDATION_SCHEMA,
    status: "VALIDATED",
    executionStatus: execution.status,
    issue: Number(execution.issue),
    taskId: String(execution.taskId),
    contractId: String(execution.contractId),
    resultDigest,
    successSentinels: [runtime.EXECUTION_SENTINEL],
    validatedExecution: execution,
    validationId: "",
    validatedAt: new Date().toISOString(),
  };
  artifact.validationId = runtime.expectedExecutionValidationId(artifact);
  process.stdout.write(JSON.stringify(artifact, null, 2) + "\n");
} catch (error) {
  console.error("[cline-execution-check] " + error.message);
  process.exit(2);
}
