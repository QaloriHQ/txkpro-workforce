import { JobsShell } from "@/components/employer/jobs-shell";
import { JobGallery } from "@/components/employer/job-gallery";
import { requireEmployerContext } from "@/lib/employer/auth";
import { canCreateJob } from "@/lib/employer/job-listings";
import { listEmployerJobs } from "@/lib/employer/job-listings-repository";

export const dynamic = "force-dynamic";

export default async function EmployerJobsPage() {
  const context = await requireEmployerContext({ approved: true });
  const jobs = await listEmployerJobs(context);
  return <JobsShell><JobGallery jobs={jobs} canCreate={canCreateJob(context.role)} /></JobsShell>;
}
