"use client";

import { useState } from "react";
import type { ProductionRequest, ProductionStatus } from "@/lib/concierge";
import { productionStatuses } from "@/lib/concierge-statuses";

const labels: Record<ProductionStatus, string> = {
  requested: "Requested", discovery: "Discovery", filming_scheduled: "Filming scheduled",
  editing: "Editing / interactive build", employer_review: "Employer review",
  institution_preview: "Institution preview", ready: "Ready",
};

export function ProductionWorkspace({
  view, initial, employers = [], cohorts = [], canCreate = true,
}: {
  view: "institution" | "employer" | "admin";
  initial: ProductionRequest[];
  employers?: { id: string; name: string }[];
  cohorts?: { id: string; name: string; program: string | null }[];
  canCreate?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(form: FormData) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const cohort = cohorts.find((item) => item.id === form.get("cohortId"));
      const response = await fetch("/api/concierge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view, employerId: view === "employer" ? employers[0]?.id : form.get("employerId"),
          cohortId: cohort?.id, programName: cohort?.program,
          fieldGap: form.get("fieldGap"), equipmentProcess: form.get("equipmentProcess"),
          desiredOutcome: form.get("desiredOutcome"), targetLaunchDate: form.get("targetLaunchDate"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed");
      setItems((prev) => [body.request, ...prev]);
      setSuccess(`Request ${body.request.production_request_id} submitted.`);
      (document.getElementById("concierge-request-form") as HTMLFormElement)?.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); }
    finally { setBusy(false); }
  }

  async function advance(item: ProductionRequest, form: FormData) {
    const next = productionStatuses[productionStatuses.indexOf(item.status) + 1];
    if (!next) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/concierge/${encodeURIComponent(item.production_request_id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, note: form.get("note") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Update failed");
      setItems((prev) => prev.map((entry) =>
        entry.production_request_id === item.production_request_id ? body.request : entry));
      setSuccess(`${item.production_request_id} moved to ${labels[next]}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed"); }
    finally { setBusy(false); }
  }

  return <div className="txk-section">
    {view !== "admin" && canCreate && <section className="txk-card" style={{ padding: 24, marginBottom: 24 }}>
      <h2>Request a training module</h2>
      <p>Describe the field gap and the outcome. TXKPRO manages production and contracts separately. No Institution payment checkout is required here.</p>
      <form id="concierge-request-form" className="txk-form" action={submit}>
        {view === "institution" && <>
          <label>Employer <select name="employerId" required defaultValue=""><option value="">Select employer</option>{employers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>Program / cohort <select name="cohortId" required defaultValue=""><option value="">Select cohort</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.program ? ` · ${c.program}` : ""}</option>)}</select></label>
        </>}
        <label>Field gap <textarea name="fieldGap" required maxLength={2000} /></label>
        <label>Equipment / process <textarea name="equipmentProcess" maxLength={2000} /></label>
        <label>Desired student outcome <textarea name="desiredOutcome" required maxLength={2000} /></label>
        <label>Target launch date <input type="date" name="targetLaunchDate" /></label>
        <button className="txk-button txk-button-primary" disabled={busy || !employers.length}>Submit request</button>
      </form>
    </section>}
    {error && <p role="alert" className="callout">{error}</p>}
    {success && <p role="status" className="callout">{success}</p>}
    <h2>Production requests</h2>
    {!items.length && <p>No production requests in this scope yet.</p>}
    <div className="txk-learning-grid">
      {items.map((item) => {
        const next = productionStatuses[productionStatuses.indexOf(item.status) + 1];
        return <article className="txk-card" style={{ padding: 24 }} key={item.production_request_id}>
          <p className="txk-eyebrow">{item.production_request_id} · {labels[item.status]}</p>
          <h3>{item.field_gap}</h3>
          <p>{item.equipment_process || "Equipment / process to be defined"}</p>
          <p><strong>Outcome:</strong> {item.desired_outcome}</p>
          <p><strong>Employer:</strong> {item.employer_id} {item.program_name ? `· ${item.program_name}` : ""}</p>
          <p><strong>Target launch:</strong> {item.target_launch_date || "To be scheduled"}</p>
          {item.resulting_micro_cert_id && <p>Course: {item.resulting_micro_cert_id}</p>}
          {view === "admin" && next && <form action={(form) => advance(item, form)}>
            <label>Production note <input name="note" maxLength={1000} placeholder="Optional internal transition note" /></label>
            <button disabled={busy} className="txk-button txk-button-primary">Move to {labels[next]}</button>
          </form>}
        </article>;
      })}
    </div>
  </div>;
}
