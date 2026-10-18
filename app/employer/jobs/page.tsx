import { Brand } from "@/components/brand";
import { JobListingEditor } from "@/components/employer/job-listing-editor";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerJobs } from "@/lib/employer/job-listings-repository";

export const dynamic = "force-dynamic";

export default async function EmployerJobsPage() {
  const context = await requireEmployerContext({ approved: true });
  const jobs = await listEmployerJobs(context);
  return <>
    <header className="topbar">
      <Brand /><EmployerWorkspaceNav active="jobs" /><ThemeToggle /><SignOutButton />
    </header>
    <main className="page-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employer · ATS-01</p>
          <h1>Job listings</h1>
          <p className="card-sub">Build, preview, duplicate, and save private job postings or reusable templates.</p>
        </div>
        <span className="pill pill-neutral">{jobs.length} listings</span>
      </div>
      <div className="callout" style={{ marginBottom: 18 }}>
        <strong>Draft release.</strong> ATS-01 keeps all listings private. Public posting requires
        an approved, immutable pipeline version from ATS-02.
      </div>
      <JobListingEditor initialJobs={jobs} employerId={context.employerId}
        role={context.role} legacyUserId={context.legacyUserId} />
    </main>
  </>;
}
