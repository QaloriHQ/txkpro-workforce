import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARTER_PIPELINE } from "../lib/employer/ats-pipelines.ts";
import { simulateCandidateJourney } from "../lib/employer/pipeline-experience.ts";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const copy = () => structuredClone(STARTER_PIPELINE);

test("candidate projection changes immediately when the unsaved draft changes",()=>{
  const graph=copy();
  const initial=simulateCandidateJourney(graph);
  assert.deepEqual(initial.steps.map(s=>s.label),["Job application","Complete"]);
  const edited=structuredClone(graph);
  edited.nodes.find(n=>n.id==="application").label="New application title";
  edited.nodes.find(n=>n.id==="application").config.instructions="New candidate guidance";
  let projected=simulateCandidateJourney(edited);
  assert.equal(projected.steps[0].label,"New application title");
  assert.equal(projected.steps[0].instructions,"New candidate guidance");
  edited.nodes.find(n=>n.id==="application").candidateVisible=false;
  projected=simulateCandidateJourney(edited);
  assert.deepEqual(projected.steps.map(s=>s.label),["Complete"]);
  assert.deepEqual(simulateCandidateJourney(graph),initial,"Original graph is unchanged");
});

test("branch scenario selection and incomplete paths use the current live edges",()=>{
  const graph=copy();
  const review=graph.nodes.find(n=>n.id==="review");review.kind="decision";
  graph.edges.find(e=>e.id==="e3").outcome="yes";
  graph.edges.push({id:"e4",source:"review",target:"complete",outcome:"no"});
  const waiting=simulateCandidateJourney(graph,{});
  assert.equal(waiting.awaitingDecision,"review");
  assert.equal(waiting.completedPath,false);
  const yes=simulateCandidateJourney(graph,{review:"yes"});
  assert.equal(yes.completedPath,true);
  graph.edges=graph.edges.filter(e=>e.outcome!=="yes");
  const missing=simulateCandidateJourney(graph,{review:"yes"});
  assert.ok(missing.diagnostics.some(msg=>msg.includes("Missing connection")));
  assert.equal(missing.completedPath,false);
});

test("canvas and preview render together, live from the same unsaved React graph state",()=>{
  const editor=read("components/employer/ats-pipeline-editor.tsx");
  const preview=read("components/employer/candidate-journey-live-preview.tsx");
  const css=read("app/employer/pipeline-builder/pipeline-simulator.css");
  assert.ok(editor.includes("useMemo(() => simulateCandidateJourney(graph, branchChoices), [graph, branchChoices])"));
  assert.ok(editor.includes('className={"ats-pipeline-design-surface "+(preview?"is-preview-open":"")'));
  assert.ok(editor.includes("{preview?<CandidateJourneyLivePreview"));
  assert.ok(editor.includes("name={name} graph={graph} journey={journey} dirty={dirty}"));
  assert.ok(editor.includes('aria-label="Interactive hiring workflow canvas"'));
  assert.ok(editor.includes('Hide live preview'));
  assert.ok(!editor.includes("preview ? <div className=\"card ats-pipeline-simulator\""));
  assert.ok(css.includes(".ats-pipeline-design-surface.is-preview-open"));
  assert.ok(css.includes("grid-template-columns:minmax(0,1fr) minmax(325px,370px)"));
  assert.ok(preview.includes("No save or publish required"));
  assert.ok(preview.includes("Live preview · Candidate view"));
  assert.ok(preview.includes('disabled placeholder="Candidate response"'));
  assert.ok(preview.includes("Simulation only. No real applicant data"));
  assert.ok(!preview.includes("fetch(") && !preview.includes("google.script.run"));
});
