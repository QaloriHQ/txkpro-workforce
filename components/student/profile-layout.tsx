"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import type { PortfolioPreferences } from "@/lib/student-portfolio/types";
export const defaultPanelOrder = ["credentials", "projects", "files"] as const;
export type ProfilePanel = typeof defaultPanelOrder[number];
export function ProfilePanels({ preferences, panels }: { preferences: PortfolioPreferences; panels: Record<ProfilePanel, ReactNode> }) {
  return <div className={`profile-panels profile-layout-${preferences.layout || "comfortable"}`}>{(preferences.panelOrder || defaultPanelOrder).filter(panel => panels[panel]).map(panel => <div key={panel}>{panels[panel]}</div>)}</div>;
}
export function ProfileLayoutEditor({ preferences }: { preferences: PortfolioPreferences }) {
  const [order, setOrder] = useState<ProfilePanel[]>([...(preferences.panelOrder || defaultPanelOrder)]);
  const [layout, setLayout] = useState(preferences.layout || "comfortable");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const router = useRouter();
  function move(index: number, offset: number) { setOrder(current => { const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/student/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "layout", panelOrder: order, layout }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to save layout.");
      router.refresh(); setFeedback("Saved. Your profile and public page use this layout.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save layout."); } finally { setBusy(false); }
  }
  return <WorkspaceForm modalTitle="Profile layout" triggerLabel="Edit layout & panel order" busy={busy} onSubmit={save} feedback={<p role="status">{feedback}</p>}><fieldset disabled={busy} className="portfolio-fieldset"><label>Card spacing<select value={layout} onChange={event => setLayout(event.target.value as "compact" | "comfortable")}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><p>Panel order applies to your profile and public page. Public sections still follow your sharing choices.</p><ol className="profile-order-list">{order.map((panel, index) => <li key={panel}><strong>{panel === "credentials" ? "Skills & credentials" : panel === "projects" ? "Projects" : "Files"}</strong><div><button type="button" className="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${panel} up`}>↑</button><button type="button" className="button" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${panel} down`}>↓</button></div></li>)}</ol><button className="button button-brand" type="submit">{busy ? "Saving…" : "Save layout"}</button></fieldset></WorkspaceForm>;
}
