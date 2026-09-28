"use client";

import { useEffect } from "react";

export function TrainingPreviewBeacon({ assignmentId }: { assignmentId: string }) {
  useEffect(() => {
    let sent = false;
    const recordVisiblePreview = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      // The engagement event is best-effort. A tracking failure cannot
      // interrupt a Student's training page or completion workflow.
      void fetch(
        "/api/student/employer-training/assignments/" +
          encodeURIComponent(assignmentId) +
          "/preview",
        { method: "POST", credentials: "same-origin", keepalive: true },
      ).catch(() => {});
    };
    recordVisiblePreview();
    document.addEventListener("visibilitychange", recordVisiblePreview);
    return () => document.removeEventListener("visibilitychange", recordVisiblePreview);
  }, [assignmentId]);
  return null;
}
