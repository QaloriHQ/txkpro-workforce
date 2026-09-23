"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PrivateNoteForm({
  studentId,
  referralId,
}: {
  studentId: string;
  referralId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "").trim();
    if (!note) return;

    setBusy(true);
    setMessage("");
    const response = await fetch(
      `/api/employer/talent/${encodeURIComponent(studentId)}/notes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, referralId: referralId ?? null }),
      },
    );
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(
        typeof body?.error === "string" ? body.error : "Unable to save note.",
      );
      return;
    }

    event.currentTarget.reset();
    setMessage("Private note saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <label>
        <span className="field-title">Employer-private note</span>
        <textarea
          className="textarea"
          name="note"
          maxLength={4000}
          placeholder="Visible only to authorized users in your Employer account."
          required
        />
      </label>
      <div className="hero-actions" style={{ marginTop: 10 }}>
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add private note"}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}
