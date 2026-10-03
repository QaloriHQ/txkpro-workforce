"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export function AccessRequestForm() {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/marketing/access-requests", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to submit. Please try again."); return; }
      setSubmitted(true);
    } catch { setError("Connection failed. Please try again."); } finally { setBusy(false); }
  }

  if (submitted) return <div className="card" role="status"><h2>Request received</h2><p>TXKPRO will review your request and follow up. Approved access is provided by invitation.</p><Link href="/login">Already invited? Sign in</Link></div>;
  return <form className="card form-stack" onSubmit={submit}>
    <label><span>Name (required)</span><input className="input" name="contactName" autoComplete="name" maxLength={120} required /></label>
    <label><span>Email (required)</span><input className="input" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label><span>I am a (required)</span><select className="select" name="role" required><option value="student">Student</option><option value="educator">Institution / educator</option><option value="employer">Employer</option></select></label>
    <label><span>Request (required)</span><select className="select" name="intent" required><option value="access">Access</option><option value="demo">Demo</option><option value="both">Demo and access</option></select></label>
    <label><span>Institution or company (optional)</span><input className="input" name="organizationName" autoComplete="organization" maxLength={160} /></label>
    <label><span>How can TXKPRO help? (optional)</span><textarea className="input" name="message" rows={4} maxLength={2000} /></label>
    <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <p className="muted">Submitting a request does not create an account. TXKPRO will contact you about next steps.</p>
    {error ? <p className="alert" role="alert">{error}</p> : null}
    <button className="button button-brand" type="submit" disabled={busy}>{busy ? "Submitting…" : "Send request"}</button>
  </form>;
}
