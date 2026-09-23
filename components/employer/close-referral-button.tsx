"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseReferralButton({ referralId }: { referralId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function closeReferral() {
    if (busy || !window.confirm("Close this referral? Its history will be preserved.")) {
      return;
    }
    setBusy(true);
    const response = await fetch(
      `/api/employer/referrals/${encodeURIComponent(referralId)}/close`,
      { method: "POST" },
    );
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <button
      className="button button-ghost"
      type="button"
      onClick={closeReferral}
      disabled={busy}
    >
      {busy ? "Closing…" : "Close Referral"}
    </button>
  );
}
