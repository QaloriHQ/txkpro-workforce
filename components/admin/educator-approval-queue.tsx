"use client";

import { useState } from "react";
import type {
  EducatorApprovalDecision,
  PendingEducatorApproval,
} from "@/lib/admin/types";

type Props = { initialItems: PendingEducatorApproval[] };

export function EducatorApprovalQueue({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function decide(
    membershipId: string,
    decision: EducatorApprovalDecision,
  ) {
    setBusyId(membershipId);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/educators/${encodeURIComponent(membershipId)}/approval`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Unable to update educator approval.",
        );
      }
      setItems((current) =>
        current.filter((item) => item.membershipId !== membershipId),
      );
      setMessage(
        decision === "approved"
          ? "Educator approved. Scoped Institution access is now active."
          : "Educator rejected. Pending access remains unavailable.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update educator approval.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {message ? (
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>Educator approvals</strong>
          {message}
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <h2>Educator approvals</h2>
            <p className="card-sub">
              TXKPRO Admins and scoped Institution Admins can approve educator
              access. The server re-checks scope and writes an audit event.
            </p>
          </div>
          <span className="pill">{items.length} pending</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Educator</th>
                <th>Institution</th>
                <th>Requested role</th>
                <th>Onboarding</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.membershipId}>
                    <td>
                      <strong>{item.educatorName}</strong>
                      <div className="muted">{item.educatorEmail ?? "—"}</div>
                      <div className="muted">{item.userId}</div>
                    </td>
                    <td>
                      <strong>{item.institutionName}</strong>
                      <div className="muted">{item.institutionId ?? "—"}</div>
                    </td>
                    <td>
                      <span className="pill">{item.role}</span>
                      <div className="muted">
                        {item.scopeType}
                        {item.scopeId ? ` · ${item.scopeId}` : ""}
                      </div>
                    </td>
                    <td>
                      <span className="pill">
                        {item.onboardingStatus ?? "pending_review"}
                      </span>
                    </td>
                    <td>
                      {item.submittedAt
                        ? new Date(item.submittedAt).toLocaleString()
                        : item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : "—"}
                    </td>
                    <td>
                      <div className="header-actions">
                        <button
                          className="button button-brand button-small"
                          type="button"
                          disabled={busyId === item.membershipId}
                          onClick={() => decide(item.membershipId, "approved")}
                        >
                          {busyId === item.membershipId ? "Saving…" : "Approve"}
                        </button>
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={busyId === item.membershipId}
                          onClick={() => decide(item.membershipId, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <strong>No Educator approvals waiting</strong>
                      New educator submissions will appear here.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
