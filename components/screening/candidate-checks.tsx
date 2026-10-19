"use client";
import { useState } from "react";
import type { CandidateCheck } from "@/lib/checkr/candidate";
export function CandidateChecks({ checks }: { checks: CandidateCheck[] }) {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  async function open(orderId: string) {
    setBusy(orderId); setError("");
    try {
      const r = await fetch("/api/checkr/candidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Invitation unavailable.");
      window.location.assign(result.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation unavailable."); setBusy(null); }
  }
  return <section className="card"><h2>My Checkr screening</h2>
    <p>Sandbox testing only. Complete disclosures and consent with Checkr. Screening completion does not mean an employment decision.</p>
    {error ? <p role="alert">{error}</p> : null}
    {checks.map(c => <article className="card" key={c.id}>
      <h3>{c.employerName}</h3><p>{c.packageName}</p>
      <p role="status">{c.reportStatus === "complete" ? "Screening complete" : c.invitationStatus ? `Invitation: ${c.invitationStatus}` : c.status.replaceAll("_", " ")}</p>
      {c.canOpen ? <button type="button" className="button button-dark" disabled={busy !== null} onClick={() => void open(c.id)}>{busy === c.id ? "Opening Checkr…" : "Continue with Checkr"}</button> : null}
    </article>)}
    {!checks.length ? <p>No Checkr invitations have been assigned to you.</p> : null}
  </section>;
}
