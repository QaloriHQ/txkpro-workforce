import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ATSPipelineEditor } from "@/components/employer/ats-pipeline-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerPipeline, listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import "../../pipeline-editor.css";

export const dynamic = "force-dynamic";
export default async function DedicatedPipelineEditorPage({ params }: { params: Promise<{pipelineId:string}> }) {
  const context = await requireEmployerContext({ approved: true });
  const { pipelineId } = await params;
  const [pipeline, library] = await Promise.all([
    getEmployerPipeline(context,pipelineId),
    listEmployerPipelines(context),
  ]);
  return <>
    <header className="topbar"><Brand/><EmployerWorkspaceNav active="pipeline"/><ThemeToggle/><SignOutButton/></header>
    <main className="page-wrap ats-pipeline-page ats-dedicated-editor-page">
      <div className="page-heading"><div><p className="eyebrow">Pipelines / {pipeline.name} / Edit</p>
        <h1>Workflow editor</h1><p className="card-sub">Draft changes do not affect previously published versions.</p></div>
        <Link href={`/employer/pipelines/${pipelineId}`} className="button button-ghost">Back to pipeline</Link>
      </div>
      <ATSPipelineEditor initialPipelines={[pipeline]}
        initialVersions={library.versions.filter(v=>v.templateId===pipelineId)}
        employerId={context.employerId} role={context.role} dedicated/>
    </main>
  </>;
}
