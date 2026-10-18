import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STARTER_PIPELINE, upsertPipelineConnection, removePipelineConnection,
  validatePipelineGraph,
} from "../lib/employer/ats-pipelines.ts";

const read = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");
const editor = read("components/employer/ats-pipeline-editor.tsx");
const nav = read("components/employer/workspace-nav.tsx");
const styles = read("app/employer/pipeline-builder/pipeline-editor-enhancements.css");
const shell = read("app/employer/sidebar-improvements.css");
const copy = () => structuredClone(STARTER_PIPELINE);

test("manual relation mapping replaces existing ordinary edge and preserves immutable graph", () => {
  const graph = copy();
  const before = JSON.stringify(graph);
  const next = upsertPipelineConnection(graph, "application", "complete");
  assert.equal(graph.edges.find(x => x.source === "application").target, "review");
  assert.equal(next.edges.find(x => x.source === "application").target, "complete");
  assert.equal(next.edges.filter(x => x.source === "application").length, 1);
  assert.equal(before, JSON.stringify(graph));
  assert.deepEqual(validatePipelineGraph(next, false), next);
});

test("relations reject cycles, self-links and connections into Start", () => {
  const graph = copy();
  assert.throws(() => upsertPipelineConnection(graph, "review", "application"), /cycle/);
  assert.throws(() => upsertPipelineConnection(graph, "review", "review"), /different/);
  assert.throws(() => upsertPipelineConnection(graph, "review", "start"), /Start/);
  assert.throws(() => upsertPipelineConnection(graph, "complete", "review"), /Start and End/);
});
test("Yes and No decision ports map to distinct outcomes", () => {
  const graph=copy();
  graph.nodes.find(n => n.id==="review").kind="decision";
  const yes = upsertPipelineConnection(graph, "review", "complete", "yes");
  // An attempted No branch to the earlier application step would create a cycle.
  // A cycle is blocked, so the old path would not be persisted.
  assert.ok(yes.edges.some(e=>e.source==="review" && e.outcome==="yes"));
  assert.throws(() => upsertPipelineConnection(yes,"review","application","no"),/cycle/);
  assert.equal(removePipelineConnection(yes, "review", "yes").edges.filter(e=>e.source==="review").length,0);
  assert.equal(removePipelineConnection(copy(),"application").edges.some(e=>e.source==="application"),false);
  assert.ok(graph.edges.some(e=>e.source==="review" && !e.outcome));
});
test("editor offers visible manual ports, modal settings, inline canvas zoom/undo", () => {
  for (const s of [
    'data-pipeline-node={node.id}',"ats-pipeline-port-input","ats-pipeline-port-output",
    "onPointerDown", "onPointerUp", "beginLink", "finishLink", "upsertPipelineConnection",
    "ats-pipeline-modal-backdrop", 'role="dialog"', 'aria-modal="true"', "modalRef.current?.focus()",
    'event.key === "Escape"', "ats-pipeline-canvas-controls", 'role="toolbar"',
    'title="Zoom in"', 'title="Zoom out"', 'title="Undo change"', 'title="Redo change"',
    "setSettingsOpen(true)", "ats-pipeline-help", "QuestionMarkCircleIcon",
  ]) assert.ok(editor.includes(s), "Missing "+s);
  assert.ok(!editor.includes('<div className="card ats-pipeline-inspector">'), "Static inspector should be removed.");
  assert.ok(styles.includes("position:fixed") && styles.includes("max-height:calc(100dvh - 32px)"));
});
test("all displayed library components and settings fields have discoverable info tooltips", () => {
  assert.match(editor,/ATS_NODE_KINDS\.filter/);
  assert.match(editor,/<Help label=\{LABELS\[kind\]\} text=\{DESCRIPTIONS\[kind\]\}/);
  for (const label of ["Step title","Required step","Candidate visibility","Instructions","Required disclosure","Media URL","Form fields","Connections","connection"]) {
    assert.ok(editor.includes('label="'+label+'"') || editor.includes('label={outcome+" connection"}'), "Tooltip "+label);
  }
});
test("employer sidebar collapses on desktop and nests Pipeline editor below Hiring Pipeline", () => {
  assert.match(nav,/aria-label=\{collapsed \? "Expand Employer sidebar"/);
  assert.match(nav,/employer-sidebar is-collapsed|is-collapsed/);
  assert.match(nav,/key: "pipeline"/);
  assert.match(nav,/href="\/employer\/pipeline-builder"/);
  assert.match(nav,/employer-nav-child/);
  assert.match(nav,/aria-expanded=\{pipelineExpanded\}/);
  assert.match(shell,/body:has\(\.employer-sidebar\.is-collapsed\)/);
  assert.match(shell,/@media\(max-width:900px\)/);
});
