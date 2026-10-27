import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toStageGraph, validatePipelineGraph, STARTER_PIPELINE } from "../lib/employer/ats-pipelines.ts";
const read = path => readFileSync(new URL(path,import.meta.url),"utf8");
test("v1->v2 migration does not mutate old graph",()=>{
 const frozen=JSON.stringify(STARTER_PIPELINE); const v2=toStageGraph(STARTER_PIPELINE);
 assert.equal(v2.schemaVersion,2); assert.equal(v2.stages.length,1);
 assert.equal(v2.nodes.find(n=>n.kind==="application_form").stageId,"application_stage");
 assert.deepEqual(validatePipelineGraph(v2),v2);
 assert.equal(JSON.stringify(STARTER_PIPELINE),frozen);
});
test("stage validation rejects bad color, duplicate stage and orphan node",()=>{
 const v2=toStageGraph(STARTER_PIPELINE);
 const bad=structuredClone(v2);bad.nodes.find(n=>n.kind==="manual_review").stageId="other";
 assert.throws(()=>validatePipelineGraph(bad),/belong to a stage/);
 const color=structuredClone(v2);color.stages[0].color="red";
 assert.throws(()=>validatePipelineGraph(color),/stage colors/i);
 const dup=structuredClone(v2);dup.stages.push({...dup.stages[0]});
 assert.throws(()=>validatePipelineGraph(dup),/Duplicate stage/);
});
test("dedicated route reads only one employer-scoped pipeline, historic snapshot read-only",()=>{
 const route=read("../app/employer/pipelines/[pipelineId]/edit/page.tsx");
 const editor=read("../components/employer/ats-pipeline-editor.tsx");
 const past=read("../app/employer/pipelines/[pipelineId]/versions/[versionNumber]/page.tsx");
 const list=read("../components/employer/pipeline-directory.tsx");
 assert.ok(route.includes("getEmployerPipeline(context,pipelineId)"));
 assert.ok(route.includes("initialPipelines={[pipeline]}"));
 assert.ok(editor.includes("!dedicated ? <aside"));
 assert.ok(editor.includes("Add component after "));
 assert.ok(past.includes("Read-only immutable snapshot"));
 assert.ok(list.includes("Duplicate pipeline"));
});
test("SQL v2 graph validator is additive; version records remain immutable",()=>{
 const sql=read("../supabase/migrations/20261027043057_ats_02_stage_graph_v2.sql");
 assert.ok(sql.includes("create or replace function security.wf_ats_graph_publishable"));
 assert.ok(sql.includes("v_stage_ids"));
 assert.ok(!sql.toLowerCase().includes("update public.wf_ats_pipeline_versions"));
});
