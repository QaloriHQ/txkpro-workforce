"use client";
import { useMemo, useState } from "react";
import type { ModerationAction, ModerationCase, ModerationWorkspace } from "@/lib/community/moderation-types";

const decisions: { value: ModerationAction; label: string; duration?: number }[] = [
  { value: "no_action", label: "Dismiss report" }, { value: "warn", label: "Warn member" },
  { value: "hide_content", label: "Quarantine content" }, { value: "remove_content", label: "Remove content" },
  { value: "restrict_posting", label: "Restrict posting — 7 days", duration: 168 },
  { value: "restrict_interactions", label: "Restrict interactions — 7 days", duration: 168 },
  { value: "suspend_user", label: "Suspend account" }, { value: "escalate", label: "Escalate review" },
];

export function ModerationWorkspaceView({ initial }: { initial: ModerationWorkspace }) {
  const [items, setItems] = useState(initial.items);
  const [active, setActive] = useState<ModerationCase | null>(null);
  const [action, setAction] = useState<ModerationAction>("no_action");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"priority" | "all" | "automated">("priority");
  const visible = useMemo(() => items.filter(item => filter === "all" || (filter === "automated" ? item.automationState === "actioned" : item.automationState === "needs_review")), [items, filter]);

  async function decide() {
    if (!active) return;
    const selected = decisions.find(item => item.value === action);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/moderation/${encodeURIComponent(active.caseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rationale, durationHours: selected?.duration ?? null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The moderation action failed.");
      setItems(current => current.map(item => item.caseId === active.caseId ? { ...item, status: action === "no_action" ? "dismissed" : action === "escalate" ? "reviewing" : "resolved", automationState: "overridden", outcome: action, decisionSummary: rationale } : item));
      setMessage("Decision recorded in the moderation audit trail."); setActive(null); setRationale(""); setAction("no_action");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The moderation action failed."); }
    finally { setBusy(false); }
  }

  return <main className="page-wrap moderation-workspace">
    <div className="page-heading"><div><p className="eyebrow">Action Center</p><h1>Reports &amp; moderation</h1><p className="card-sub">Review high-priority cases and audit automated enforcement. Report volume is never treated as proof.</p></div><span className="pill pill-good">Policy v1 active</span></div>
    <section className="moderation-metrics" aria-label="Moderation queue summary">
      <div><span>Needs review</span><strong>{initial.stats.needsReview}</strong><small>High priority or uncertain</small></div>
      <div><span>Critical</span><strong>{initial.stats.critical}</strong><small>Immediate administrator attention</small></div>
      <div><span>Automated</span><strong>{initial.stats.automated}</strong><small>Policy-handled cases</small></div>
      <div><span>Open</span><strong>{initial.stats.open}</strong><small>Submitted or reviewing</small></div>
    </section>
    <div className="moderation-toolbar" role="group" aria-label="Moderation queue filter">
      {(["priority","all","automated"] as const).map(value => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "priority" ? "Priority queue" : value === "all" ? "All cases" : "Automated activity"}</button>)}
    </div>
    {message ? <div className="callout" role="status">{message}</div> : null}
    <section className="card moderation-case-list">
      <div className="card-header"><div><h2>{filter === "priority" ? "Human review required" : filter === "automated" ? "Automated decisions" : "Moderation cases"}</h2><p className="card-sub">Evidence is restricted to authorized moderators and never exported to analytics.</p></div><span className="pill">{visible.length} cases</span></div>
      <div className="table-wrap"><table><thead><tr><th>Priority</th><th>Target</th><th>Reports</th><th>Evidence</th><th>Status</th><th aria-label="Action" /></tr></thead>
        <tbody>{visible.length ? visible.map(item => <tr key={item.caseId}><td><span className={`moderation-severity severity-${item.severity}`}>{item.severity}</span><small>{item.priorityScore}/100</small></td>
          <td><strong>{item.targetName}</strong><small>{item.targetType} · {item.targetId}</small></td><td><strong>{item.reportCount}</strong><small>{item.automationState.replace("_"," ")}</small></td>
          <td><p className="moderation-evidence">{item.evidenceExcerpt || "Restricted account evidence"}</p></td><td><span className="pill">{item.status}</span><small>{item.outcome || "No decision"}</small></td>
          <td><button className="button button-small" type="button" onClick={() => { setActive(item); setMessage(""); }}>Review</button></td></tr>) : <tr><td colSpan={6}><div className="empty"><strong>No cases in this view</strong>Automated policy results and high-priority reports will appear here.</div></td></tr>}</tbody></table></div>
    </section>
    {active ? <div className="moderation-modal-backdrop" role="presentation"><section className="moderation-modal" role="dialog" aria-modal="true" aria-labelledby="moderation-decision-title">
      <div className="card-header"><div><p className="eyebrow">Case {active.caseId}</p><h2 id="moderation-decision-title">Record moderation decision</h2></div><button className="button button-ghost button-small" type="button" onClick={() => setActive(null)}>Close</button></div>
      <div className="moderation-case-summary"><span className={`moderation-severity severity-${active.severity}`}>{active.severity}</span><strong>{active.targetName}</strong><p>{active.evidenceExcerpt || "No content excerpt available."}</p></div>
      <label>Action<select value={action} onChange={event => setAction(event.target.value as ModerationAction)}>{decisions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label>Decision reason<textarea rows={4} maxLength={2000} value={rationale} onChange={event => setRationale(event.target.value)} placeholder="Cite the policy rule and evidence used…" /></label>
      <p className="card-sub">Every action is attributable, reversible where possible, and appealable. Indefinite suspension requires Super Admin authorization.</p>
      <div className="header-actions"><button className="button button-brand" type="button" disabled={busy || rationale.trim().length < 8} onClick={() => void decide()}>{busy ? "Recording…" : "Record decision"}</button><button className="button button-ghost" type="button" onClick={() => setActive(null)}>Cancel</button></div>
    </section></div> : null}
  </main>;
}
