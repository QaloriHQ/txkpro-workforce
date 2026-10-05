"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import { PublicProfileFields } from "./public-profile-fields";
import type { StudentPublicSettings } from "@/lib/student-public-profile/types";
export function StudentPublicProfileSettings({ initial, suggestedName, compact = false, identityOnly = false }: { initial: StudentPublicSettings; suggestedName: string; compact?: boolean; identityOnly?: boolean }) {
  const router = useRouter();
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
      setSaved(result); setDraft(result); router.refresh(); setFeedback(result.visibility === "private" ? "Saved. Your public profile is now unavailable." : "Saved. Your profile is public.");
    } catch { setFeedback("Connection failed. Your draft is saved here; try again."); } finally { setBusy(false); }
  }
  const form = <WorkspaceForm modalTitle={identityOnly ? "Edit profile details" : "Profile and privacy"} triggerLabel={identityOnly ? "Edit details" : saved.chosen ? "Edit profile and privacy" : "Choose profile privacy"} busy={busy} onSubmit={submit} feedback={<p role="status" aria-live="polite">{feedback}</p>}>
      <PublicProfileFields identityOnly={identityOnly} value={draft} disabled={busy} onChange={(name, value) => setDraft(current => ({ ...current, [name]: value }))} />
      <button className="txk-button txk-button-primary txk-button-md" disabled={busy} type="submit">{busy ? "Saving…" : "Save profile"}</button>
    </WorkspaceForm>;
  if (identityOnly) return saved.chosen ? form : <a className="button" href="/student/profile/edit">Set up profile</a>;
  return <section className={compact ? "card student-profile-privacy-bar" : "card"}>
    <div className="card-header"><div>{!compact ? <p className="eyebrow">Privacy and sharing</p> : null}<h2>{compact ? "Profile visibility" : "Your public profile"}</h2><p className="card-sub">{saved.chosen ? `Your profile is ${saved.visibility === "public" ? "Public" : "Private"}.` : "Choose Public or Private to finish your profile privacy setup."}</p></div></div>
    {saved.visibility === "public" && saved.path ? <p><a href={saved.path} target="_blank" rel="noopener noreferrer">View public profile</a></p> : !compact ? <p className="muted">Your page is unavailable to public visitors and excluded from the sitemap.</p> : null}
    {form}
  </section>;
}
