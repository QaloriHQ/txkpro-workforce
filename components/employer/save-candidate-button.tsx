"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveCandidateButton({
  studentId,
  hiringNeedId,
  saved,
}: {
  studentId: string;
  hiringNeedId?: string | null;
  saved: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(saved);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const response = await fetch(
      `/api/employer/talent/${encodeURIComponent(studentId)}/save`,
      {
        method: isSaved ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hiringNeedId: hiringNeedId ?? null }),
      },
    );
    setBusy(false);
    if (!response.ok) return;
    setIsSaved(!isSaved);
    router.refresh();
  }

  return (
    <button
      className={`button ${isSaved ? "button-ghost" : "button-brand"}`}
      type="button"
      onClick={toggle}
      disabled={busy}
    >
      {busy ? "Saving…" : isSaved ? "Remove from Saved" : "Save Candidate"}
    </button>
  );
}
