"use client";
import { useState } from "react";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import { PublicProfileFields } from "./public-profile-fields";
import type { StudentPublicSettings } from "@/lib/student-public-profile/types";
export function StudentPublicProfileSettings({ initial, suggestedName }: { initial: StudentPublicSettings; suggestedName: string }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({ ...initial, displayName: initial.displayName || suggestedName });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/student/public-profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) { setFeedback(result.error || "Unable to save your settings."); return; }
      setSaved(result); setDraft(result); setFeedback(result.visibility === "private" ? "Saved. Your public profile is now unavailable." : "Saved. Your profile is public.");
    } catch { setFeedback("Connection failed. Your draft is saved here; try again."); } finally { setBusy(false); }
  }
  return <section className="card">
    <div className="card-header"><div><p className="eyebrow">Privacy and sharing</p><h2>Your public profile</h2><p className="card-sub">{saved.chosen ? `Your profile is ${saved.visibility === "public" ? "Public" : "Private"}.` : "Choose Public or Private to finish your profile privacy setup."}</p></div></div>
    {saved.visibility === "public" && saved.path ? <p><a href={saved.path} target="_blank" rel="noopener noreferrer">View public profile</a></p> : <p className="muted">Your page is unavailable to public visitors and excluded from the sitemap.</p>}
    <WorkspaceForm modalTitle="Profile and privacy" triggerLabel={saved.chosen ? "Edit profile and privacy" : "Choose profile privacy"} busy={busy} onSubmit={submit} feedback={<p role="status" aria-live="polite">{feedback}</p>}>
      <PublicProfileFields value={draft} disabled={busy} onChange={(name, value) => setDraft(current => ({ ...current, [name]: value }))} />
      <button className="txk-button txk-button-primary txk-button-md" disabled={busy} type="submit">{busy ? "Saving…" : "Save profile and privacy"}</button>
    </WorkspaceForm>
  </section>;
}
