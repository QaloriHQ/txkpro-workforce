"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobEditableFields, JobListing } from "@/lib/employer/job-listings";
export function JobDraftStarter({ employerId, fields }: { employerId: string; fields: JobEditableFields }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function create() { setBusy(true); setError(""); try { const response = await fetch(`/api/employer/jobs?employerId=${encodeURIComponent(employerId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }); const body = await response.json() as { job?: JobListing; error?: string }; if (!response.ok || !body.job) throw new Error(body.error || "Could not create draft"); router.push(`/employer/jobs/${body.job.id}/edit`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create draft"); setBusy(false); } }
  return <section className="card job-start-card"><p className="eyebrow">Private draft</p><h2>{fields.title || "Create a job from scratch"}</h2><p>{fields.summary || "Start with an empty, private listing and complete it in Guided Setup or the Advanced Editor."}</p><p className="card-sub">Nothing is published or assigned until you explicitly review and publish it.</p><button className="button button-brand" type="button" disabled={busy} onClick={() => void create()}>{busy ? "Creating draft…" : "Create private draft"}</button>{error ? <div className="callout" role="alert">{error}</div> : null}</section>;
}
