import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { STARTER_PIPELINE, validatePipelineGraph } from "../lib/employer/ats-pipelines.ts";
import { inspectPipelineGraph, autoLayoutPipeline, simulateCandidateJourney } from "../lib/employer/pipeline-experience.ts";
const read = path=>readFileSync(new URL("../"+path, import.meta.url),"utf8");
const clone = ()=>structuredClone(STARTER_PIPELINE);

test("metadata is validated, optional and backward compatible",()=>{
 const graph=clone();
 graph.nodes[1].config.ownerRole="candidate";
 graph.nodes[1].config.targetHours=72;
 graph.nodes[1].config.expectedMinutes=20;
 const normalized=validatePipelineGraph(graph);
 assert.equal(normalized.nodes[1].config.targetHours,72);
 assert.equal(normalized.nodes[1].config.ownerRole,"candidate");
 const old=validatePipelineGraph(STARTER_PIPELINE);
 assert.equal(old.nodes[1].config.targetHours,undefined);
 graph.nodes[1].config.targetHours=4000;
 assert.throws(()=>validatePipelineGraph(graph),/target hours/);
 graph.nodes[1].config.targetHours=8;
 graph.nodes[1].config.ownerRole="platform_admin";
 assert.throws(()=>validatePipelineGraph(graph),/step owner role/);
});

test("graph issues map to nodes without requiring publish",()=>{
 const graph=clone();
 graph.edges=graph.edges.filter(e=>e.source!=="application");
 const issues=inspectPipelineGraph(graph);
 assert.ok(issues.some(i=>i.nodeId==="application"&&i.severity==="error"));
 assert.ok(issues.some(i=>i.nodeId==="review"&&i.message.includes("Not reachable")));
 const consent=clone();consent.nodes[1].kind="consent";consent.nodes[1].config={disclosure:""};
 assert.ok(inspectPipelineGraph(consent).some(i=>i.nodeId==="application"&&i.message.includes("disclosure")));
});

test("auto-layout repositions nodes deterministically, retains content and graph validity",()=>{
 const graph=clone();const old=JSON.stringify(graph);
 const a=autoLayoutPipeline(graph), b=autoLayoutPipeline(graph);
 assert.deepEqual(a,b);
 assert.equal(JSON.stringify(graph),old);
 assert.equal(a.edges.length,graph.edges.length);
 assert.equal(validatePipelineGraph(a).nodes.length,graph.nodes.length);
 assert.ok(a.nodes[1].x>a.nodes[0].x);
});

test("simulator stops at unchosen human decision; branches are explicit",()=>{
 const graph=clone();graph.nodes[2].kind="decision";
 graph.edges.find(e=>e.id==="e3").outcome="yes";
 graph.edges.push({id:"no",source:"review",target:"complete",outcome:"no"});
 const pending=simulateCandidateJourney(graph);
 assert.equal(pending.awaitingDecision,"review");
 assert.equal(pending.completedPath,false);
 const done=simulateCandidateJourney(graph,{review:"no"});
 assert.equal(done.awaitingDecision,null);
 assert.equal(done.completedPath,true);
 assert.ok(done.steps.some(step=>step.label==="Job application"));
});
test("simulator never projects hidden internal review or secrets",()=>{
 const graph=clone();
 graph.nodes[2].config.instructions="CONFIDENTIAL PRIVATE REVIEW";
 const result=simulateCandidateJourney(graph);
 assert.equal(result.steps.some(step=>step.label==="Employer review"),false);
 assert.equal(JSON.stringify(result).includes("CONFIDENTIAL"),false);
 assert.ok(result.nextAction?.includes("Job application"));
});

test("candidate timeline shows target windows as planning, not due dates",()=>{
 const graph=clone();graph.nodes[1].config={...graph.nodes[1].config,targetHours:48,ownerRole:"candidate"};
 const result=simulateCandidateJourney(graph);
 assert.equal(result.steps[0].targetHours,48);
 assert.equal(result.steps[0].owner,"candidate");
 const editor=read("components/employer/ats-pipeline-editor.tsx");
 for(const term of ["Candidate journey simulator","Await human decision","Target: within","not a confirmed deadline",
 "Responsible role","Target window (hours)","Estimated effort (minutes)"])assert.ok(editor.includes(term),term);
});
test("autosave preserves draft on failure, protects revision, and offers recovery",()=>{
 const editor=read("components/employer/ats-pipeline-editor.tsx");
 for(const term of ["localStorage.setItem","localStorage.removeItem","Restore draft","Discard copy",
 "setTimeout(() => { void save(); }, 1800)","latestDraft.current === snapshot","revision", "Autosave paused"])
 assert.ok(editor.includes(term),term);
 const css=read("app/employer/pipeline-builder/pipeline-simulator.css");
 assert.match(css,/ats-pipeline-recovery/);
});
test("canvas can pan, auto-layout, and jump via minimap",()=>{
 const editor=read("components/employer/ats-pipeline-editor.tsx");
 for(const term of ["autoLayoutPipeline(graph)","panRef.current","setPointerCapture",
 "ats-pipeline-minimap","panToMapPoint","viewportRef","centerOnNode",
 "ats-pipeline-node-issue"])assert.ok(editor.includes(term),term);
});
test("SQL publish gate accepts bounded task ownership metadata",()=>{
 const sql=read("supabase/migrations/20261018230000_ats_02_pipeline_task_metadata.sql");
 assert.match(sql,/ownerRole/);
 assert.match(sql,/targetHours/);
 assert.match(sql,/2160/);
 assert.match(sql,/security\.wf_ats_graph_publishable/);
});
