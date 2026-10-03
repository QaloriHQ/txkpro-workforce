"use client";

import { WorkspaceForm } from "@/components/design-system/action-modal";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function InstitutionCreateForm() {
  const router = useRouter();
  const request = useRef<{ key: string; payload: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const fields = Object.fromEntries(new FormData(element).entries());
    const payload = JSON.stringify(fields);
    if (!request.current || request.current.payload !== payload) request.current = { key: crypto.randomUUID(), payload };
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/institutions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...fields, requestKey: request.current.key }),
      });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error ?? "Unable to create institution."); return; }
      setMessage("Institution available. Invite its administrator below to provision access.");
      request.current = null;
      element.reset();
      router.refresh();
    } catch { setMessage("Connection failed. Retry with the same details to check the saved request."); } finally { setBusy(false); }
  }

  return <WorkspaceForm modalTitle="Create institution" busy={Boolean(busy)} className="card form-stack" onSubmit={submit}>
    <h2>Create institution</h2>
    <label><span>Institution name (required)</span><input className="input" name="name" maxLength={160} required /></label>
    <label><span>Type (required)</span><select className="select" name="institutionType" required>
      <option value="community_college">Community college</option><option value="technical_college">Technical college</option>
      <option value="high_school_cte">High school / CTE</option><option value="workforce_program">Workforce program</option><option value="other">Other</option>
    </select></label>
    <div className="grid grid-2"><label><span>City</span><input className="input" name="city" maxLength={120} /></label><label><span>State</span><input className="input" name="state" maxLength={40} defaultValue="TX" /></label></div>
    <p className="muted">The institution becomes available for onboarding. User access is provisioned separately by invitation.</p>
    {message ? <p className="alert" role="status">{message}</p> : null}
    <button className="button button-brand" type="submit" disabled={busy}>{busy ? "Creating…" : "Create institution"}</button>
  </WorkspaceForm>;
}
