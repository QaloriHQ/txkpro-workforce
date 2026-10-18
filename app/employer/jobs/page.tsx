import { Brand } from "@/components/brand";
import { JobListingEditor } from "@/components/employer/job-listing-editor";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerJobs } from "@/lib/employer/job-listings-repository";
import { listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";

export const dynamic = "force-dynamic";

export default async function EmployerJobsPage() {
  const context = await requireEmployerContext({ approved: true });
  const [jobs, pipelineLibrary] = await Promise.all([
    listEmployerJobs(context), listEmployerPipelines(context),
  ]);
  return <>
    <header className="topbar">
      <Brand /><EmployerWorkspaceNav active="jobs" /><ThemeToggle /><SignOutButton />
    </header>
    <main className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employer · ATS-02</p>
          <h1>Job listings</h1>
          <p className="card-sub">Build listings and templates, assign an immutable hiring pipeline, and publish securely.</p>
        </div>
        <span className="pill pill-neutral">{jobs.length} listings</span>
      </div>
      <div className="callout" style={{ marginBottom: 18 }}>
        <strong>Publishing available.</strong> Choose a previously published hiring pipeline version before publishing a complete job. Public application submission launches in ATS-03.
      </div>
      <JobListingEditor initialJobs={jobs} initialPipelines={pipelineLibrary.pipelines}
        initialVersions={pipelineLibrary.versions} employerId={context.employerId}
        role={context.role} legacyUserId={context.legacyUserId} />
    </main>
  </>;
}
