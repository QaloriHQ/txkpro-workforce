import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { NewPipelineForm } from "@/components/employer/new-pipeline-form";

export const dynamic = "force-dynamic";
export default async function NewPipelinePage() {
  const context = await requireEmployerContext({ approved: true });
  return <>
    <header className="topbar"><Brand/><EmployerWorkspaceNav active="pipeline"/><ThemeToggle/><SignOutButton/></header>
    <main className="page-wrap"><div className="page-heading"><div><p className="eyebrow">Pipelines / New</p>
    <h1>Create hiring pipeline</h1><p className="card-sub">Start with a template or a blank workflow. Nothing is published until you approve a version.</p>
    </div></div>
    <NewPipelineForm employerId={context.employerId} role={context.role}/>
    </main>
  </>;
}
