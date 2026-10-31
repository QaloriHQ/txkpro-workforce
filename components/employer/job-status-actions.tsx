"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobListing } from "@/lib/employer/job-listings";

export function JobStatusActions({ job, canManage }: { job: JobListing; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actions = job.status === "published" ? [["pause", "Pause"], ["close", "Close"]] : job.status === "paused" ? [["resume", "Resume"], ["close", "Close"]] : job.status === "closed" ? [["archive", "Archive"]] : job.status === "draft" ? [["archive", "Archive draft"]] : [];
  async function act(action: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/employer/jobs/${encodeURIComponent(job.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: job.revision, action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update listing status");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update listing status"); setBusy(false); }
  }
  if (!canManage || !actions.length) return null;
  return <div className="job-status-actions">{actions.map(([id, label]) => <button className="txk-button txk-button-secondary txk-button-md" type="button" key={id} disabled={busy} onClick={() => void act(id)}>{busy ? "Updating…" : label}</button>)}{message ? <span role="alert">{message}</span> : null}</div>;
}
