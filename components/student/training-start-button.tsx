"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayIcon } from "@heroicons/react/24/outline";

export function TrainingStartButton({
  assignmentId,
  firstLessonId,
}: {
  assignmentId: string;
  firstLessonId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/start",
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(
        typeof body?.error === "string"
          ? body.error
          : "Unable to start Employer Training.",
      );
      return;
    }

    if (firstLessonId) {
      router.push(
        "/student/employer-training/" +
          encodeURIComponent(assignmentId) +
          "/lessons/" +
          encodeURIComponent(firstLessonId),
      );
      router.refresh();
      return;
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="student-training-start">
      <button
        className="button button-brand student-training-primary-action"
        type="button"
        disabled={busy}
        onClick={start}
      >
        <PlayIcon aria-hidden="true" />
        {busy ? "Starting…" : "Start training"}
      </button>
      {error ? <span className="student-training-error">{error}</span> : null}
    </div>
  );
}
