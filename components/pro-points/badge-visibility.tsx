"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";
export function SystemBadgeVisibility({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/pro-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "badge_visibility",
          enabled: data.get("enabled") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to save sharing.");
      setFeedback("Saved. Close this editor to continue.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unable to save sharing.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceForm
      modalTitle="TXKPRO System badge visibility"
      triggerLabel="System badge sharing"
      onSubmit={save}
      busy={busy}
      feedback={
        <p role="status" aria-live="polite">
          {feedback}
        </p>
      }
    >
      <label className="pro-check">
        <input type="checkbox" name="enabled" defaultChecked={enabled} />
        Show my earned TXKPRO System activity badges on my public profile
      </label>
      <p>
        Visit and check-in achievements are private by default. This setting is
        separate from Company Badges and from sharing your points, rankings and
        streak totals. Your profile must also be Public.
      </p>
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Saving…" : "Save sharing"}
      </button>
    </WorkspaceForm>
  );
}
