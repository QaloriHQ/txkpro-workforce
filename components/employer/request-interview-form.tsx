"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RequestInterviewForm({
  studentId,
  hiringNeedId,
  referralId,
  defaultRoleTitle,
  defaultTradeId,
}: {
  studentId: string;
  hiringNeedId?: string | null;
  referralId?: string | null;
  defaultRoleTitle?: string | null;
  defaultTradeId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      studentId,
      hiringNeedId: hiringNeedId ?? null,
      referralId: referralId ?? null,
      roleTitle: String(form.get("roleTitle") ?? "").trim(),
      tradeId: defaultTradeId ?? null,
      message: String(form.get("message") ?? "").trim(),
      schedulingUrl: String(form.get("schedulingUrl") ?? "").trim() || null,
    };

    setBusy(true);
    setMessage("");
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(typeof body?.error === "string" ? body.error : "Unable to request interview.");
      return;
    }

    const interviewId = body?.interview?.interviewRequestId;
    if (typeof interviewId === "string" && interviewId) {
      router.push(`/employer/interviews/${encodeURIComponent(interviewId)}`);
      router.refresh();
      return;
    }
    setMessage("Interview request created.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        <span>Role title</span>
        <input
          className="input"
          name="roleTitle"
          defaultValue={defaultRoleTitle ?? ""}
          maxLength={200}
          required
        />
      </label>
      <label>
        <span>Student-facing message</span>
        <textarea
          className="textarea"
          name="message"
          maxLength={2000}
          rows={4}
          placeholder="Explain why you would like to meet and what the conversation will cover."
          required
        />
      </label>
      <label>
        <span>Scheduling link <small className="muted">(optional)</small></span>
        <input
          className="input"
          name="schedulingUrl"
          type="url"
          maxLength={1000}
          placeholder="https://..."
        />
      </label>
      <div className="callout">
        <strong>Student controls the response.</strong>
        This sends a canonical Interview Request. It does not accept, decline, schedule, or hire the Student automatically.
      </div>
      <div className="hero-actions" style={{ marginTop: 0 }}>
        <button className="button button-brand" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Request Interview"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
