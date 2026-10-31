import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { JobListingEditor } from "@/components/employer/job-listing-editor";
import { JobsShell } from "@/components/employer/jobs-shell";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerJob } from "@/lib/employer/job-listings-repository";
import { listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
export const dynamic = "force-dynamic";
export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const context = await requireEmployerContext({ approved: true }); const { jobId } = await params;
  const [job, pipelines] = await Promise.all([getEmployerJob(context, jobId), listEmployerPipelines(context)]);
  return <JobsShell><Link className="back-link" href={`/employer/jobs/${job.id}`}><ArrowLeftIcon width={17} /> Job workspace</Link><div className="page-heading"><div><p className="eyebrow">Job editor</p><h1>{job.title || "Untitled job"}</h1></div></div><JobListingEditor initialJobs={[job]} initialSelectedId={job.id} initialPipelines={pipelines.pipelines} initialVersions={pipelines.versions} employerId={context.employerId} role={context.role} legacyUserId={context.legacyUserId} /></JobsShell>;
}
