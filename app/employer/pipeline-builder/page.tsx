import Link from "next/link";
import "./pipeline-editor-enhancements.css";
import "./pipeline-simulator.css";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ATSPipelineEditor } from "@/components/employer/ats-pipeline-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";

export const dynamic = "force-dynamic";
export default async function EmployerPipelineBuilderPage() {
  const context = await requireEmployerContext({ approved: true });
  const { pipelines, versions } = await listEmployerPipelines(context);
  return <>
    <header className="topbar"><Brand /><EmployerWorkspaceNav active="pipeline-builder" /><ThemeToggle /><SignOutButton /></header>
    <main className="page-wrap ats-pipeline-page">
      <div className="page-heading">
        <div><p className="eyebrow">Employer · ATS-02</p><h1>Pipeline editor</h1>
          <p className="card-sub">Build reusable hiring workflows, connect steps and publish immutable versions.</p>
        </div>
        <Link className="button button-ghost" href="/employer/jobs">Job listings</Link>
      </div>
      <div className="callout" style={{ marginBottom: 16 }}>
        <strong>Version-safe workflows.</strong> Published versions never change. Existing candidate progress will stay on its original version when applications launch in ATS-03. Provider components remain disabled until approved integrations.
      </div>
      <ATSPipelineEditor initialPipelines={pipelines} initialVersions={versions} employerId={context.employerId} role={context.role} />
    </main>
  </>;
}
