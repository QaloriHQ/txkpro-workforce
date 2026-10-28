import test from "node:test";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  INCENTIVE_TEMPLATES,
  EMPLOYER_SIZES,
  PROGRAM_GOALS,
  templateDefinition,
  findIncentiveTemplate,
} from "../lib/incentives/templates.ts";
import { validateDefinition } from "../lib/incentives/contracts.ts";
import { EDITOR_HELP } from "../lib/incentives/field-help.ts";

test("complete presets cover every employer size and program goal with distinct valid rules", () => {
  assert.equal(INCENTIVE_TEMPLATES.length, 54);
  assert.equal(new Set(INCENTIVE_TEMPLATES.map((t) => t.id)).size, 54);
  assert.equal(new Set(INCENTIVE_TEMPLATES.map((t) => t.name)).size, 54);
  for (const size of Object.keys(EMPLOYER_SIZES))
    for (const goal of Object.keys(PROGRAM_GOALS)) {
      const group = INCENTIVE_TEMPLATES.filter(
        (t) => t.size === size && t.goal === goal,
      );
      assert.equal(group.length, 3, `${size}/${goal}`);
      assert.equal(
        new Set(group.map((t) => JSON.stringify(t.definition.milestones))).size,
        3,
      );
    }
  for (const t of INCENTIVE_TEMPLATES) {
    const d = templateDefinition(t, new Date("2026-10-28T18:00:00Z"));
    assert.deepEqual(validateDefinition(d, true), [], t.id);
    assert.equal(d.milestones.length, 3);
    assert.ok(d.terms.length > 1000 && d.terms.length <= 4000, t.id);
    assert.ok(t.evidence.length > 80);
    assert.ok(
      d.budgetCents >= (d.safetyPoints * d.centsPerBlock) / d.creditsPerBlock,
    );
    assert.equal(d.notifications.email, false);
    assert.ok(d.teams.every((c) => c.participantIds.length === 0));
    assert.ok(
      d.milestones
        .filter((m) => m.recipient === "crew")
        .every((m) => m.safetyRequired),
    );
    assert.ok(
      d.milestones
        .filter((m) => m.conditions.some((c) => c.metric === "service_days"))
        .every((m) => m.repeat === "once"),
    );
    if (t.goal === "recognition")
      assert.ok(
        d.givingAllowance > 0 && d.recipientMonthlyCap >= d.givingAllowance,
      );
    assert.ok(d.endsAt > d.startsAt);
  }
  assert.equal(findIncentiveTemplate("not-a-template"), undefined);
});
test("new drafts have fresh local dates, enough retention time and isolated mutable arrays", () => {
  const t = INCENTIVE_TEMPLATES.find((t) => t.id === "small-retention-2");
  const a = templateDefinition(t, new Date("2028-03-12T05:30:00Z"));
  const b = templateDefinition(t, new Date("2028-03-12T08:30:00Z"));
  assert.equal(a.startsAt, "2028-03-11");
  assert.equal(b.startsAt, "2028-03-12");
  assert.ok((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 86400000 >= 730);
  a.milestones[0].points = 999;
  a.milestones[0].conditions[0].value = 1;
  assert.notEqual(b.milestones[0].points, 999);
  assert.notEqual(t.definition.milestones[0].conditions[0].value, 1);
});
test("every native editor/simulator input is associated with contextual field help", () => {
  const source = ts.createSourceFile(
    "editor.tsx",
    readFileSync("components/incentives/editor.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let controls = 0;
  function walk(node) {
    if (
      (ts.isJsxSelfClosingElement(node) &&
        ["input", "select", "textarea"].includes(
          node.tagName.getText(source),
        )) ||
      (ts.isJsxOpeningElement(node) &&
        ["input", "select", "textarea"].includes(node.tagName.getText(source)))
    ) {
      controls++;
      let parent = node.parent;
      let helped = false;
      while (parent) {
        if (
          ts.isCallExpression(parent) &&
          parent.expression.getText(source) === "field"
        ) {
          helped = true;
          const label = parent.arguments[0];
          if (ts.isStringLiteral(label))
            assert.ok(EDITOR_HELP[label.text], `Missing help: ${label.text}`);
          break;
        }
        if (
          ts.isJsxElement(parent) &&
          ["EditorField", "CheckField"].includes(
            parent.openingElement.tagName.getText(source),
          )
        ) {
          helped = true;
          break;
        }
        parent = parent.parent;
      }
      assert.ok(
        helped,
        `Unexplained input: ${node.getText(source).slice(0, 100)}`,
      );
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.ok(controls >= 25);
  for (const key of [
    "Program budget (USD cents)",
    "Points per conversion block",
    "USD cents per block",
    "Normal redemption minimum (points)",
    "Verified safety report points",
    "Monthly points to give",
    "Monthly peer recipient cap",
    "Crew membership",
    "Safety checks",
    "Public recognition",
    "In-app notification preference",
    "Email notification preference",
    "Simulation safety",
    "budget percent",
    "delay hours",
    "reviews",
    "training count",
    "service days",
    "qualifying projects",
  ])
    assert.ok(EDITOR_HELP[key]?.length > 40, key);
});

test("every complete template is accepted by the canonical SQL publication validator", async () => {
  const migration = readFileSync(
    "supabase/staging/migrations/20261028004805_employer_incentive_engine.sql",
    "utf8",
  );
  const start = migration.indexOf(
    "create function security.incentive_validate(",
  );
  const end = migration.indexOf(
    "create function security.incentive_action(",
    start,
  );
  assert.ok(start > 0 && end > start);
  const db = new PGlite();
  try {
    await db.exec("create schema security;");
    await db.exec(migration.slice(start, end));
    for (const t of INCENTIVE_TEMPLATES)
      await db.query("select security.incentive_validate($1::jsonb,true)", [
        JSON.stringify(templateDefinition(t)),
      ]);
  } finally {
    await db.close();
  }
});

// Execute the actual page functions with controlled server context and navigation.
// No auth cookies, network requests, or program writes are created by this harness.
const nativeRequire = createRequire(import.meta.url);
class Navigation extends Error {
  constructor(destination) {
    super(destination);
    this.destination = destination;
  }
}
function pageUnderContext(file, context) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const dependencies = {
    "next/navigation": {
      redirect: (where) => {
        throw new Navigation(where);
      },
      notFound: () => {
        throw new Navigation("not-found");
      },
    },
    "@/lib/employer/auth": {
      getEmployerContext: async () => context,
      canManageCompany: (role) =>
        ["employer_owner", "employer_admin"].includes(role),
    },
    "@/lib/incentives/templates": {
      findIncentiveTemplate,
      templateDefinition,
      INCENTIVE_TEMPLATES,
      EMPLOYER_SIZES,
      PROGRAM_GOALS,
    },
    "@/components/incentives/shell": {
      IncentiveShell: "main",
      BackToPrograms: "nav",
    },
    "@/components/incentives/editor": { ProgramEditor: "editor" },
    "@/components/incentives/template-gallery": { TemplateGallery: "gallery" },
  };
  new Function("require", "exports", output)(
    (name) =>
      name === "react/jsx-runtime"
        ? nativeRequire(name)
        : (dependencies[name] ??
          (() => {
            throw new Error(`Unexpected page dependency ${name}`);
          })()),
    exports,
  );
  return exports.default;
}
test("template page flows redirect anonymous actors, deny unauthorized creation and safely prefill only allowlisted presets", async () => {
  const files = [
    "app/employer/incentives/new/page.tsx",
    "app/employer/incentives/templates/page.tsx",
  ];
  const args = {
    searchParams: Promise.resolve({ template: "small-quality-1" }),
  };
  const owner = {
    employerId: "owned-company",
    role: "employer_owner",
    approvalStatus: "approved",
    accountStatus: "active",
  };
  for (const file of files) {
    await assert.rejects(
      pageUnderContext(file, null)(args),
      (error) => error instanceof Navigation && error.destination === "/login",
    );
    for (const context of [
      { ...owner, approvalStatus: "pending" },
      { ...owner, accountStatus: "suspended" },
      { ...owner, accountStatus: "closed" },
    ])
      await assert.rejects(
        pageUnderContext(file, context)(args),
        (error) =>
          error instanceof Navigation && error.destination === "not-found",
      );
  }
  const create = pageUnderContext(files[0], owner);
  const page = await create(args);
  const editor = page.props.children[1];
  assert.equal(editor.props.ownerId, "owned-company");
  assert.equal(editor.props.initialDraft.blueprint, "quality");
  assert.equal(editor.props.initialDraft.milestones.length, 3);
  assert.notEqual(editor.props.initialDraft, INCENTIVE_TEMPLATES[0].definition);
  await assert.rejects(
    create({ searchParams: Promise.resolve({ template: "unknown" }) }),
    (error) => error instanceof Navigation && error.destination === "not-found",
  );
  const readonly = { ...owner, role: "employer_read_only" };
  await assert.rejects(
    pageUnderContext(files[0], readonly)(args),
    (error) => error instanceof Navigation && error.destination === "not-found",
  );
  const browse = await pageUnderContext(files[1], readonly)();
  assert.equal(browse.props.children[1].props.canCreate, false);
  const blank = await create({ searchParams: Promise.resolve({}) });
  assert.equal(blank.props.children[1].props.initialDraft, undefined);
});
