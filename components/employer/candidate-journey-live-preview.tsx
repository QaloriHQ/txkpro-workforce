"use client";

import { useState } from "react";
import {
  ATS_PROVIDER_KINDS,
  type PipelineGraph, type PipelineNode, type PipelineField,
} from "@/lib/employer/ats-pipelines";
import type { CandidateJourneyPreview } from "@/lib/employer/pipeline-experience";

type Props = {
  name: string; graph: PipelineGraph; journey: CandidateJourneyPreview;
  choices: Record<string,"yes"|"no">;
  onChoice: (nodeId:string, outcome:"yes"|"no"|undefined)=>void;
  onClose: ()=>void;
  onLocate: (id:string)=>void;
  dirty: boolean;
};

function FieldPreview({field}:{field:PipelineField}) {
  const label = <span>{field.label}{field.required?" *":""}</span>;
  if(field.type==="checkbox")return <label className="ats-preview-field ats-preview-checkbox">
    <input type="checkbox" aria-label={field.label} disabled/>{label}</label>;
  if(field.type==="textarea")return <label className="ats-preview-field">{label}
    <textarea rows={2} disabled placeholder="Candidate response"/></label>;
  if(field.type==="select")return <label className="ats-preview-field">{label}
    <select disabled defaultValue=""><option value="">Choose an option</option>
      {(field.options??[]).map(option=><option key={option} value={option}>{option}</option>)}
    </select></label>;
  return <label className="ats-preview-field">{label}
    <input disabled type={["email","number"].includes(field.type)?field.type:"text"}
      placeholder="Candidate response"/></label>;
}
function CandidateContent({node}:{node:PipelineNode}) {
  const provider=ATS_PROVIDER_KINDS.has(node.kind);
  return <div className="ats-preview-step-detail">
    {node.config.instructions?<p>{node.config.instructions}</p>:null}
    {node.kind==="application_form"?<div className="ats-preview-form-fields">
      {(node.config.fields??[]).length ?
        node.config.fields?.map(field=><FieldPreview key={field.id} field={field}/>) :
        <p className="ats-preview-muted">Application questions have not been added yet.</p>}
    </div>:null}
    {node.kind==="consent"?<div className="ats-preview-disclosure">
      <strong>Consent disclosure</strong>
      <p>{node.config.disclosure||"Disclosure is not configured yet."}</p>
      <label><input type="checkbox" disabled/> I agree (preview only)</label>
    </div>:null}
    {node.kind==="video"?<p className="ats-preview-muted">
      {node.config.url?"Video media is configured; playback is disabled in this simulation.":
        "A video has not been configured yet."}</p>:null}
    {node.kind==="assessment"?<p className="ats-preview-muted">Assessment instructions are previewed here; no answers or scores are recorded.</p>:null}
    {node.kind==="interview_in_person"||node.kind==="interview_online"?
      <p className="ats-preview-muted">Interview details and booking will appear after scheduling is enabled.</p>:null}
    {provider?<p className="ats-preview-provider-note">
      Integration placeholder — no screening, signing, scheduling or provider requests are made in preview.
    </p>:null}
    {node.config.expectedMinutes?<p className="ats-preview-muted">Estimated time: {node.config.expectedMinutes} minutes</p>:null}
    {node.config.targetHours?<p className="ats-preview-muted">
      Target window: {node.config.targetHours} hours after assignment (not a confirmed deadline)</p>:null}
    <p className="ats-preview-muted">{node.required?"Required step":"Optional step"} · This step has not been completed.</p>
  </div>;
}

/** Candidate-safe read-only projection driven directly by the unsaved editor graph.
 * Intentionally no save, submit, calendar, Checkr or video API calls. */
export function CandidateJourneyLivePreview({
  name,graph,journey,choices,onChoice,onClose,onLocate,dirty,
}:Props){
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const visible=journey.steps;
  const selection=visible.find(step=>step.id===selectedId)??visible[0]??null;
  const index=selection?visible.findIndex(step=>step.id===selection.id):-1;
  const selectedNode=graph.nodes.find(node=>node.id===selection?.id);
  const stage=selectedNode?.stageId ? graph.stages?.find(s=>s.id===selectedNode.stageId&&s.candidateVisible) : null;
  const decisions=graph.nodes.filter(node=>node.kind==="decision");
  const total=visible.length;
  function navigate(delta:number) {
    const target=visible[index+delta];if(target)setSelectedId(target.id);
  }
  return <aside className="ats-candidate-live-preview" aria-label="Live candidate journey simulator">
    <div className="ats-candidate-preview-header">
      <div><p className="eyebrow">Live preview · Candidate view</p><h2>Candidate journey simulator</h2></div>
      <button type="button" className="button button-small button-ghost" onClick={onClose}
        aria-label="Close live candidate preview">Close</button>
    </div>
    <p className="ats-preview-status" role="status">
      <span aria-hidden="true" className="ats-preview-live-dot"/>
      {dirty?"Showing unsaved canvas changes":"Synced with canvas"} · No save or publish required
    </p>
    <div className="ats-preview-device">
      <div className="ats-preview-device-bar"><strong>TXKPRO</strong><span>Application progress</span></div>
      <div className="ats-preview-device-content">
        <p className="ats-preview-muted">Your hiring journey</p>
        <h3>{name.trim()||"Hiring pipeline"}</h3>
        <p className="ats-preview-progress-label">{total} visible step{total===1?"":"s"} · Planning preview</p>
        <ol className="ats-preview-progress-list" aria-label="Candidate journey steps">
          {visible.map((step,i)=>{
            const node=graph.nodes.find(n=>n.id===step.id);
            const colored=node?.stageId?graph.stages?.find(s=>s.id===node.stageId&&s.candidateVisible):null;
            return <li key={step.id}>
              <button type="button" className={selection?.id===step.id?"is-active":""}
                aria-current={selection?.id===step.id?"step":undefined}
                onClick={()=>setSelectedId(step.id)}>
                <span className="ats-preview-step-index" style={{borderColor:colored?.color}}>{i+1}</span>
                <span className="ats-preview-step-text"><strong>{step.label}</strong>
                  <small>{step.owner==="candidate"?"Action for you":"Waiting on employer"} · Not completed</small>
                </span>
              </button>
            </li>;
          })}
        </ol>
        {selection&&selectedNode?<section className="ats-preview-active-step" aria-label="Selected candidate step">
          {stage?<span className="ats-preview-stage" style={{borderLeftColor:stage.color}}>{stage.name}</span>:null}
          <p className="ats-preview-muted">Step {index+1} of {total}</p>
          <h4>{selection.label}</h4>
          {selection.owner==="employer"?<p className="ats-preview-muted">Your employer is responsible for this step. No action required from you.</p>:
            <CandidateContent node={selectedNode}/>}
          <div className="ats-preview-actions">
            <button type="button" className="button button-ghost" disabled={index<=0}
              onClick={()=>navigate(-1)}>Previous</button>
            <button type="button" className="button button-ghost" disabled={index>=total-1}
              onClick={()=>navigate(1)}>Next step</button>
            <button type="button" className="button button-ghost"
              onClick={()=>onLocate(selectedNode.id)}>Find on canvas</button>
          </div>
        </section>:<p className="ats-preview-muted">No candidate-visible steps on the currently connected path.</p>}
        {journey.awaitingDecision?<p className="ats-preview-muted" role="status">
          Waiting on a human decision before more steps become visible.</p>:null}
        {journey.diagnostics.length?<div className="ats-preview-diagnostics" role="status">
          <strong>Draft path not yet complete</strong>
          {journey.diagnostics.map((msg,i)=><p key={i}>{msg}</p>)}
        </div>:null}
      </div>
    </div>
    {decisions.length?<section className="ats-preview-scenarios" aria-label="Employer simulation controls">
      <h3>Test decision branches</h3>
      <p className="ats-preview-muted">These controls are for the employer preview only; candidates do not choose hiring outcomes.</p>
      {decisions.map(node=><label key={node.id}>{node.label}
        <select className="select" value={choices[node.id]??""}
          onChange={e=>onChoice(node.id,e.target.value ? e.target.value as "yes"|"no":undefined)}>
          <option value="">Await human decision</option>
          <option value="yes">Yes branch</option><option value="no">No branch</option>
        </select>
      </label>)}
    </section>:null}
    <p className="ats-preview-safety">Simulation only. No real applicant data, form submissions, provider actions, invitations or status changes.</p>
  </aside>;
}
