import Link from "next/link";
import { ArrowLeftIcon, ChartBarIcon, ClipboardDocumentListIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { ButtonLink, MetricCard, StatusBadge } from "@/components/design-system/primitives";
import { JobAssignmentEditor } from "@/components/employer/job-assignment-editor";
import { JobsShell } from "@/components/employer/jobs-shell";
import { JobStatusActions } from "@/components/employer/job-status-actions";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import { canEditJob, canManageJobStatus } from "@/lib/employer/job-listings";
import { getEmployerJob } from "@/lib/employer/job-listings-repository";
import { getJobWorkspaceAssignments } from "@/lib/employer/job-workspace";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export default async function EmployerJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const context = await requireEmployerContext({ approved: true });
  const { jobId } = await params;
  const [job, pipelineLibrary, assignments] = await Promise.all([
    getEmployerJob(context, jobId), listEmployerPipelines(context), getJobWorkspaceAssignments(context.employerId, jobId),
  ]);
  const version = pipelineLibrary.versions.find((item) => item.id === job.pipelineVersionId);
  const pipeline = version ? pipelineLibrary.pipelines.find((item) => item.id === version.templateId) : null;
  const canEdit = canEditJob(context.role, context.legacyUserId, job.assignedHiringManagerUserId) && job.status === "draft";
  const completeFields = [job.title, job.summary, job.description, job.remotePolicy === "remote" ? "remote" : job.locationCity, job.remotePolicy === "remote" ? "remote" : job.locationState, job.shiftText, job.requirements.length ? "requirements" : "", job.skills.length ? "skills" : "", job.applicationInstructions].filter(Boolean).length;
  const statusTone = job.status === "published" ? "success" : job.status === "paused" ? "warning" : job.status === "draft" ? "info" : "neutral";
  return <JobsShell>
    <Link className="back-link" href="/employer/jobs"><ArrowLeftIcon width={17} /> All job listings</Link>
    <div className="job-detail-heading"><div><div className="job-detail-status"><StatusBadge tone={statusTone}>{label(job.status)}</StatusBadge><span>{job.jobListingId}</span></div><h1>{job.title || "Untitled job"}</h1><p>{job.summary || "Add an applicant-facing summary in the editor."}</p></div><div className="job-actions">{canEdit ? <ButtonLink tone="primary" href={`/employer/jobs/${job.id}/edit`}><PencilSquareIcon aria-hidden="true" /> Edit job</ButtonLink> : null}{job.status === "published" ? <ButtonLink tone="secondary" href={`/jobs/${job.jobListingId}`}>View public listing</ButtonLink> : null}</div></div>
    <JobStatusActions job={job} canManage={canManageJobStatus(context.role)} />
    <nav className="job-detail-nav" aria-label="Job workspace sections"><a href="#overview">Overview</a><a href="#people">People</a><a href="#rules">Rules</a><a href="#applications">Applications</a><a href="#pipeline">Pipeline</a><a href="#analytics">Analytics</a><a href="#activity">Activity</a></nav>
    <section className="job-detail-metrics" id="overview"><MetricCard label="Applications" value="—" detail="ATS-03 intake pending" /><MetricCard label="Pipeline" value={version ? `v${version.versionNumber}` : "Not assigned"} detail={pipeline?.name ?? "Required before publication"} /><MetricCard label="Hiring team" value={assignments.hiringTeamUserIds.length} detail={`${assignments.crewIds.length} operational crews`} /><MetricCard label="Listing readiness" value={`${completeFields}/9`} detail="Core content groups complete" /></section>
    <div className="job-detail-grid">
      <JobAssignmentEditor employerId={context.employerId} jobId={job.id} initial={assignments} />
      <section className="card" id="rules"><p className="eyebrow">Published terms</p><h2>Listing rules and requirements</h2><dl className="job-rule-list"><div><dt>Workplace</dt><dd>{label(job.remotePolicy)}</dd></div><div><dt>Employment</dt><dd>{label(job.employmentType)}</dd></div><div><dt>Location</dt><dd>{[job.locationCity, job.locationState].filter(Boolean).join(", ") || "Not set"}</dd></div><div><dt>Pay</dt><dd>{job.payMin !== null || job.payMax !== null ? `${job.payMin ?? "—"}–${job.payMax ?? "—"} / ${job.payPeriod}` : "Not disclosed"}</dd></div><div><dt>Schedule</dt><dd>{job.shiftText || "Not set"}</dd></div></dl><h3>Qualifications</h3>{job.requirements.length ? <ul>{job.requirements.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="card-sub">No qualifications added.</p>}<h3>Skills</h3>{job.skills.length ? <ul>{job.skills.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="card-sub">No skills added.</p>}<h3>Benefits</h3>{job.benefits.length ? <ul>{job.benefits.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="card-sub">No benefits added.</p>}</section>
      <section className="card" id="applications"><ClipboardDocumentListIcon width={28} aria-hidden="true" /><p className="eyebrow">Candidate intake</p><h2>Applications</h2><div className="empty"><strong>No application workspace yet</strong><p>ATS-03 will add registered Student and external-applicant intake, application records, candidate progress, and scoped hiring views. This page does not fabricate counts before that canonical source exists.</p></div></section>
      <section className="card" id="pipeline"><p className="eyebrow">Hiring workflow</p><h2>Assigned pipeline</h2>{version && pipeline ? <><h3>{pipeline.name}</h3><p>{pipeline.description || "Versioned employer hiring workflow."}</p><p><strong>Immutable version:</strong> {version.versionNumber}</p><p><strong>Published:</strong> {new Date(version.publishedAt).toLocaleString()}</p><Link href={`/employer/pipelines/${pipeline.id}`} className="link">Open pipeline definition</Link></> : <div className="empty"><strong>No published pipeline assigned</strong><p>Owner/Admin chooses an immutable published pipeline when the draft is published.</p><ButtonLink tone="secondary" href="/employer/pipeline-builder">Open pipeline builder</ButtonLink></div>}</section>
      <section className="card" id="analytics"><ChartBarIcon width={28} aria-hidden="true" /><p className="eyebrow">Listing analytics</p><h2>Performance and readiness</h2><div className="job-analytics-placeholder"><p><strong>Content readiness:</strong> {completeFields} of 9 core groups</p><p><strong>Pipeline coverage:</strong> {version ? "Assigned" : "Missing"}</p><p><strong>Last updated:</strong> {new Date(job.updatedAt).toLocaleString()}</p></div><p className="card-sub">Views, starts, completions, source attribution, and conversion rates will appear only after canonical ATS-03 application and analytics events exist.</p></section>
      <section className="card" id="activity"><p className="eyebrow">Audit-friendly history</p><h2>Activity</h2><ol className="job-activity"><li><strong>Listing created</strong><span>{new Date(job.createdAt).toLocaleString()}</span></li>{job.publishedAt ? <li><strong>Published</strong><span>{new Date(job.publishedAt).toLocaleString()}</span></li> : null}<li><strong>Last updated</strong><span>{new Date(job.updatedAt).toLocaleString()} · revision {job.revision}</span></li></ol><p className="card-sub">Sensitive audit actors remain in the private security ledger and are not exposed here.</p></section>
    </div>
  </JobsShell>;
}
