"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InterviewEvaluation } from "@/lib/employer/types";

export function InterviewEvaluationForm({
  interviewRequestId,
  evaluation,
}: {
  interviewRequestId: string;
  evaluation?: InterviewEvaluation | null;
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
    const response = await fetch(
      `/api/employer/interviews/${encodeURIComponent(interviewRequestId)}/evaluation`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nextStep: String(form.get("nextStep") ?? "not_set"),
          summary: String(form.get("summary") ?? "").trim() || null,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(typeof body?.error === "string" ? body.error : "Unable to save evaluation.");
      return;
    }
    setMessage("Private evaluation saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <div className="callout">
        <strong>Employer-private evaluation</strong>
        This information is not synchronized to Student or Institution views and does not alter Verified Skills.
      </div>
      <label>
        <span>Internal next step</span>
        <select className="select" name="nextStep" defaultValue={evaluation?.nextStep ?? "not_set"}>
          <option value="not_set">Not set</option>
          <option value="continue">Continue</option>
          <option value="hold">Hold</option>
          <option value="close">Close</option>
          <option value="prepare_hire">Prepare Hire</option>
        </select>
      </label>
      <label>
        <span>Evaluation summary</span>
        <textarea
          className="textarea"
          rows={5}
          maxLength={4000}
          name="summary"
          defaultValue={evaluation?.summary ?? ""}
          placeholder="Document interview observations for authorized Employer users."
        />
      </label>
      <div className="hero-actions" style={{ marginTop: 0 }}>
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save private evaluation"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
