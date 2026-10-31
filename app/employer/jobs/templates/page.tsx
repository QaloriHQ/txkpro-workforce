import { Brand } from "@/components/brand";
import { ButtonLink, PageHeader } from "@/components/design-system/primitives";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { JobTemplateGallery } from "@/components/employer/job-template-gallery";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { canCreateJob } from "@/lib/employer/job-listings";
import { JOB_TEMPLATES } from "@/lib/employer/job-templates";

export const dynamic = "force-dynamic";

export default async function EmployerJobTemplatesPage() {
  const context = await requireEmployerContext({ approved: true });
  return <>
    <header className="topbar"><Brand /><EmployerWorkspaceNav active="jobs" /><ThemeToggle /><SignOutButton /></header>
    <main className="page-wrap job-template-page">
      <PageHeader eyebrow="Employer · Job listings" title="Skilled-trade job templates"
        description="Preview 36 complete starting points across 12 trade families and three experience levels."
        actions={<ButtonLink tone="secondary" href="/employer/jobs">Back to job listings</ButtonLink>} />
      <JobTemplateGallery templates={JOB_TEMPLATES} employerId={context.employerId} canCreate={canCreateJob(context.role)} />
    </main>
  </>;
}
