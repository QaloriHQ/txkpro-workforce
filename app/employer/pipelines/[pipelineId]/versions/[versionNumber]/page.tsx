import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerPipeline, listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import { isPipelineConfigurator } from "@/lib/employer/ats-pipelines";
import { RestorePipelineVersion } from "@/components/employer/restore-pipeline-version";
import "../../../pipeline-editor.css";

export const dynamic="force-dynamic";
export default async function ReadOnlyPipelineVersionPage({params}:{
 params:Promise<{pipelineId:string;versionNumber:string}>
}){
 const context=await requireEmployerContext({approved:true});
 const {pipelineId,versionNumber}=await params;
 if(!/^[1-9][0-9]{0,6}$/.test(versionNumber))notFound();
 const [pipeline,library]=await Promise.all([getEmployerPipeline(context,pipelineId),listEmployerPipelines(context)]);
 const version=library.versions.find(v=>v.templateId===pipelineId&&v.versionNumber===Number(versionNumber));
 if(!version)notFound();
 return <>
   <header className="topbar"><Brand/><EmployerWorkspaceNav active="pipeline"/><ThemeToggle/><SignOutButton/></header>
   <main className="page-wrap ats-version-view">
     <div className="page-heading"><div><p className="eyebrow"><Link href={`/employer/pipelines/${pipelineId}`}>Pipeline</Link> / Version {version.versionNumber}</p>
       <h1>{pipeline.name} · v{version.versionNumber}</h1>
       <p className="card-sub">Published {new Date(version.publishedAt).toLocaleString()} · Read-only immutable snapshot</p>
     </div><div className="ats-version-header-actions">
       <Link className="button button-ghost" href={`/employer/pipelines/${pipelineId}`}>Back to pipeline</Link>
       {isPipelineConfigurator(context.role)?<RestorePipelineVersion
         pipelineId={pipelineId} employerId={context.employerId} revision={pipeline.revision}
         name={pipeline.name} description={pipeline.description} versionNumber={version.versionNumber}
         graph={version.graph}/>:null}
     </div></div>
     <section className="card"><h2>Published workflow</h2><p className="card-sub">These component definitions cannot be edited. Restoring a historical design must create a new draft revision before publication.</p>
       {version.graph.schemaVersion===2 && version.graph.stages?.length ? <div className="ats-version-stage-key" aria-label="Published stage assignments">
         {version.graph.stages.slice().sort((a,b)=>a.sortOrder-b.sortOrder).map(stage=>
           <span className="ats-version-stage-label" key={stage.id} style={{borderColor:stage.color}}>
             {stage.name}
           </span>)}
       </div>:null}
       <ol className="ats-version-steps">
         {version.graph.nodes.map(n=><li key={n.id}><strong>{n.label}</strong>
           <span>{n.kind.replaceAll("_"," ")}</span>
           {n.stageId&&version.graph.stages?.some(stage=>stage.id===n.stageId)?
             <small>Stage: {version.graph.stages.find(stage=>stage.id===n.stageId)?.name}</small>:null}
           <small>{n.required?"Required":"Optional"} · {n.candidateVisible?"Candidate-visible":"Internal"}</small>
         </li>)}
       </ol>
     </section>
   </main>
 </>;
}
