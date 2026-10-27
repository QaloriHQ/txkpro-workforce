import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PipelineDashboard } from "@/components/employer/pipeline-dashboard";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerPipeline, listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import { listEmployerJobs } from "@/lib/employer/job-listings-repository";
import "../pipeline-editor.css";

export const dynamic="force-dynamic";
export default async function PipelineDetailPage({params}:{params:Promise<{pipelineId:string}>}){
 const context=await requireEmployerContext({approved:true});
 const {pipelineId}=await params;
 const [pipeline,library,jobs]=await Promise.all([
   getEmployerPipeline(context,pipelineId),listEmployerPipelines(context),listEmployerJobs(context)
 ]);
 const versions=library.versions.filter(v=>v.templateId===pipelineId);
 const versionIds=new Set(versions.map(v=>v.id));
 const linkedJobs=jobs.filter(job=>job.pipelineVersionId&&versionIds.has(job.pipelineVersionId)).length;
 return <>
   <header className="topbar"><Brand/><EmployerWorkspaceNav active="pipeline"/><ThemeToggle/><SignOutButton/></header>
   <main className="page-wrap ats-pipeline-detail">
     <div className="page-heading"><div><p className="eyebrow"><Link href="/employer/pipelines">Pipelines</Link> / Overview</p>
       <h1>{pipeline.name}</h1><p className="card-sub">{pipeline.description||"Hiring workflow"}</p>
     </div><Link className="button button-dark" href={`/employer/pipelines/${pipelineId}/edit`}>Edit workflow</Link></div>
     <PipelineDashboard pipeline={pipeline} versions={versions} linkedJobs={linkedJobs} employerId={context.employerId}/>
   </main>
 </>;
}
