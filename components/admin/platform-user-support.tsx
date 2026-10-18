"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PendingSupportInvitation, PlatformAccount } from "@/lib/admin/platform-users";

type Preview = {
  name: string; role: string; scopeType: string; scopeId: string | null;
  accountStatus: string; expectedSections: string[];
};

export function PlatformUserSupport({ target, invitations }: {
  target: PlatformAccount; invitations: PendingSupportInvitation[];
}) {
  const router = useRouter();
  const active = target.memberships.filter(m => m.status.toLowerCase() === "active");
  const [membershipKey, setMembershipKey] = useState(active[0]?.key ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  async function post(action: "preview" | "support", input: Record<string, string>) {
    const result = await fetch(`/api/admin/users/${encodeURIComponent(target.authUserId)}/${action}`, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", Accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify({ reason, ...input }),
    });
    const body = (await result.json().catch(() => ({}))) as {
      ok?: boolean; error?: string; preview?: Preview;
    };
    if (!result.ok || !body.ok) throw new Error(body.error || "Support request failed.");
    return body;
  }

  async function openPreview(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setPreview(null); setMessage("");
    try {
      const result = await post("preview", { membershipKey });
      setPreview(result.preview ?? null);
      setMessage("Support preview recorded in the platform audit trail.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }

  async function handleInvitation(invitationId: string, action: "resend_pending_invitation" | "revoke_pending_invitation") {
    if (busy) return;
    if (reason.trim().length < 12) { setMessage("Enter a support reason of at least 12 characters first."); return; }
    if (action === "revoke_pending_invitation" && !window.confirm("Revoke this pending invitation? The recipient will no longer be able to accept it.")) return;
    setBusy(true); setMessage("");
    try {
      await post("support", { invitationId, action });
      setMessage(action === "resend_pending_invitation" ? "Invitation resent. Actor and reason audited." : "Invitation revoked. Actor and reason audited.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Support action unavailable."); }
    finally { setBusy(false); }
  }

  return <section className="card txk-admin-support" aria-label="Super Admin account support">
    <h2>View as · Audited support preview</h2>
    <p className="card-sub">Preview only: never logs in as this person, changes your role, issues credentials, or opens their private Workforce records. Your Super Admin identity remains the actor.</p>
    <form onSubmit={openPreview}>
      <label htmlFor="txk-admin-preview-member">Active role / organization scope</label>
      <select id="txk-admin-preview-member" value={membershipKey} onChange={event => { setMembershipKey(event.target.value); setPreview(null); }} disabled={busy || !active.length}>
        {active.map(m => <option key={m.key} value={m.key}>{m.role} · {m.scopeType}{m.scopeId ? " / " + m.scopeId : ""}</option>)}
      </select>
      {!active.length && <p className="txk-admin-small">No active role memberships to preview.</p>}
      <label htmlFor="txk-admin-support-reason" style={{ display: "block", marginTop: 14 }}>Required support reason (12–240 characters)</label>
      <textarea id="txk-admin-support-reason" value={reason} minLength={12} maxLength={240}
        onChange={event => setReason(event.target.value)}
        placeholder="Explain the support request; do not include private records or secrets." required />
      <button className="button button-dark" type="submit" disabled={busy || !active.length || reason.trim().length < 12}>
        {busy ? "Working…" : "Open audited View as preview"}
      </button>
    </form>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {preview && <section className="txk-admin-support-preview" aria-label="Read-only view as preview">
      <p className="eyebrow">Support preview — not impersonation</p>
      <h3>{preview.role} · {preview.scopeType}{preview.scopeId ? " / " + preview.scopeId : ""}</h3>
      <p>Account: {preview.name} · {preview.accountStatus}</p>
      <p className="txk-admin-small">Expected role navigation (no private records loaded):</p>
      <ul>{preview.expectedSections.map(item => <li key={item}>{item}</li>)}</ul>
      <p><strong>Actions in this preview are disabled.</strong> Supported delegation is listed below.</p>
    </section>}

    <section style={{ marginTop: 28 }}>
      <h3>Delegated invitation support</h3>
      <p className="card-sub">Only pending invitations for the verified account can be resent or revoked. These remain platform-admin actions, never actions taken as the user. Every request is audited.</p>
      {!invitations.length ? <p>No matching pending invitations for this account.</p> :
        invitations.map(invite => <div className="txk-admin-invitation-row" key={invite.invitationId}>
          <div><strong>{invite.role}</strong> · {invite.scopeType}{invite.scopeId ? " / " + invite.scopeId : ""}
            <p className="txk-admin-small">Delivery: {invite.deliveryStatus} · Expires: {new Date(invite.expiresAt).toLocaleDateString()}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy || reason.trim().length < 12} type="button" onClick={() => void handleInvitation(invite.invitationId, "resend_pending_invitation")}>Resend</button>
            <button disabled={busy || reason.trim().length < 12} type="button" onClick={() => void handleInvitation(invite.invitationId, "revoke_pending_invitation")}>Revoke</button>
          </div>
        </div>)}
    </section>
  </section>;
}
