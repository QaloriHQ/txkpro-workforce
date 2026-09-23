"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StudentInterviewResponseForm({
  interviewRequestId,
}: {
  interviewRequestId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function respond(responseValue: "accepted" | "declined" | "scheduling") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(
      `/api/interviews/${encodeURIComponent(interviewRequestId)}/respond`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: responseValue, note: note.trim() || null }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(typeof body?.error === "string" ? body.error : "Unable to send response.");
      return;
    }
    setMessage("Response sent.");
    router.refresh();
  }

  return (
    <div className="form-stack">
      <label>
        <span>Optional note to Employer</span>
        <textarea
          className="textarea"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Availability or scheduling context."
        />
      </label>
      <div className="hero-actions" style={{ marginTop: 0 }}>
        <button className="button button-brand" type="button" onClick={() => respond("accepted")} disabled={busy}>
          Accept
        </button>
        <button className="button button-ghost" type="button" onClick={() => respond("scheduling")} disabled={busy}>
          Request follow-up
        </button>
        <button className="button button-ghost" type="button" onClick={() => respond("declined")} disabled={busy}>
          Decline
        </button>
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
