import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATS_NODE_KINDS, ATS_PROVIDER_KINDS, STARTER_PIPELINE,
  validatePipelineGraph, validatePipelineName, isPipelineConfigurator, isPipelinePublisher } from "../lib/employer/ats-pipelines.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261018213605_ats_02_pipeline_templates.sql",import.meta.url),"utf8");
const repo = readFileSync(new URL("../lib/employer/ats-pipelines-repository.ts",import.meta.url),"utf8");
const editor = readFileSync(new URL("../components/employer/ats-pipeline-editor.tsx",import.meta.url),"utf8");

const copy = (value) => structuredClone(value);
test("published graph validates, drafts can be unfinished", () => {
  assert.equal(validatePipelineGraph(STARTER_PIPELINE).nodes.length, 4);
  const partial=copy(STARTER_PIPELINE);
  partial.edges = partial.edges.slice(0,1);
  assert.equal(validatePipelineGraph(partial,false).edges.length,1);
  assert.throws(()=>validatePipelineGraph(partial),/disconnected|connect/);
  assert.deepEqual(ATS_NODE_KINDS.includes("interview_online"),true);
  assert.equal(ATS_PROVIDER_KINDS.has("background_check"),true);
});
test("branching rejects orphan nodes, cycles and malformed decisions",()=>{
  const cycle=copy(STARTER_PIPELINE);
  cycle.edges.push({ id:"loop", source:"review", target:"application" });
  assert.throws(()=>validatePipelineGraph(cycle),/connect|cycles/);
  const orphan=copy(STARTER_PIPELINE);
  orphan.nodes.push({id:"orphan",kind:"video",label:"Orphan",x:20,y:20,required:true,candidateVisible:true,config:{}});
  assert.throws(()=>validatePipelineGraph(orphan),/disconnected|connect/);
  const branch=copy(STARTER_PIPELINE);
  branch.nodes.find(n=>n.id==="review").kind="decision";
  assert.throws(()=>validatePipelineGraph(branch),/Decision requires/);
  branch.edges.push({id:"branch_no",source:"review",target:"complete",outcome:"no"});
  branch.edges.find(e=>e.id==="e3").outcome="yes";
  assert.ok(validatePipelineGraph(branch).nodes.length>0);
});
test("no secret keys, unsafe URLs or incomplete consent are publishable",()=>{
  const privateToken=copy(STARTER_PIPELINE);
  privateToken.nodes.find(n=>n.id==="application").config={apiKey:"secret"};
  assert.throws(()=>validatePipelineGraph(privateToken),/secret-bearing/);
  const video=copy(STARTER_PIPELINE);
  video.nodes.find(n=>n.id==="application").kind="video";
  video.nodes.find(n=>n.id==="application").config={url:"javascript:alert(1)"};
  assert.throws(()=>validatePipelineGraph(video),/HTTPS/);
  const consent=copy(STARTER_PIPELINE);
  consent.nodes.find(n=>n.id==="application").kind="consent";
  consent.nodes.find(n=>n.id==="application").config={disclosure:""};
  assert.throws(()=>validatePipelineGraph(consent),/disclosure/);
});
test("form fields bounded and names validated",()=>{
  const form=copy(STARTER_PIPELINE);
  form.nodes.find(n=>n.id==="application").config.fields=[{id:"email",label:"Email",type:"email",required:true}];
  assert.ok(validatePipelineGraph(form));
  form.nodes.find(n=>n.id==="application").config.fields.push({id:"email",label:"Other",type:"email",required:true});
  assert.throws(()=>validatePipelineGraph(form),/Duplicate/);
  assert.equal(validatePipelineName(" My pipeline "),"My pipeline");
  assert.throws(()=>validatePipelineName("x"),/at least 3/);
});
test("role boundaries and data contract preserve employer scope and revision",()=>{
  assert.ok(isPipelineConfigurator("recruiter"));
  assert.ok(isPipelinePublisher("employer_admin"));
  assert.equal(isPipelinePublisher("recruiter"),false);
  assert.equal(isPipelineConfigurator("employer_read_only"),false);
  assert.match(repo,/\.eq\("employer_id", context\.employerId\)\.eq\("revision", revision\)/);
  assert.match(repo,/validatePipelineGraph\(src\.graph, true\)/);
  assert.match(repo,/source_template_id: src\.id/);
  assert.match(migration,/alter table public\.wf_ats_pipeline_versions enable row level security/);
  assert.match(migration,/revoke all on public\.wf_ats_pipeline_versions from public, anon, authenticated/);
  assert.match(migration,/wf_ats_version_source_revision_unique/);
  assert.match(migration,/wf_ats_has_employer_role\(p_employer_id,array\['employer_owner','employer_admin'\]/);
  assert.match(migration,/security\.wf_ats_graph_publishable\(v_template\.graph_json\)/);
});
test("canvas provides accessible drag, keyboard, graph branch and version controls",()=>{
  for(const phrase of ["onDragStart","onDrop","onKeyDown","ArrowLeft","candidateVisible",
    "connect(selectedNode.id", "Publish version","Duplicate","Undo","Redo","CandidateJourneyLivePreview",
    "role=\"region\"", "aria-pressed"]) assert.ok(editor.includes(phrase), "Missing: "+phrase);
});
