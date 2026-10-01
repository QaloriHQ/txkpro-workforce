#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import {
  extractEvidenceFromText,
  validateEvidence
} from "./lib/txkpro-evidence.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readInput() {
  const evidencePath = argValue("--evidence");
  const commentPath = argValue("--comment");
  const useStdin = process.argv.includes("--stdin");

  if (evidencePath) {
    return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  }

  if (commentPath) {
    const body = fs.readFileSync(commentPath, "utf8");
    const evidence = extractEvidenceFromText(body);
    if (!evidence) throw new Error("No TXKPRO protocol evidence marker found.");
    return evidence;
  }

  if (useStdin) {
    const body = fs.readFileSync(0, "utf8");
    if (body.includes("<!-- txkpro-protocol-evidence:v1 -->")) {
      const evidence = extractEvidenceFromText(body);
      if (!evidence) throw new Error("No TXKPRO protocol evidence marker found.");
      return evidence;
    }
    return JSON.parse(body);
  }

  throw new Error("Use --evidence <file>, --comment <file>, or --stdin.");
}

try {
  const evidence = readInput();
  const expectedIssueRaw = argValue("--issue");
  const expectedIssue = expectedIssueRaw ? Number(expectedIssueRaw) : undefined;
  const expectedTaskId = argValue("--task-id");
  const result = validateEvidence(evidence, {
    expectedIssue,
    expectedTaskId
  });

  for (const warning of result.warnings) {
    console.error("[protocol-check] warning: " + warning);
  }

  if (!result.valid) {
    for (const error of result.errors) {
      console.error("[protocol-check] error: " + error);
    }
    process.exit(1);
  }

  const outputPath = argValue("--write-normalized");
  const normalized = JSON.stringify(evidence, null, 2) + "\n";
  if (outputPath) fs.writeFileSync(outputPath, normalized, "utf8");

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({
      valid: true,
      targetStatus: evidence.target_status,
      issue: evidence.issue,
      taskId: evidence.task_id,
      warnings: result.warnings
    }, null, 2) + "\n");
  } else {
    console.log(
      "[protocol-check] PASS issue #" +
        evidence.issue +
        " " +
        evidence.task_id +
        " -> " +
        evidence.target_status
    );
  }
} catch (error) {
  console.error("[protocol-check] " + error.message);
  process.exit(1);
}
