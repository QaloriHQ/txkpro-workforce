"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PipelineTemplateSummary, PipelineVersionSummary, PipelineGraph } from "@/lib/employer/ats-pipelines";

type View="kanban"|"list"|"grid";
const allowed:View[]=["kanban","list","grid"];
function currentGraph(pipeline:PipelineTemplateSummary, version?:PipelineVersionSummary):PipelineGraph{
 return version?.graph??pipeline.graph;
}
export function PipelineDashboard({pipeline,versions,linkedJobs,employerId}:{
 pipeline:PipelineTemplateSummary;versions:PipelineVersionSummary[];linkedJobs:number;employerId:string;
}){
 const latest=versions.slice().sort((a,b)=>b.versionNumber-a.versionNumber)[0];
 const [view,setView]=useState<View>("kanban");
 const [loaded,setLoaded]=useState(false);
 const prefKey="txkpro:pipeline-view:"+employerId+":"+pipeline.id;
 useEffect(()=>{
   try{const saved=window.localStorage.getItem(prefKey) as View|null;if(saved&&allowed.includes(saved))setView(saved);}catch{}
   setLoaded(true);
 },[prefKey]);
 function updateView(v:View){setView(v);try{window.localStorage.setItem(prefKey,v);}catch{}}
 const graph=currentGraph(pipeline,latest);
 const nodes=graph.nodes.filter(n=>n.kind!=="start"&&n.kind!=="end");
 const ordered=nodes.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
 const stages=graph.schemaVersion===2&&graph.stages?.length
   ? graph.stages.slice().sort((a,b)=>a.sortOrder-b.sortOrder).map(stage=>({
       id:stage.id,name:stage.name,color:stage.color,
       components:ordered.filter(node=>node.stageId===stage.id),
     }))
   : ordered.map((node,index)=>({
       id:node.id,name:node.label,color:"#5A95DC",
       components:[node],
     }));
 return <div className="ats-pipeline-dashboard">
   <div className="ats-dashboard-metrics">
     <div className="card"><strong>{linkedJobs}</strong><span>Linked job listings</span></div>
     <div className="card"><strong>{latest?"v"+latest.versionNumber:"Draft"}</strong><span>Latest version</span></div>
     <div className="card"><strong>{nodes.length}</strong><span>Workflow components</span></div>
   </div>
   <div className="card ats-dashboard-pending" role="status">
     <strong>Candidate analytics start with ATS-03.</strong>
     <p className="card-sub">Applications, conversion rates and stage counts will appear when the application workflow is enabled. The view below shows workflow definitions, not candidate records.</p>
   </div>
   <div className="card ats-dashboard-workflow">
     <div className="ats-dashboard-workflow-header">
       <div><h2>Workflow stages</h2>
         <p className="card-sub">{latest?"Published Version "+latest.versionNumber:"Unpublished draft"} · Your selected view is saved for this pipeline.</p>
       </div>
       <div className="ats-dashboard-view" role="group" aria-label="Default pipeline view">
         {allowed.map(v=><button type="button" key={v} aria-pressed={view===v}
           className={"button button-small "+(view===v?"button-dark":"button-ghost")}
           onClick={()=>updateView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}
       </div>
     </div>
     {loaded && view==="kanban"?<div className="ats-stage-board" aria-label="Kanban workflow stages">
       {stages.map((stage,i)=><article key={stage.id} className="ats-stage-column" style={{borderTop:"4px solid "+stage.color}}>
         <div className="ats-stage-heading"><span className="ats-stage-number">{i+1}</span>
           <strong>{stage.name}</strong></div>
         <p className="card-sub">{stage.components.length} components</p>
         <ul>{stage.components.map(node=><li key={node.id}>{node.label}</li>)}</ul>
       </article>)}
     </div>:null}
     {loaded && view==="list"?<ol className="ats-dashboard-list">
       {stages.map(stage=><li key={stage.id} style={{borderLeft:"4px solid "+stage.color,paddingLeft:12}}>
         <strong>{stage.name}</strong><small>{stage.components.map(n=>n.label).join(" · ")||"No steps assigned"}</small>
       </li>)}
     </ol>:null}
     {loaded && view==="grid"?<div className="ats-dashboard-grid">
       {stages.map(stage=><article className="card" key={stage.id} style={{borderTop:"4px solid "+stage.color}}>
         <strong>{stage.name}</strong><p className="card-sub">{stage.components.length} components</p>
         <small>{stage.components.map(n=>n.label).join(" · ")||"No steps assigned"}</small></article>)}
     </div>:null}
     {!nodes.length?<p className="card-sub">No workflow steps configured yet.</p>:null}
     <div className="ats-dashboard-version-links">
       <Link className="button button-ghost" href={`/employer/pipelines/${pipeline.id}/edit`}>Edit current draft</Link>
       {latest?<Link className="button button-ghost" href={`/employer/pipelines/${pipeline.id}/versions/${latest.versionNumber}`}>View immutable Version {latest.versionNumber}</Link>:null}
     </div>
   </div>
   <section className="card">
     <h2>Version history</h2>
     {versions.length?<ul className="ats-dashboard-versions">{versions.slice().sort((a,b)=>b.versionNumber-a.versionNumber).map(v=><li key={v.id}>
       <span>Version {v.versionNumber} · Published {new Date(v.publishedAt).toLocaleDateString()}</span>
       <Link href={`/employer/pipelines/${pipeline.id}/versions/${v.versionNumber}`}>View</Link>
     </li>)}</ul>:<p className="card-sub">No published versions yet. Publish your first validated workflow from the editor.</p>}
   </section>
 </div>;
}
