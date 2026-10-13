"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, FormField, Input, Textarea } from "@/components/design-system";
import type { ReviewContext } from "@/lib/professional-profile/reviews";

export function ReviewComposer({ targetPath }: { targetPath: string }) {
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/professional/reviews?path=${encodeURIComponent(targetPath)}`)
      .then(async response => {
        if (!active) return;
        if (response.status === 401) { setSignedOut(true); return; }
        const payload = await response.json();
        if (response.ok) setContext(payload.context);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [targetPath]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/professional/reviews?path=${encodeURIComponent(targetPath)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: Number(form.get("rating")), title: String(form.get("title") || ""), body: String(form.get("body") || "") }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setContext(payload.context); setMessage("Review submitted for moderation."); }
    else setMessage(payload.error || "Review could not be saved.");
    setSaving(false);
  }

  if (signedOut) return <Card><h2>Share a review</h2><p>Eligible Workforce members can review this Educator after signing in.</p><Link className="txk-button txk-button-default txk-button-md" href={`/login?returnTo=${encodeURIComponent(targetPath)}`}>Sign in</Link></Card>;
  if (!context) return null;
  if (!context.eligible) return <Card><h2>Share a review</h2><p className="muted">{context.reason || "Your account is not eligible to review this profile."}</p></Card>;
  return <Card><h2>{context.review ? "Revise your review" : "Share a review"}</h2><p className="muted">One review per member. Revisions return to moderation. Only published reviews affect the rating.</p><form onSubmit={submit} className="txk-form-grid">
    <FormField label="Rating"><select className="txk-input" name="rating" defaultValue={context.review?.rating || 5} required>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></FormField>
    <FormField label="Title"><Input name="title" defaultValue={context.review?.title || ""} maxLength={120} /></FormField>
    <FormField label="Review"><Textarea name="body" defaultValue={context.review?.body || ""} minLength={20} maxLength={3000} rows={5} required /></FormField>
    {context.review ? <p className="muted">Current status: {context.review.status}</p> : null}
    <Button tone="primary" disabled={saving}>{saving ? "Submitting…" : "Submit review"}</Button>
    {message ? <p className="alert" role="status">{message}</p> : null}
  </form></Card>;
}

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const [message, setMessage] = useState("");
  async function report() {
    const response = await fetch(`/api/professional/reviews/${encodeURIComponent(reviewId)}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "other" }) });
    setMessage(response.ok ? "Reported for review." : "Sign in to report this review.");
  }
  return <span className="professional-review-report"><button className="text-link" type="button" onClick={report}>Report</button>{message ? <small role="status">{message}</small> : null}</span>;
}
