"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import type { StudentEmployerTrainingCheckpoint } from "@/lib/student/types";

export function CheckpointResponse({
  assignmentId,
  checkpoint,
  readOnly = false,
}: {
  assignmentId: string;
  checkpoint: StudentEmployerTrainingCheckpoint;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(checkpoint.satisfied);
  const [reflection, setReflection] = useState(
    typeof checkpoint.latestResponse?.response?.text === "string"
      ? checkpoint.latestResponse.response.text
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly) return;
    setBusy(true);
    setMessage("");

    const payload =
      checkpoint.checkpointType === "reflection"
        ? { text: reflection.trim() }
        : { value: checked };

    const response = await fetch(
      "/api/student/employer-training/assignments/" +
        encodeURIComponent(assignmentId) +
        "/checkpoints/" +
        encodeURIComponent(checkpoint.checkpointId),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: payload }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(
        typeof body?.error === "string"
          ? body.error
          : "Unable to save checkpoint.",
      );
      return;
    }

    setMessage(
      body?.result?.satisfied
        ? "Checkpoint complete."
        : "Response saved. This checkpoint is not complete yet.",
    );
    router.refresh();
  }

  return (
    <form className="student-checkpoint-card" onSubmit={submit}>
      <div className="student-checkpoint-heading">
        <span className="student-training-icon">
          {checkpoint.satisfied ? (
            <CheckCircleIcon aria-hidden="true" />
          ) : (
            <ClipboardDocumentCheckIcon aria-hidden="true" />
          )}
        </span>
        <div>
          <div className="student-training-kicker">
            {checkpoint.required ? "Required checkpoint" : "Optional checkpoint"}
          </div>
          <h3>{checkpoint.title || "Checkpoint"}</h3>
          <p>{checkpoint.prompt}</p>
        </div>
      </div>

      {checkpoint.checkpointType === "reflection" ? (
        <label className="student-training-field">
          <span>Reflection</span>
          <textarea
            className="textarea"
            rows={4}
            value={reflection}
            disabled={readOnly}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="Write a brief response."
          />
        </label>
      ) : (
        <label className="student-checkpoint-confirm">
          <input
            type="checkbox"
            checked={checked}
            disabled={readOnly}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {checkpoint.checkpointType === "acknowledgement"
              ? "I acknowledge this information."
              : "I confirm I completed this checkpoint."}
          </span>
        </label>
      )}

      <div className="student-checkpoint-actions">
        <span
          className={
            "pill " + (checkpoint.satisfied ? "pill-good" : "pill-neutral")
          }
        >
          {checkpoint.satisfied ? "Complete" : "Not complete"}
        </span>
        {!readOnly ? (
          <button
            className="button button-ghost button-small"
            type="submit"
            disabled={busy}
          >
            {busy ? "Saving…" : checkpoint.satisfied ? "Update response" : "Save checkpoint"}
          </button>
        ) : null}
      </div>
      {message ? <span className="student-training-message">{message}</span> : null}
    </form>
  );
}
