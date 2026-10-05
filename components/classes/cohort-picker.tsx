"use client";
import { useEffect, useState } from "react";
import { ActionModal } from "@/components/design-system/action-modal";
import type { CohortOption } from "@/lib/classes/server";
export function CohortPicker({ data, setField }: { data: Record<string, unknown>; setField: (name: string, value: unknown) => void }) {
  const institution = String(data.schoolId ?? "");
  const [options, setOptions] = useState<CohortOption[]>([]);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    if (!institution) return () => abort.abort();
    fetch(`/api/onboarding/cohorts?institutionId=${encodeURIComponent(institution)}`, { signal: abort.signal })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Cohorts unavailable"); return payload.data; })
      .then(value => { setOptions(value); setMessage(""); })
      .catch(error => { if (error.name !== "AbortError") { setOptions([]); setMessage("Unable to load cohorts. Try again or request staff assistance."); } });
    return () => abort.abort();
  }, [institution]);
  const programs = [...new Set(options.map(option => option.program ?? ""))];
  return <>
    <label><span>Program</span><select className="select" required disabled={!institution} value={String(data.programType ?? "")} onChange={event => { setField("programType", event.target.value); setField("cohortId", ""); }}><option value="">Select program</option>{programs.map(program => <option key={program}>{program}</option>)}</select></label>
    <label><span>Cohort / program start date</span><select className="select" required disabled={!institution} value={String(data.cohortId ?? "")} onChange={event => setField("cohortId", event.target.value)}><option value="">Select your cohort</option>{options.filter(option => option.program === data.programType).map(option => <option key={option.cohortId} value={option.cohortId}>{option.name} · {option.startDate ?? option.term ?? "Start date not recorded"}</option>)}</select></label>
    <ActionModal title="Request cohort assistance" triggerLabel="My cohort isn’t listed" busy={busy}><p>Institution staff will review your request. This does not create a cohort or enroll you automatically.</p><button className="button button-dark" disabled={busy || !institution} onClick={async () => { setBusy(true); try { const response = await fetch("/api/onboarding/cohorts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ institutionId: institution }) }); if (!response.ok) throw new Error(); setMessage("Request recorded. Contact your institution staff to finish cohort selection."); } catch { setMessage("Unable to request assistance. Please try again."); } finally { setBusy(false); } }}>Request staff assistance</button><p role="status">{message}</p></ActionModal>
    {message ? <p role="status">{message}</p> : null}
  </>;
}
