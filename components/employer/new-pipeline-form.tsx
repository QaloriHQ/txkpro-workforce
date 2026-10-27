"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STARTER_PIPELINE, isPipelineConfigurator, type PipelineGraph } from "@/lib/employer/ats-pipelines";
import type { EmployerRole } from "@/lib/employer/types";

const BLANK:PipelineGraph = {
 schemaVersion:1, entryNodeId:"start",
 nodes:[
   {id:"start",kind:"start",label:"Start",x:60,y:120,required:true,candidateVisible:false,config:{}},
   {id:"complete",kind:"end",label:"Complete",x:440,y:120,required:true,candidateVisible:true,config:{}},
 ],edges:[{id:"e1",source:"start",target:"complete"}],
};
export function NewPipelineForm({employerId,role}:{employerId:string;role:EmployerRole}){
 const router=useRouter();
 const [name,setName]=useState("");const [description,setDescription]=useState("");
 const [template,setTemplate]=useState<"starter"|"blank">("starter");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 if(!isPipelineConfigurator(role))return <div className="card">Your role does not permit creating pipelines.</div>;
 async function create(e:React.FormEvent){
   e.preventDefault();if(busy)return;setBusy(true);setError("");
   try{
     const response=await fetch("/api/employer/pipelines?employerId="+encodeURIComponent(employerId),{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({name,description,graph:template==="blank"?BLANK:STARTER_PIPELINE}),
     });
     const data=await response.json() as {pipeline?:{id:string};error?:string};
     if(!response.ok||!data.pipeline)throw new Error(data.error??"Unable to create pipeline");
     router.replace("/employer/pipelines/"+data.pipeline.id+"/edit");
   }catch(err){setError(err instanceof Error?err.message:"Unable to create pipeline");setBusy(false);}
 }
 return <form className="card ats-create-pipeline" onSubmit={e=>void create(e)}>
   <label>Pipeline name<input className="input" required minLength={3} maxLength={140}
     value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Apprentice Electrician Hiring"/></label>
   <label>Description (optional)<textarea className="textarea" maxLength={600} rows={3}
     value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this hiring workflow for?"/></label>
   <fieldset className="ats-create-template-choice"><legend>Starting template</legend>
     <label><input type="radio" name="template" checked={template==="starter"} onChange={()=>setTemplate("starter")}/>
       Standard hiring — application, review, complete</label>
     <label><input type="radio" name="template" checked={template==="blank"} onChange={()=>setTemplate("blank")}/>
       Blank — protected Start and End nodes</label>
   </fieldset>
   {error?<p className="ats-pipeline-validation" role="alert">{error}</p>:null}
   <div className="ats-create-actions"><Link href="/employer/pipelines" className="button button-ghost">Cancel</Link>
     <button className="button button-dark" disabled={busy||name.trim().length<3} type="submit">
       {busy?"Creating…":"Create and open editor"}</button></div>
 </form>;
}
