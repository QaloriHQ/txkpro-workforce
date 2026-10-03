"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";

export function ConfirmStartForm({
  placementId,
  scheduledStartDate,
}: {
  placementId: string;
  scheduledStartDate: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const startDate = String(
      new FormData(event.currentTarget).get("startDate") ?? "",
    );
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/placements/${encodeURIComponent(placementId)}/confirm-start`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startDate }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(
          typeof body.error === "string"
            ? body.error
            : "Unable to confirm employment start.",
        );
        return;
      }
      setMessage(
        "Employment start confirmed. This counts as an official placement.",
      );
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Retry to check or confirm the saved start date.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceForm
      modalTitle="Confirm employment started"
      busy={busy}
      onSubmit={submit}
      className="form-stack"
    >
      <p>
        Confirm that the Student actually started employment. A scheduled start
        alone does not count as an official placement.
      </p>
      <label>
        <span>Actual employment start date</span>
        <input
          className="input"
          name="startDate"
          type="date"
          required
          max={today}
          defaultValue={
            scheduledStartDate && scheduledStartDate <= today
              ? scheduledStartDate
              : ""
          }
        />
      </label>
      <label>
        <input type="checkbox" required /> I confirm the Student started
        employment on this date.
      </label>
      <button className="button button-brand" type="submit" disabled={busy}>
        {busy ? "Confirming…" : "Confirm employment started"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </WorkspaceForm>
  );
}
