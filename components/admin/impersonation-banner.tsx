"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftOnRectangleIcon, EyeIcon } from "@heroicons/react/24/outline";

/**
 * Persistently visible whenever an actual, issuer-validated impersonation
 * context exists. The registry-only foundation never displays this banner.
 */
export function ImpersonationBanner({ targetName, targetScope }: {
  targetName: string;
  targetScope: string;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const [failure, setFailure] = useState(false);

  async function exit() {
    if (exiting) return;
    setExiting(true);
    setFailure(false);
    try {
      const response = await fetch("/api/admin/impersonation/session", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to end session");
      router.replace("/admin");
      router.refresh();
    } catch {
      setFailure(true);
      setExiting(false);
    }
  }

  return (
    <aside className="txk-impersonation-banner" aria-label="Super Admin impersonation session">
      <div className="txk-impersonation-banner-content">
        <EyeIcon aria-hidden="true" />
        <span>
          <strong>Viewing as {targetName}</strong>
          <span className="txk-impersonation-scope">{targetScope} · Super Admin session</span>
        </span>
      </div>
      <div className="txk-impersonation-actions">
        {failure ? <span role="alert">Could not exit. Try again.</span> : null}
        <button onClick={() => void exit()} type="button" disabled={exiting} aria-label="Exit View as and return to Super Admin">
          <ArrowLeftOnRectangleIcon aria-hidden="true" />
          {exiting ? "Exiting…" : "Exit View as"}
        </button>
      </div>
    </aside>
  );
}
