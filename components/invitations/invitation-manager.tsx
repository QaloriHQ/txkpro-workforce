"use client";

import { ActionModal, WorkspaceForm } from "@/components/design-system/action-modal";

import { useRouter } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { FormEvent, useMemo, useState, type ComponentPropsWithRef } from "react";
import { Card, EmptyState, StatusBadge } from "@/components/design-system";
import type {
  UserInvitationCreateResult,
  UserInvitationSummary,
} from "@/lib/invitations/service";

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
  institutionId?: string;
  employerId?: string;
  allowedRoles?: string[];
};

function statusTone(status: string) {
  if (status === "accepted") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "expired") return "neutral" as const;
  return "danger" as const;
}

function InvitationForm({ inline, busy, children, ...props }: ComponentPropsWithRef<"form"> & {inline: boolean; busy: boolean}) {
  return inline ? <form {...props}><fieldset disabled={busy} className="invitation-fields">{children}</fieldset></form> : <WorkspaceForm modalTitle="Invite user" busy={busy} {...props}>{children}</WorkspaceForm>;
}

export function InvitationManager({
  initial,
  roles,
  scopes,
  title,
  description,
  tenantFilter = "",
  compact = false,
}: {
  initial: UserInvitationSummary[];
  roles: InvitationRoleOption[];
  scopes: InvitationScopeOption[];
  title: string;
  description: string;
  tenantFilter?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [localItems, setLocalItems] = useState<{source: UserInvitationSummary[]; items: UserInvitationSummary[]} | null>(null);
  const items = localItems?.source === initial ? localItems.items : initial;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [scopeKey, setScopeKey] = useState("0");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);


  const availableScopes = scopes.filter(s => !s.allowedRoles || s.allowedRoles.includes(role));
  const selectedScope = availableScopes[Number(scopeKey)] ?? availableScopes[0];
  const selectedRole = useMemo(
    () => roles.find((item) => item.value === role),
    [role, roles],
  );

  async function refresh() {
    const response = await fetch(`/api/invitations${tenantFilter}`, { credentials: "include", cache: "no-store" });
    const result = (await response.json().catch(() => ({}))) as {
      data?: UserInvitationSummary[];
    };
    if (response.ok && result.data) setLocalItems({source: initial, items: result.data});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedScope) return;
    setBusy(true);
    setMessage(null);
    try {
    const response = await fetch("/api/invitations", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        role,
        scopeType: selectedScope.scopeType,
        scopeId: selectedScope.scopeId,
        institutionId: selectedScope.institutionId,
        employerId: selectedScope.employerId,
      }),
    });
    const result = await response.json().catch(() => ({})) as {
      error?: string;
      data?: Array<{ invitation: UserInvitationCreateResult; delivery?: { delivered: boolean } | null }>;
    };
    setBusy(false);
    if (!response.ok) { setMessage(result.error || "Unable to create invitation."); return; }
    const item = result.data?.[0];
    setEmail("");
    setFirstName("");
    setLastName("");
    setMessage(item?.invitation.created === false ? "A pending invitation already exists. No duplicate email was sent." : item?.delivery?.delivered ? "Invitation emailed." : "Invitation saved. Email delivery failed; use Resend after correcting delivery settings.");
    await refresh();
    router.refresh();
    } catch { setMessage("Connection failed. Refresh before retrying to check the saved invitation."); } finally { setBusy(false); }
  }

  async function lifecycle(invitationId: string, action: "resend" | "revoke" | "cancel" | "approved" | "rejected") {
    setBusy(true);
    setMessage(null);
    try {
    const isApproval = action === "approved" || action === "rejected";
    const response = await fetch(`/api/invitations/${encodeURIComponent(invitationId)}/${isApproval ? "approval" : action === "cancel" ? "revoke" : action}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isApproval ? { decision: action } : action === "resend" ? { requestKey: crypto.randomUUID() } : { mode: action === "cancel" ? "cancelled" : "revoked" }),
    });
    const result = (await response.json().catch(() => ({}))) as
      UserInvitationCreateResult & { error?: string };
    setBusy(false);
    if (!response.ok || result.error) {
      setMessage(result.error || `Unable to ${action} invitation.`);
      return;
    }
    setMessage(action === "resend" ? "Invitation emailed." : isApproval ? "Membership decision saved." : "Invitation closed.");
    await refresh();
    router.refresh();
    } catch { setMessage("Connection failed. Refresh before retrying to check the saved invitation."); } finally { setBusy(false); }
  }

  const content = (
    <section className="txk-section">
      <div className="txk-section-heading">
        <div>
          <p className="txk-eyebrow">Invitations</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="institution-action-bar">
        <InvitationForm inline={compact} busy={Boolean(busy)} className="institution-student-directory-filters" onSubmit={submit}>
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
            <span>First name (optional)</span><input value={firstName} maxLength={100} onChange={event => setFirstName(event.target.value)} /></label>
          <label><span>Last name (optional)</span><input value={lastName} maxLength={100} onChange={event => setLastName(event.target.value)} /></label>
          <label><span>Role</span>
            <select value={role} onChange={(event) => { setRole(event.target.value); setScopeKey("0"); }}>
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
              {availableScopes.map((item, index) => (
                <option key={`${item.scopeType}:${item.scopeId ?? "platform"}`} value={String(index)}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="txk-button txk-button-primary txk-button-md" disabled={busy || !role || !selectedScope} type="submit">
            {busy ? "Working…" : "Invite"}
          </button>
        {selectedRole ? <p className="txk-muted-text">{selectedRole.description}</p> : null}
        {selectedScope?.description ? <p className="txk-muted-text">{selectedScope.description}</p> : null}
        {message ? <div role="status" aria-live="polite" className="alert" style={{ marginTop: 12 }}>{message}</div> : null}
        </InvitationForm>
      </div>

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
                {item.activationPolicy === "approval_required" ? <span>Institution approval required</span> : null}
              </div>
              <div className="institution-student-directory-footer">
                {item.status === "accepted" && item.membershipStatus === "pending" && item.canApprove ? <span>
                  <button className="txk-button txk-button-default txk-button-sm" type="button" disabled={busy} onClick={() => lifecycle(item.invitationId, "approved")}>Approve access</button>
                  <button className="txk-button txk-button-danger txk-button-sm" type="button" disabled={busy} onClick={() => lifecycle(item.invitationId, "rejected")}>Reject access</button>
                </span> : null}
                <span>
                  {(item.status === "accepted")
                    ? "Accepted"
                    : `${item.sendCount} email attempts · ${item.invitationId}`}
                </span>
                {item.status === "pending" ? (
                  <span className="txk-reference-row">
                    <button className="txk-button txk-button-default txk-button-sm" disabled={busy} type="button" onClick={() => lifecycle(item.invitationId, "resend")}>
                      Resend
                    </button>
                    <ActionModal title="Revoke invitation" triggerLabel="Revoke" busy={busy}><p>This closes the pending invitation. The activation link will no longer grant access.</p><button className="txk-button txk-button-danger txk-button-md" disabled={busy} onClick={() => lifecycle(item.invitationId, "revoke")}>Revoke invitation</button></ActionModal>
                    <ActionModal title="Cancel invitation" triggerLabel="Cancel" busy={busy}><p>This closes the pending invitation without granting membership.</p><button className="txk-button txk-button-danger txk-button-md" disabled={busy} onClick={() => lifecycle(item.invitationId, "cancel")}>Cancel invitation</button></ActionModal>
                  </span>
                ) : null}
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState
              title="No invitations in your authorized scope"
              description="Create an invitation to email activation and a pending scoped membership."
            />
          </Card>
        )}
      </div>
    </section>
  );
  return compact ? <ActionModal title="Add people & manage invitations" triggerLabel="Add person" triggerContent={<><PlusIcon className="txk-icon" aria-hidden="true" /> Add person</>} busy={busy}>{content}</ActionModal> : content;
}
