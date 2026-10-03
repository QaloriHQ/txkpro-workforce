"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";

export function PlacementStatusActions({
  placementId,
  status,
}: {
  placementId: string;
  status: "pending_start" | "active" | "ended" | "unknown";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function end(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const endReason =
      String(new FormData(event.currentTarget).get("endReason") ?? "").trim() ||
      null;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/placements/${encodeURIComponent(placementId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "ended", endReason }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(
          typeof body.error === "string"
            ? body.error
            : "Unable to end placement.",
        );
        return;
      }
      setMessage(
        "Placement ended. Employment and retention history preserved.",
      );
      router.refresh();
    } catch {
      setMessage("Connection interrupted. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (status === "ended" || status === "unknown") return null;
  return (
    <WorkspaceForm
      modalTitle="End placement"
      busy={busy}
      onSubmit={end}
      className="form-stack"
    >
      <p>
        End this placement and cancel unsent retention check-ins. Interview,
        Referral, and delivered retention history will be preserved.
      </p>
      <label>
        <span>End reason (optional)</span>
        <textarea className="textarea" name="endReason" maxLength={500} />
      </label>
      <label>
        <input type="checkbox" required /> I confirm this placement should end.
      </label>
      <button className="button button-ghost" type="submit" disabled={busy}>
        {busy ? "Ending…" : "End placement"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </WorkspaceForm>
  );
}
