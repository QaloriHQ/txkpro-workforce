import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { JobDraftStarter } from "@/components/employer/job-draft-starter";
import { JobsShell } from "@/components/employer/jobs-shell";
import { requireEmployerContext } from "@/lib/employer/auth";
import { BLANK_JOB, canCreateJob } from "@/lib/employer/job-listings";
import { getJobTemplate } from "@/lib/employer/job-templates";
export const dynamic = "force-dynamic";
export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const context = await requireEmployerContext({ approved: true });
  if (!canCreateJob(context.role)) throw new Response("This employer role cannot create job listings", { status: 403 });
  const template = getJobTemplate((await searchParams).template);
  return <JobsShell><div className="job-narrow-page"><Link className="back-link" href={template ? "/employer/jobs/templates" : "/employer/jobs"}><ArrowLeftIcon width={17} /> {template ? "All templates" : "All job listings"}</Link><div className="page-heading"><div><p className="eyebrow">Create job</p><h1>{template ? "Use a skilled-trade template" : "Start a new listing"}</h1>{template ? <p className="card-sub">Review every prefilled field as candidates will see it, then create a private draft to customize.</p> : null}</div></div><JobDraftStarter employerId={context.employerId} employerName={context.employerName} fields={template ? template.fields : BLANK_JOB} template={template} /></div></JobsShell>;
}
