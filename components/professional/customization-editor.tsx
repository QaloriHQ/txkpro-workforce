"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import { profilePanels, type Customization, type Kind, type ProfilePanel } from "@/lib/professional-profile/types";
const titles: Record<ProfilePanel, string> = { about: "About", specialties: "Specialties", credentials: "Credentials", reviews: "Reviews & ratings", posts: "Posts", activity: "Activity" };
export function CustomizationEditor({ kind, value, update }: { kind: Kind; value?: Customization; update: (value: Customization) => void }) {
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState("");
  const [order, setOrder] = useState<ProfilePanel[]>(value?.panelOrder || [...profilePanels]);
  const [hidden, setHidden] = useState<ProfilePanel[]>(value?.hiddenSections || []);
  const [layout, setLayout] = useState(value?.layout || "comfortable");
  async function send(url: string, options: RequestInit) {
    setBusy(true); setFeedback("");
    try { const response = await fetch(url, options); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to save."); update(result); setFeedback(result.cleanupPending ? "Saved. Previous image cleanup is pending." : "Saved. Close this editor to return to your profile."); }
    catch (e) { setFeedback(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); }
  }
  async function saveLayout(e: FormEvent<HTMLFormElement>) { e.preventDefault(); await send(`/api/professional/customization?kind=${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "layout", layout, panelOrder: order, hiddenSections: hidden }) }); }
  async function upload(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget; await send(`/api/professional/images?kind=${kind}`, { method: "POST", body: new FormData(form) }); }
  function move(index: number, change: number) { setOrder(current => { const next = [...current]; [next[index], next[index + change]] = [next[index + change], next[index]]; return next; }); }
  return <div className="professional-controls">
    <WorkspaceForm modalTitle="Profile layout & sections" triggerLabel="Customize layout" busy={busy} onSubmit={saveLayout} feedback={<p role="status">{feedback}</p>}>
      <fieldset disabled={busy}><label>Spacing<select value={layout} onChange={e => setLayout(e.target.value as "compact" | "comfortable")}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <p>Reorder sections and choose which appear on your profile and public page.</p><ol className="profile-order-list">{order.map((panel, index) => <li key={panel}><label className="professional-checkbox"><input type="checkbox" checked={!hidden.includes(panel)} onChange={e => setHidden(current => e.target.checked ? current.filter(p => p !== panel) : [...current, panel])} />{titles[panel]}</label><div><button type="button" className="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${titles[panel]} up`}><ArrowUpIcon width={18} aria-hidden="true" /></button><button type="button" className="button" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${titles[panel]} down`}><ArrowDownIcon width={18} aria-hidden="true" /></button></div></li>)}</ol>
      <p className="card-sub">Activity and review settings in Edit professional profile still apply. Affiliation remains membership verified.</p><button className="button" type="submit">{busy ? "Saving…" : "Save layout"}</button></fieldset>
    </WorkspaceForm>
    {(["photo", "cover"] as const).map(slot => <WorkspaceForm key={slot} modalTitle={slot === "photo" ? "Profile photo" : "Cover image"} triggerLabel={slot === "photo" ? "Edit photo" : "Edit cover"} busy={busy} onSubmit={upload} feedback={<p role="status">{feedback}</p>}>
      <fieldset disabled={busy}><input type="hidden" name="slot" value={slot} /><label>{slot === "photo" ? "Choose profile photo" : "Choose cover image"}<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label><p className="card-sub">JPEG, PNG or WebP, up to 4 MB. Your images follow your profile visibility.</p><button type="submit" className="button">{busy ? "Uploading…" : "Upload image"}</button>{value?.[slot === "photo" ? "photoUrl" : "coverUrl"] ? <button type="button" className="button button-ghost" onClick={() => send(`/api/professional/images?kind=${kind}&slot=${slot}`, { method: "DELETE" })}>Remove image</button> : null}</fieldset>
    </WorkspaceForm>)}
  </div>;
}
