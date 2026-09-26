"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export function LessonProgressActions({
  assignmentId,
  lessonId,
  completed,
  nextHref,
}: {
  assignmentId: string;
  lessonId: string;
  completed: boolean;
  nextHref: string | null;
}) {
  const router = useRouter();
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (touched.current || completed) return;
    touched.current = true;
    void fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/lessons/" +
        encodeURIComponent(lessonId) +
        "/touch",
      { method: "POST" },
    );
  }, [assignmentId, lessonId, completed]);

  async function complete() {
    if (busy || completed) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/lessons/" +
        encodeURIComponent(lessonId) +
        "/complete",
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(
        typeof body?.error === "string"
          ? body.error
          : "Unable to save lesson progress.",
      );
      return;
    }

    if (nextHref) {
      router.push(nextHref);
      router.refresh();
      return;
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="student-lesson-completion">
      <button
        className={
          "button " + (completed ? "button-ghost" : "button-brand")
        }
        type="button"
        disabled={busy || completed}
        onClick={complete}
      >
        <CheckCircleIcon aria-hidden="true" />
        {completed
          ? "Lesson complete"
          : busy
            ? "Saving…"
            : nextHref
              ? "Mark complete & continue"
              : "Mark lesson complete"}
      </button>
      {error ? <span className="student-training-error">{error}</span> : null}
    </div>
  );
}
