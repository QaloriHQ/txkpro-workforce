"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function InterviewScheduleForm({
  interviewRequestId,
  defaultScheduledFor,
  defaultFormat,
  defaultLocation,
}: {
  interviewRequestId: string;
  defaultScheduledFor?: string | null;
  defaultFormat?: string | null;
  defaultLocation?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const localDefault = defaultScheduledFor
    ? new Date(defaultScheduledFor).toISOString().slice(0, 16)
    : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const rawDate = String(form.get("scheduledFor") ?? "");
    const format = String(form.get("format") ?? "");
    const locationDetail = String(form.get("locationDetail") ?? "").trim();
    if (!rawDate || !format) return;

    setBusy(true);
    setMessage("");
    const response = await fetch(
      `/api/interviews/${encodeURIComponent(interviewRequestId)}/status`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          scheduledFor: new Date(rawDate).toISOString(),
          format,
          locationDetail: locationDetail || null,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(typeof body?.error === "string" ? body.error : "Unable to schedule interview.");
      return;
    }
    setMessage("Interview scheduled.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        <span>Date and time</span>
        <input className="input" type="datetime-local" name="scheduledFor" defaultValue={localDefault} required />
      </label>
      <label>
        <span>Format</span>
        <select className="select" name="format" defaultValue={defaultFormat ?? "In person"}>
          <option>In person</option>
          <option>Phone</option>
          <option>Video</option>
        </select>
      </label>
      <label>
        <span>Location / meeting detail</span>
        <input className="input" name="locationDetail" defaultValue={defaultLocation ?? ""} maxLength={500} />
      </label>
      <div className="hero-actions" style={{ marginTop: 0 }}>
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Saving…" : defaultScheduledFor ? "Update schedule" : "Schedule interview"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
