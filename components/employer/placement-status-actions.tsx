"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlacementStatusActions({
  placementId,
  status,
}: {
  placementId: string;
  status: "pending_start" | "active" | "ended" | "unknown";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(nextStatus: "active" | "ended") {
    if (busy) return;
    let endReason: string | null = null;
    if (nextStatus === "ended") {
      if (!window.confirm("End this placement? Historical Interview, Referral, and retention records will be preserved.")) return;
      endReason = window.prompt("Optional end reason")?.trim() || null;
    }
    setBusy(true);
    const response = await fetch(
      `/api/placements/${encodeURIComponent(placementId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus, endReason }),
      },
    );
    setBusy(false);
    if (response.ok) router.refresh();
  }

  if (status === "ended" || status === "unknown") return null;

  return (
    <div className="hero-actions" style={{ marginTop: 0 }}>
      {status === "pending_start" ? (
        <button className="button button-brand" type="button" onClick={() => update("active")} disabled={busy}>
          {busy ? "Updating…" : "Mark Active"}
        </button>
      ) : null}
      <button className="button button-ghost" type="button" onClick={() => update("ended")} disabled={busy}>
        {busy ? "Updating…" : "End Placement"}
      </button>
    </div>
  );
}
