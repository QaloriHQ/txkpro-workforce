import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import { PipelineDirectory } from "@/components/employer/pipeline-directory";

export const dynamic = "force-dynamic";
export default async function PipelinesDirectoryPage() {
  const context = await requireEmployerContext({ approved: true });
  const { pipelines, versions } = await listEmployerPipelines(context);
  return <>
    <header className="topbar"><Brand/><EmployerWorkspaceNav active="pipeline"/><ThemeToggle/><SignOutButton/></header>
    <main className="page-wrap ats-pipelines-directory">
      <div className="page-heading"><div><p className="eyebrow">Employer · Talent &amp; Hiring</p>
        <h1>Pipelines</h1><p className="card-sub">Manage reusable hiring workflows and published versions.</p>
      </div></div>
      <PipelineDirectory initialPipelines={pipelines} versions={versions} employerId={context.employerId} role={context.role}/>
    </main>
  </>;
}
