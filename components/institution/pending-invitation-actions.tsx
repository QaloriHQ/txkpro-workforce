"use client";

import { useState } from "react";
import {
  ArrowPathIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

export function PendingInvitationActions({
  invitationId,
}: {
  invitationId: string;
}) {
  const [busy, setBusy] = useState<"resend" | "revoke" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function action(kind: "resend" | "revoke") {
    setBusy(kind);
    setMessage(null);
    try {
    const response = await fetch(
      `/api/invitations/${encodeURIComponent(invitationId)}/${kind}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: kind === "revoke" ? JSON.stringify({ mode: "revoked" }) : JSON.stringify({ requestKey: crypto.randomUUID() }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? `Unable to ${kind} invitation.`);
      return;
    }
    if (kind === "revoke") {
      window.location.reload();
      return;
    }
    setMessage("Invitation resent.");
    } catch {
      setMessage("Unable to connect. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="institution-invitation-actions">
      <button
        className="txk-button txk-button-default txk-button-sm"
        type="button"
        onClick={() => action("resend")}
        disabled={busy !== null}
      >
        <ArrowPathIcon aria-hidden="true" />
        {busy === "resend" ? "Resending…" : "Resend"}
      </button>
      <button
        className="txk-button txk-button-default txk-button-sm"
        type="button"
        onClick={() => action("revoke")}
        disabled={busy !== null}
      >
        <XCircleIcon aria-hidden="true" />
        {busy === "revoke" ? "Revoking…" : "Revoke"}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
