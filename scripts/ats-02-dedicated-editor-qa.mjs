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
test("pipeline directory uses a compact responsive filter and scannable record cards",()=>{
 const page=read("../app/employer/pipelines/page.tsx");
 const list=read("../components/employer/pipeline-directory.tsx");
 const styles=read("../app/employer/pipelines/pipeline-editor.css");
 assert.ok(page.includes('import "./pipeline-editor.css"'));
 for(const evidence of ["Search by name or description","Filter by pipeline status","ats-directory-result-heading","ats-directory-facts","Published version","Draft revision","Last updated","Open pipeline","Clear filters"]){
  assert.ok(list.includes(evidence),`Missing optimized directory evidence: ${evidence}`);
 }
 assert.ok(list.includes("MagnifyingGlassIcon"));
 assert.ok(list.includes("data-pipeline-menu"));
 assert.match(styles,/\.ats-directory-facts\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(styles,/@media\(max-width:700px\).*\.ats-directory-card-actions\{display:grid;grid-template-columns:minmax\(0,1fr\) 44px\}/s);
});
test("SQL v2 graph validator is additive; version records remain immutable",()=>{
 const sql=read("../supabase/migrations/20261027043057_ats_02_stage_graph_v2.sql");
 assert.ok(sql.includes("create or replace function security.wf_ats_graph_publishable"));
 assert.ok(sql.includes("v_stage_ids"));
 assert.ok(!sql.toLowerCase().includes("update public.wf_ats_pipeline_versions"));
});

test("historical version restoration checks permission and revision without changing immutable snapshots",()=>{
 const view=read("../app/employer/pipelines/[pipelineId]/versions/[versionNumber]/page.tsx");
 const restore=read("../components/employer/restore-pipeline-version.tsx");
 const api=read("../app/api/employer/pipelines/[id]/route.ts");
 const repo=read("../lib/employer/ats-pipelines-repository.ts");
 assert.ok(view.includes("isPipelineConfigurator(context.role)"));
 assert.ok(view.includes("RestorePipelineVersion"));
 assert.ok(restore.includes("window.confirm("));
 assert.ok(restore.includes("method:\"PATCH\""));
 assert.ok(restore.includes("revision,fields:{name,description,graph}"));
 assert.ok(restore.includes("response.status===409"));
 assert.ok(!restore.includes("wf_ats_pipeline_versions"));
 assert.ok(api.includes("saveEmployerPipeline"));
 assert.ok(repo.includes('.eq("revision", revision)'));
});
test("integrations gallery checks live connection state with one level of modal and no credentialed claims without evidence",()=>{
 const gallery=read("../components/employer/integrations-gallery.tsx");
 const checkr=read("../components/employer/checkr-connection.tsx");
 assert.ok(gallery.includes('op:"workspace"'));
 assert.ok(gallery.includes('checkrStatus'));
 assert.ok(gallery.includes('<CheckrConnection employerId={employerId} embedded/>'));
 assert.ok(checkr.includes("if(embedded)return"));
 assert.ok(checkr.includes("data.credentialed"));
 assert.ok(gallery.includes("setActive(null)"));
});
