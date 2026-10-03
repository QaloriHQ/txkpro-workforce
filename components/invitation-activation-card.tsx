"use client";

import { FormEvent, useState } from "react";
import { CheckCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

type Props = {
  invitationId: string;
  email: string;
  role: string;
  scopeType: string;
  organizationName: string;
  status: string;
  activationPolicy: "auto_activate" | "approval_required";
  expiresAt: string;
  recipientExistingIdentity: boolean;
};

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function InvitationActivationCard({
  invitationId,
  email,
  role,
  scopeType,
  organizationName,
  status,
  activationPolicy,
  expiresAt,
  recipientExistingIdentity,
}: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = status === "pending";
  const accepted = status === "accepted";

  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
    const response = await fetch(
      `/api/invitations/${encodeURIComponent(invitationId)}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      data?: { redirectTo?: string };
    };
    if (!response.ok) {
      setMessage(payload.error ?? "Invitation activation failed.");
      return;
    }
    window.location.assign(payload.data?.redirectTo ?? "/");
    } catch {
      setMessage("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="callout" style={{ marginTop: 18 }}>
        <ShieldCheckIcon aria-hidden="true" width={22} height={22} />
        <strong>Server-authorized invitation</strong>
        <span>
          Your email identity must match this invitation. The role and scope
          shown here come from TXKPRO&apos;s canonical invitation record and
          cannot be changed from this page.
        </span>
      </div>

      <dl className="invitation-activation-details">
        <div>
          <dt>Organization</dt>
          <dd>{organizationName}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{label(role)}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{label(scopeType)}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{label(status)}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{new Date(expiresAt).toLocaleString()}</dd>
        </div>
      </dl>

      {active && activationPolicy === "approval_required" ? (
        <div className="alert" style={{ marginTop: 18 }}>
          Accepting confirms your identity and links the requested membership.
          An authorized Institution approver must activate the membership before
          scoped staff access becomes available.
        </div>
      ) : null}

      {active || accepted ? (
        <form className="form-stack" onSubmit={accept}>
          {active && !recipientExistingIdentity ? (
            <label>
              <span>Choose a password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small className="muted">
                At least 8 characters. This is required only for a newly
                invited TXKPRO account.
              </small>
            </label>
          ) : null}
          <button className="button button-dark button-block" disabled={busy}>
            <CheckCircleIcon aria-hidden="true" width={20} height={20} />
            {busy ? "Activating…" : accepted ? "Continue" : "Accept invitation"}
          </button>
        </form>
      ) : (
        <div className="alert" style={{ marginTop: 18 }}>
          This invitation is {status}. Ask the authorized organization
          administrator to send a new invitation.
        </div>
      )}

      {message ? (
        <div className="alert" role="alert" style={{ marginTop: 14 }}>
          {message}
        </div>
      ) : null}
    </>
  );
}
