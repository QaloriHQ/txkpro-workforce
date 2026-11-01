"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobEditableFields, JobListing } from "@/lib/employer/job-listings";
import { JOB_TEMPLATE_LEVELS, type JobTemplate } from "@/lib/employer/job-templates";

const LABELS = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
} as const;

function formatPay(fields: JobEditableFields) {
  if (fields.payMin === null && fields.payMax === null) return "Not disclosed";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const range = fields.payMin !== null && fields.payMax !== null
    ? `${money.format(fields.payMin)}–${money.format(fields.payMax)}`
    : money.format(fields.payMin ?? fields.payMax ?? 0);
  return `${range} per ${fields.payPeriod}`;
}

export function JobDraftStarter({ employerId, employerName, fields, template }: { employerId: string; employerName: string; fields: JobEditableFields; template?: JobTemplate | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function create() { setBusy(true); setError(""); try { const response = await fetch(`/api/employer/jobs?employerId=${encodeURIComponent(employerId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }); const body = await response.json() as { job?: JobListing; error?: string }; if (!response.ok || !body.job) throw new Error(body.error || "Could not create draft"); router.push(`/employer/jobs/${body.job.id}/edit`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create draft"); setBusy(false); } }
  if (!template) return <section className="card job-start-card"><p className="eyebrow">Private draft</p><h2>{fields.title || "Create a job from scratch"}</h2><p>{fields.summary || "Start with an empty, private listing and complete it in Guided Setup or the Advanced Editor."}</p><p className="card-sub">Nothing is published or assigned until you explicitly review and publish it.</p><button className="button button-brand" type="button" disabled={busy} onClick={() => void create()}>{busy ? "Creating draft…" : "Create private draft"}</button>{error ? <div className="callout" role="alert">{error}</div> : null}</section>;

  return <div className="job-template-create">
    <section className="card job-template-create-action">
      <div><p className="eyebrow">Private draft</p><h2>{fields.title}</h2><p className="card-sub">{template.trade} · {JOB_TEMPLATE_LEVELS[template.level]}</p></div>
      <div className="callout"><strong>Review before publishing.</strong> Pay, schedule, benefits, credentials, location, travel, and on-call expectations are editable defaults—not employer commitments until you confirm them.</div>
      <button className="button button-brand" type="button" disabled={busy} onClick={() => void create()}>{busy ? "Creating draft…" : "Create private draft"}</button>
      <p className="card-sub">Nothing is published or assigned until you explicitly review and publish it.</p>
      {error ? <div className="callout" role="alert">{error}</div> : null}
    </section>

    <section className="card job-published-preview" aria-labelledby="published-preview-title">
      <div className="job-preview-heading"><div><p className="eyebrow">Published job preview</p><p className="job-preview-employer">{employerName}</p><h2 id="published-preview-title">{fields.title}</h2></div><span className="pill pill-neutral">Candidate view</span></div>
      <p className="job-preview-meta">{[fields.locationCity, fields.locationState].filter(Boolean).join(", ")} · {LABELS[fields.remotePolicy]} · {LABELS[fields.employmentType]}</p>
      <strong className="job-preview-summary">{fields.summary}</strong>
      <dl className="job-preview-facts"><div><dt>Compensation</dt><dd>{formatPay(fields)}</dd></div><div><dt>Schedule</dt><dd>{fields.shiftText}</dd></div></dl>
      <section><h3>About this role</h3><p className="job-preview-description">{template.overview}</p></section>
      <section><h3>Responsibilities</h3><ul>{template.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h3>Requirements</h3><ul>{fields.requirements.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h3>Skills</h3><ul>{fields.skills.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h3>Benefits</h3><ul>{fields.benefits.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <p className="card-sub">Applications become available after the ATS application workflow launches.</p>
    </section>

    <section className="card job-template-review-fields">
      <div><p className="eyebrow">Draft fields to review</p><h2>Application and screening guidance</h2></div>
      <section><h3>Applicant instructions</h3><p>{fields.applicationInstructions}</p></section>
      <section className="job-preview-screening"><h3>Candidate-review safeguards</h3><ul>{template.screening.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <p className="card-sub">These fields remain in the private draft for employer review. Applicant instructions are not part of the current public projection until the ATS-03 application experience launches.</p>
    </section>
  </div>;
}
