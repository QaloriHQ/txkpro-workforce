"use client";

import { FormEvent, useMemo, useState } from "react";
import { Card, EmptyState, StatusBadge } from "@/components/design-system";
import type {
  InvitationCreateResult,
  InvitationRecord,
} from "@/lib/invitations/types";

export type InvitationRoleOption = {
  value: string;
  label: string;
  description: string;
};

export type InvitationScopeOption = {
  scopeType: string;
  scopeId: string | null;
  label: string;
  description?: string;
};

function statusTone(status: string) {
  if (status === "accepted") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "expired") return "neutral" as const;
  return "danger" as const;
}

export function InvitationManager({
  initial,
  roles,
  scopes,
  title,
  description,
}: {
  initial: InvitationRecord[];
  roles: InvitationRoleOption[];
  scopes: InvitationScopeOption[];
  title: string;
  description: string;
}) {
  const [items, setItems] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [scopeKey, setScopeKey] = useState("0");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  const selectedScope = scopes[Number(scopeKey)] ?? scopes[0];
  const selectedRole = useMemo(
    () => roles.find((item) => item.value === role),
    [role, roles],
  );

  async function refresh() {
    const response = await fetch("/api/invitations", { credentials: "include" });
    const result = (await response.json().catch(() => ({}))) as {
      invitations?: InvitationRecord[];
    };
    if (response.ok && result.invitations) {
      const roleSet = new Set(roles.map((item) => item.value));
      const scopeSet = new Set(
        scopes.map((item) => `${item.scopeType}:${item.scopeId ?? ""}`),
      );
      setItems(
        result.invitations.filter(
          (item) =>
            roleSet.has(item.role) &&
            scopeSet.has(`${item.scopeType}:${item.scopeId ?? ""}`),
        ),
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setActivationUrl(null);
    const response = await fetch("/api/invitations", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        role,
        scopeType: selectedScope.scopeType,
        scopeId: selectedScope.scopeId,
        metadata: { source: "invitation_manager" },
      }),
    });
    const result = (await response.json().catch(() => ({}))) as
      InvitationCreateResult & { error?: string };
    setBusy(false);
    if (!response.ok || result.error) {
      setMessage(result.error || "Unable to create invitation.");
      return;
    }
    setEmail("");
    setActivationUrl(result.activationUrl ?? null);
    setMessage(
      result.alreadyMember
        ? "That user already has the active role/scope."
        : result.idempotent
          ? "A pending invitation already exists for that user and scope."
          : result.deliveryStatus === "failed"
            ? `Invitation created, but email delivery failed (${result.deliveryError ?? "delivery_failed"}). Use the activation link as a manual fallback or resend after email delivery is corrected.`
            : result.deliveryStatus === "sent"
              ? "Invitation sent."
              : "Invitation created and queued for delivery.",
    );
    await refresh();
  }

  async function lifecycle(invitationId: string, action: "resend" | "revoke") {
    setBusy(true);
    setMessage(null);
    setActivationUrl(null);
    const response = await fetch(`/api/invitations/${encodeURIComponent(invitationId)}/${action}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: action === "revoke" ? JSON.stringify({ reason: "manager_action" }) : "{}",
    });
    const result = (await response.json().catch(() => ({}))) as
      InvitationCreateResult & { error?: string };
    setBusy(false);
    if (!response.ok || result.error) {
      setMessage(result.error || `Unable to ${action} invitation.`);
      return;
    }
    if ("activationUrl" in result) setActivationUrl(result.activationUrl ?? null);
    setMessage(
      action === "resend"
        ? result.deliveryStatus === "failed"
          ? `A new activation link was created, but email delivery failed (${result.deliveryError ?? "delivery_failed"}).`
          : result.deliveryStatus === "sent"
            ? "Invitation resent."
            : "Invitation queued for resend."
        : "Invitation revoked.",
    );
    await refresh();
  }

  return (
    <section className="txk-section">
      <div className="txk-section-heading">
        <div>
          <p className="txk-eyebrow">Canonical invitations</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <Card>
        <form className="institution-student-directory-filters" onSubmit={submit}>
          <label className="institution-filter-search">
            <span>Email</span>
            <div>
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
              />
            </div>
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {roles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Scope</span>
            <select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)}>
              {scopes.map((item, index) => (
                <option key={`${item.scopeType}:${item.scopeId ?? "platform"}`} value={String(index)}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="txk-button txk-button-primary txk-button-md" disabled={busy || !role || !selectedScope} type="submit">
            {busy ? "Working…" : "Invite"}
          </button>
        </form>
        {selectedRole ? <p className="txk-muted-text">{selectedRole.description}</p> : null}
        {selectedScope?.description ? <p className="txk-muted-text">{selectedScope.description}</p> : null}
        {message ? <div className="alert" style={{ marginTop: 12 }}>{message}</div> : null}
        {activationUrl ? (
          <div className="alert" style={{ marginTop: 12 }}>
            Activation link: <code>{activationUrl}</code>
          </div>
        ) : null}
      </Card>

      <div className="institution-evidence-stack" style={{ marginTop: 18 }}>
        {items.length ? (
          items.map((item) => (
            <Card key={item.invitationId}>
              <div className="institution-student-directory-head">
                <div>
                  <strong>{item.email}</strong>
                  <span>
                    {item.role.replaceAll("_", " ")} · {item.scopeType}
                    {item.scopeId ? `:${item.scopeId}` : ""}
                  </span>
                  <small>
                    Delivery {item.deliveryStatus} · expires{" "}
                    {new Date(item.expiresAt).toLocaleString()}
                  </small>
                </div>
                <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
              </div>
              <div className="institution-student-directory-footer">
                <span>
                  {item.acceptedAt
                    ? `Accepted ${new Date(item.acceptedAt).toLocaleString()}`
                    : `${item.resendCount} resends · ${item.invitationId}`}
                </span>
                {item.status === "pending" && item.canManage ? (
                  <span className="txk-reference-row">
                    <button className="txk-button txk-button-default txk-button-sm" disabled={busy} type="button" onClick={() => lifecycle(item.invitationId, "resend")}>
                      Resend
                    </button>
                    <button className="txk-button txk-button-danger txk-button-sm" disabled={busy} type="button" onClick={() => lifecycle(item.invitationId, "revoke")}>
                      Revoke
                    </button>
                  </span>
                ) : null}
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState
              title="No invitations in your authorized scope"
              description="Create an invitation to queue activation and a pending scoped membership."
            />
          </Card>
        )}
      </div>
    </section>
  );
}
