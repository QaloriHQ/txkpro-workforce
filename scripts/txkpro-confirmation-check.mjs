#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const evidencePath = argValue("--evidence");
if (!evidencePath) {
  console.error("[confirmation-check] Use --evidence <path>.");
  process.exit(2);
}

let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch (error) {
  console.error(
    "[confirmation-check] Could not read evidence JSON: " + error.message,
  );
  process.exit(2);
}

const repoRoot = process.cwd();
const expectedContract = "semantic-provenance-v3";
const expectedPlanContract = "sourced-plan-v1";
const requiredConfirmations = [
  "rolesAndScopes",
  "dataOwnership",
  "statusesAndEvents",
  "iaAndDesign",
  "stagingTargets",
  "credentials",
  "manualUat",
  "unresolvedDecisions",
];

const allowedStatuses = new Set(["CONFIRMED", "BLOCKED", "UNRESOLVED"]);

const allowedPredicates = {
  rolesAndScopes: new Set(["role_defined", "scope_defined", "capability_defined"]),
  dataOwnership: new Set(["data_class_owner", "writer_defined", "reader_defined"]),
  statusesAndEvents: new Set(["status_family_defined", "event_defined", "transition_defined"]),
  iaAndDesign: new Set(["ui_authority_defined", "ia_requirement_defined", "route_pattern_defined"]),
  stagingTargets: new Set(["git_ref_exists", "staging_target_defined"]),
  credentials: new Set(["credential_present"]),
  manualUat: new Set(["uat_owner_defined", "uat_requirement_defined"]),
  unresolvedDecisions: new Set(["decision_resolved", "blocker_state_defined"]),
};

const allowedVerificationTypes = new Set([
  "source_text_match",
  "env_presence",
  "git_ref_exists",
  "github_issue_text_match",
]);

const constrainedPlanKinds = new Set([
  "api_route",
  "database_field",
  "status",
  "event",
  "url_pattern",
  "credential",
  "owner",
]);

const allowedPlanKinds = new Set([
  ...constrainedPlanKinds,
  "architecture",
  "test_requirement",
  "ui_surface",
  "migration",
]);

const vagueSourceValues = new Set(
  [
    "role matrix",
    "data ownership rules",
    "status dictionary",
    "event map",
    "ui standard",
    "design system",
    "staging config",
    "presence checks only",
    "manual uat rule",
    "issue/source review",
    "issue review",
    "source review",
    "environment",
    "config",
    "github",
  ].map((value) => value.toLowerCase()),
);

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value) {
  return textValue(value).toLowerCase();
}

function assertionValues(assertion) {
  if (Array.isArray(assertion?.values)) {
    return assertion.values.map(textValue).filter(Boolean);
  }
  const single = textValue(assertion?.value);
  return single ? [single] : [];
}

function claimTerms(entry) {
  return [
    textValue(entry?.assertion?.subject),
    ...assertionValues(entry?.assertion),
  ].filter(Boolean);
}

function textContainsAllClaimTerms(text, entry) {
  const haystack = String(text || "").toLowerCase();
  return claimTerms(entry).every((term) => haystack.includes(term.toLowerCase()));
}

function validateAssertion(key, entry, prefix) {
  const assertion = entry?.assertion;
  if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
    return [prefix + ".assertion object is required"];
  }

  const errors = [];
  const subject = textValue(assertion.subject);
  const predicate = textValue(assertion.predicate);
  const values = assertionValues(assertion);

  if (!subject) errors.push(prefix + ".assertion.subject is required");
  if (!predicate) {
    errors.push(prefix + ".assertion.predicate is required");
  } else if (!allowedPredicates[key]?.has(predicate)) {
    errors.push(
      prefix +
        ".assertion.predicate is not allowed for " +
        key +
        "; allowed: " +
        [...(allowedPredicates[key] || [])].join(", "),
    );
  }
  if (values.length === 0) {
    errors.push(prefix + ".assertion.values must contain at least one value");
  }
  return errors;
}

function sourceLooksSpecific(source) {
  const normalized = source.toLowerCase();
  if (vagueSourceValues.has(normalized)) return false;

  return (
    source.includes("/") ||
    source.includes("\\") ||
    /^https?:\/\//i.test(source) ||
    /^github[- ](issue|project|pull request)[: #]/i.test(source) ||
    /^(environment|credential|repository|deployment|staging|runtime|project|git)-[a-z0-9-]+-check$/i.test(
      source,
    ) ||
    /^[A-Za-z0-9_.-]+:[A-Za-z0-9_#./:-]+$/.test(source)
  );
}

function resolveRepoSource(source) {
  if (!source || path.isAbsolute(source)) return null;
  const resolved = path.resolve(repoRoot, source);
  const rootWithSeparator = repoRoot.endsWith(path.sep)
    ? repoRoot
    : repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(rootWithSeparator)) {
    return null;
  }
  return resolved;
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
}

function readGithubIssueText(issueNumber, repository) {
  const result = spawnSync(
    "gh",
    [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      repository,
      "--json",
      "title,body,comments",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: String(
        result.stderr ||
          result.stdout ||
          result.error?.message ||
          "GitHub issue lookup failed",
      ).trim(),
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const comments = Array.isArray(parsed.comments)
      ? parsed.comments.map((comment) => String(comment?.body || ""))
      : [];
    return {
      ok: true,
      text: [parsed.title || "", parsed.body || "", ...comments].join("\n"),
    };
  } catch (error) {
    return { ok: false, error: "Could not parse GitHub issue JSON: " + error.message };
  }
}

function verifyEvidenceEntry(key, entry, index) {
  const prefix = key + ".evidence[" + index + "]";
  const verification = entry?.verification;

  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    return [prefix + ".verification object is required"];
  }

  const type = textValue(verification.type);
  if (!allowedVerificationTypes.has(type)) {
    return [
      prefix +
        ".verification.type must be one of: " +
        [...allowedVerificationTypes].join(", "),
    ];
  }

  if (type === "source_text_match") {
    const source = textValue(entry.source);
    const sourcePath = resolveRepoSource(source);
    const needle = textValue(verification.needle);

    if (!sourcePath) {
      return [prefix + ".source must be a repository-relative path for " + type];
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return [prefix + ".source does not exist as a repository file: " + source];
    }
    if (!needle) {
      return [prefix + ".verification.needle is required for " + type];
    }

    const sourceText = fs.readFileSync(sourcePath, "utf8");
    const locator = textValue(entry.locator);
    if (locator && !sourceText.includes(locator)) {
      return [
        prefix +
          ".locator was not found in the cited source; do not invent section names",
      ];
    }

    if (!sourceText.includes(needle)) {
      return [
        prefix +
          ".verification.needle was not found in the cited source; the finding is not machine-grounded",
      ];
    }
    if (!textContainsAllClaimTerms(needle, entry)) {
      return [
        prefix +
          ".verification.needle must contain the assertion subject and every asserted value; unrelated source text cannot prove the claim",
      ];
    }

    return [];
  }

  if (type === "env_presence") {
    if (key !== "credentials" || textValue(entry?.assertion?.predicate) !== "credential_present") {
      return [prefix + ".verification env_presence only proves credentials.credential_present"];
    }
    const name = textValue(verification.name);
    if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
      return [
        prefix +
          ".verification.name must be a valid uppercase environment-variable name",
      ];
    }
    const asserted = [
      textValue(entry?.assertion?.subject),
      ...assertionValues(entry?.assertion),
    ].map(normalized);
    if (!asserted.includes(normalized(name))) {
      return [
        prefix +
          ".verification.name must match the credential asserted in subject/values",
      ];
    }
    if (!String(process.env[name] || "").trim()) {
      return [
        prefix +
          ".verification env_presence failed for " +
          name +
          "; value was not printed",
      ];
    }
    return [];
  }

  if (type === "git_ref_exists") {
    if (key !== "stagingTargets" || textValue(entry?.assertion?.predicate) !== "git_ref_exists") {
      return [prefix + ".verification git_ref_exists only proves stagingTargets.git_ref_exists"];
    }
    const ref = textValue(verification.ref);
    if (!ref || !/^refs\/(heads|remotes|tags)\/[A-Za-z0-9._\/-]+$/.test(ref)) {
      return [
        prefix +
          ".verification.ref must be an explicit refs/heads, refs/remotes, or refs/tags ref",
      ];
    }
    const asserted = [
      textValue(entry?.assertion?.subject),
      ...assertionValues(entry?.assertion),
    ].map(normalized);
    if (!asserted.includes(normalized(ref))) {
      return [
        prefix +
          ".verification.ref must match the Git ref asserted in subject/values",
      ];
    }
    const result = runGit(["show-ref", "--verify", "--quiet", ref]);
    if (result.error || result.status !== 0) {
      return [prefix + ".verification git_ref_exists failed for " + ref];
    }
    return [];
  }

  if (type === "github_issue_text_match") {
    if (
      key !== "unresolvedDecisions" ||
      textValue(entry?.assertion?.predicate) !== "decision_resolved"
    ) {
      return [
        prefix +
          ".verification github_issue_text_match only proves unresolvedDecisions.decision_resolved",
      ];
    }
    const issueNumber = Number(verification.issue || evidence.issue);
    const repository =
      textValue(verification.repository) || "QaloriHQ/txkpro-workforce";
    const needle = textValue(verification.needle);

    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return [prefix + ".verification.issue must be a positive integer"];
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      return [prefix + ".verification.repository must be owner/repository"];
    }
    if (!needle) {
      return [
        prefix + ".verification.needle is required for github_issue_text_match",
      ];
    }

    const lookup = readGithubIssueText(issueNumber, repository);
    if (!lookup.ok) {
      return [prefix + ".verification GitHub issue lookup failed: " + lookup.error];
    }
    if (!lookup.text.includes(needle)) {
      return [
        prefix +
          ".verification.needle was not found in live GitHub issue #" +
          issueNumber,
      ];
    }
    if (!textContainsAllClaimTerms(needle, entry)) {
      return [
        prefix +
          ".verification.needle must contain the assertion subject and every asserted value; unrelated issue text cannot prove the decision",
      ];
    }
    return [];
  }

  return [prefix + ".verification type is unsupported"];
}

function validateEvidenceEntry(key, entry, index) {
  const prefix = key + ".evidence[" + index + "]";

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return [
      prefix +
        " must be an object with source, finding, assertion, locator/checkType, and verification",
    ];
  }

  const errors = [];
  const source = textValue(entry.source);
  const locator = textValue(entry.locator);
  const checkType = textValue(entry.checkType);
  const finding = textValue(entry.finding);

  if (!source) {
    errors.push(prefix + ".source is required");
  } else if (source.length < 8 || !sourceLooksSpecific(source)) {
    errors.push(
      prefix +
        ".source must identify a specific authoritative artifact or named live-state check",
    );
  }

  if (!locator && !checkType) {
    errors.push(prefix + " requires locator or checkType");
  }

  if (locator && locator.length < 3) {
    errors.push(prefix + ".locator is too vague");
  }

  if (checkType && checkType.length < 3) {
    errors.push(prefix + ".checkType is too vague");
  }

  if (!finding) {
    errors.push(prefix + ".finding is required");
  } else if (finding.length < 12) {
    errors.push(prefix + ".finding must state the concrete result that was observed");
  }

  errors.push(...validateAssertion(key, entry, prefix));
  errors.push(...verifyEvidenceEntry(key, entry, index));
  return errors;
}

function evidenceMentionsDecision(entry, decisionName) {
  const needle = normalized(decisionName);
  if (!needle) return false;
  const terms = [
    textValue(entry?.assertion?.subject),
    ...assertionValues(entry?.assertion),
    textValue(entry?.finding),
  ].filter(Boolean);
  return terms.some((term) => {
    const candidate = normalized(term);
    return candidate.includes(needle) || needle.includes(candidate);
  });
}

function validateImplementationPlan() {
  const errors = [];
  const plan = evidence.implementationPlan;

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return ["implementationPlan object is required"];
  }
  if (plan.contract !== expectedPlanContract) {
    errors.push("implementationPlan.contract must equal " + expectedPlanContract);
  }
  if (!Array.isArray(plan.decisions) || plan.decisions.length === 0) {
    errors.push("implementationPlan.decisions must contain at least one typed decision");
    return errors;
  }

  plan.decisions.forEach((decision, index) => {
    const prefix = "implementationPlan.decisions[" + index + "]";
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      errors.push(prefix + " must be an object");
      return;
    }

    const kind = textValue(decision.kind);
    const name = textValue(decision.name);
    const basis = textValue(decision.basis).toUpperCase();
    const label = textValue(decision.label);

    if (!allowedPlanKinds.has(kind)) {
      errors.push(prefix + ".kind is invalid; allowed: " + [...allowedPlanKinds].join(", "));
    }
    if (!name) errors.push(prefix + ".name is required");
    if (!["SOURCED", "PROPOSED"].includes(basis)) {
      errors.push(prefix + ".basis must be SOURCED or PROPOSED");
      return;
    }

    if (basis === "PROPOSED") {
      if (label !== "PROPOSED — requires product/technical decision") {
        errors.push(
          prefix +
            ".label must equal PROPOSED — requires product/technical decision when basis is PROPOSED",
        );
      }
      return;
    }

    const confirmation = textValue(decision.confirmation);
    const evidenceIndex = Number(decision.evidenceIndex);
    if (!requiredConfirmations.includes(confirmation)) {
      errors.push(prefix + ".confirmation must name one of the eight confirmation keys");
      return;
    }
    if (!Number.isInteger(evidenceIndex) || evidenceIndex < 0) {
      errors.push(prefix + ".evidenceIndex must be a non-negative integer");
      return;
    }

    const referenced = evidence.confirmations?.[confirmation]?.evidence?.[evidenceIndex];
    if (!referenced) {
      errors.push(prefix + " references missing confirmation evidence");
      return;
    }
    if (!evidenceMentionsDecision(referenced, name)) {
      errors.push(
        prefix +
          " is marked SOURCED but referenced evidence does not mention the decision name; use PROPOSED instead of inventing implementation detail",
      );
    }
  });

  return errors;
}

const validationErrors = [];

if (!Number.isInteger(Number(evidence.issue)) || Number(evidence.issue) <= 0) {
  validationErrors.push("issue must be a positive integer");
}

if (!String(evidence.taskId || "").trim()) {
  validationErrors.push("taskId is required");
}

if (evidence.evidenceContract !== expectedContract) {
  validationErrors.push(
    "evidenceContract must equal " +
      expectedContract +
      "; read .github/TXKPRO_READONLY_CONFIRMATION_TEMPLATE.json instead of guessing the schema",
  );
}

if (
  !evidence.confirmations ||
  typeof evidence.confirmations !== "object" ||
  Array.isArray(evidence.confirmations)
) {
  validationErrors.push("confirmations object is required");
}

const statuses = [];

for (const key of requiredConfirmations) {
  const item = evidence.confirmations?.[key];

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    validationErrors.push("missing confirmation: " + key);
    continue;
  }

  const status = String(item.status || "")
    .trim()
    .toUpperCase();

  if (!allowedStatuses.has(status)) {
    validationErrors.push(
      key + ".status must be CONFIRMED, BLOCKED, or UNRESOLVED",
    );
  }

  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    validationErrors.push(
      key + ".evidence must contain at least one machine-verifiable provenance entry",
    );
  } else {
    item.evidence.forEach((entry, index) => {
      validationErrors.push(...validateEvidenceEntry(key, entry, index));
    });
  }

  statuses.push({ key, status });
}

validationErrors.push(...validateImplementationPlan());

if (validationErrors.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "INVALID",
        issue: Number.isInteger(Number(evidence.issue))
          ? Number(evidence.issue)
          : null,
        taskId: String(evidence.taskId || "").trim() || null,
        evidenceContract: expectedContract,
        planContract: expectedPlanContract,
        validationErrors,
        allowedVerificationTypes: [...allowedVerificationTypes],
        requiredEvidenceShape: {
          source:
            "Specific repository file, GitHub issue identifier, or named live-state check",
          locator:
            "Section, heading, field, route, config key, or other source locator",
          checkType:
            "Named live-state check when locator does not apply",
          finding:
            "Concrete observation supported by the source/check",
          assertion: {
            subject: "Exact thing being claimed",
            predicate: "Typed predicate allowed for the confirmation category",
            values: ["Exact claimed value(s)"],
          },
          verification:
            "Machine-verifiable proof bound to the typed assertion. source_text_match and github_issue_text_match needles must contain the assertion subject and every asserted value.",
          implementationPlan:
            "Every API route, database field, status, event, URL pattern, credential, and owner must be SOURCED from confirmation evidence or labeled PROPOSED — requires product/technical decision.",
        },
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const blocked = statuses.filter(
  (item) => item.status === "BLOCKED" || item.status === "UNRESOLVED",
);

if (blocked.length > 0) {
  console.log(
    "TXKPRO_CONFIRMATIONS_BLOCKED issue=" +
      evidence.issue +
      " taskId=" +
      evidence.taskId,
  );
  console.log(
    JSON.stringify(
      {
        status: "BLOCKED",
        issue: Number(evidence.issue),
        taskId: evidence.taskId,
        blockedConfirmations: blocked,
        mutationAuthorized: false,
        evidenceContract: expectedContract,
        planContract: expectedPlanContract,
        nextAction:
          "Continue read-only analysis with the next provisional candidate. Do not ask the user for permission to continue.",
      },
      null,
      2,
    ),
  );
  process.exit(3);
}

console.log(
  "TXKPRO_CONFIRMATIONS_CONFIRMED issue=" +
    evidence.issue +
    " taskId=" +
    evidence.taskId,
);
console.log(
  "TXKPRO_PLAN_CONTRACT_CONFIRMED issue=" +
    evidence.issue +
    " taskId=" +
    evidence.taskId,
);
console.log(
  JSON.stringify(
    {
      status: "CONFIRMED",
      issue: Number(evidence.issue),
      taskId: evidence.taskId,
      readOnlyConfirmations: "CONFIRMED",
      implementationPlanContract: "CONFIRMED",
      nextEligibleTaskConfirmed: true,
      mutationAuthorized: false,
      evidenceContract: expectedContract,
      planContract: expectedPlanContract,
      nextAction:
        "Present only the validated sourced/proposed implementation plan and await explicit owner approval before mutation.",
    },
    null,
    2,
  ),
);
