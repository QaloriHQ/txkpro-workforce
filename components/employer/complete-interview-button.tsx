"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompleteInterviewButton({
  interviewRequestId,
}: {
  interviewRequestId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    if (busy || !window.confirm("Mark this interview completed? This does not record a hire.")) return;
    setBusy(true);
    const response = await fetch(
      `/api/interviews/${encodeURIComponent(interviewRequestId)}/status`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      },
    );
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <button className="button button-brand" type="button" onClick={complete} disabled={busy}>
      {busy ? "Updating…" : "Mark Interview Completed"}
    </button>
  );
}
