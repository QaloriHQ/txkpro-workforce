"use client";

import { useState } from "react";
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
      body: JSON.stringify(action === "support" ? { reason, ...input } : input),
    });
    const body = (await result.json().catch(() => ({}))) as {
      ok?: boolean; error?: string; preview?: Preview;
    };
    if (!result.ok || !body.ok) throw new Error(body.error || "Support request failed.");
    return body;
  }

  async function openPreview() {
    if (busy) return;
    setBusy(true); setPreview(null); setMessage("");
    try {
      const result = await post("preview", { membershipKey });
      setPreview(result.preview ?? null);
      setMessage("Read-only preview ready. No request or notification was sent to this user.");
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
    <h2>View as · Read-only preview</h2>
    <p className="card-sub">Open a support view instantly. The selected user is not asked for permission or notified. Your authenticated Super Admin identity remains unchanged, and private user records are not loaded.</p>
    <div className="txk-admin-user-tools">
      <label htmlFor="txk-admin-preview-member">Active role / organization scope</label>
      <select id="txk-admin-preview-member" value={membershipKey} onChange={event => { setMembershipKey(event.target.value); setPreview(null); }} disabled={busy || !active.length}>
        {active.map(m => <option key={m.key} value={m.key}>{m.role} · {m.scopeType}{m.scopeId ? " / " + m.scopeId : ""}</option>)}
      </select>
      {!active.length && <p className="txk-admin-small">No active role memberships to preview.</p>}
      <button className="button button-dark" type="button" disabled={busy || !active.length}
        onClick={() => void openPreview()}>
        {busy ? "Opening…" : "View as"}
      </button>
    </div>
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
      <label htmlFor="txk-admin-support-reason" style={{ display: "block", marginTop: 14 }}>Support reason required for invitation changes (12–240 characters)</label>
      <textarea id="txk-admin-support-reason" value={reason} minLength={12} maxLength={240}
        onChange={event => setReason(event.target.value)}
        placeholder="Why do you need to resend or revoke this invitation?" />
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
