"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RecordHireForm({
  interviewRequestId,
  defaultRoleTitle,
  defaultTradeId,
}: {
  interviewRequestId: string;
  defaultRoleTitle: string;
  defaultTradeId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/placements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        interviewRequestId,
        roleTitle: String(form.get("roleTitle") ?? "").trim(),
        tradeId: String(form.get("tradeId") ?? "").trim() || null,
        hireDate: String(form.get("hireDate") ?? ""),
        employmentType: String(form.get("employmentType") ?? "").trim() || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(typeof body?.error === "string" ? body.error : "Unable to record hire.");
      return;
    }
    const placementId = body?.placement?.placementId;
    if (typeof placementId === "string" && placementId) {
      router.push(`/employer/placements/${encodeURIComponent(placementId)}`);
      router.refresh();
      return;
    }
    setMessage("Hire recorded.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <div className="callout">
        <strong>Human hiring decision</strong>
        Recording a hire creates the Placement outcome and exactly three retention milestones: Day 30, Day 60, and Day 90.
      </div>
      <label>
        <span>Role title</span>
        <input className="input" name="roleTitle" defaultValue={defaultRoleTitle} maxLength={200} required />
      </label>
      <label>
        <span>Trade</span>
        <input className="input" name="tradeId" defaultValue={defaultTradeId ?? ""} maxLength={120} />
      </label>
      <label>
        <span>Hire / start date</span>
        <input className="input" name="hireDate" type="date" required />
      </label>
      <label>
        <span>Employment type</span>
        <select className="select" name="employmentType" defaultValue="Full-time">
          <option>Full-time</option>
          <option>Part-time</option>
          <option>Apprenticeship</option>
          <option>Temporary</option>
          <option>Other</option>
        </select>
      </label>
      <div className="hero-actions" style={{ marginTop: 0 }}>
        <button className="button button-brand" type="submit" disabled={busy}>
          {busy ? "Recording…" : "Record Hire"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
