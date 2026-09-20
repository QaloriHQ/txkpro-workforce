"use client";

import { useState } from "react";
import type { PendingEmployerApproval } from "@/lib/admin/types";

type Props = { initialItems: PendingEmployerApproval[] };

export function EmployerApprovalQueue({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function decide(
    employerId: string,
    decision: "approved" | "rejected",
  ) {
    setBusyId(employerId);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/employers/${encodeURIComponent(employerId)}/approval`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Unable to update Employer.",
        );
      }
      setItems((current) =>
        current.filter((item) => item.employerId !== employerId),
      );
      setMessage(
        decision === "approved"
          ? "Employer approved. Linked onboarding is now complete."
          : "Employer rejected.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update Employer.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {message ? (
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>Employer approvals</strong>
          {message}
        </div>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2>Employer approvals</h2>
            <p className="card-sub">
              Review Employer onboarding submissions before Talent and
              approval-gated hiring access is enabled.
            </p>
          </div>
          <span className="pill">{items.length} pending</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employer</th>
                <th>Owner</th>
                <th>Onboarding</th>
                <th>Workforce</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.employerId}>
                    <td>
                      <strong>{item.businessName}</strong>
                      <div className="muted">{item.employerId}</div>
                      {item.website ? (
                        <div className="muted">{item.website}</div>
                      ) : null}
                    </td>
                    <td>
                      <strong>{item.ownerName}</strong>
                      <div className="muted">{item.ownerEmail ?? "—"}</div>
                      <div className="muted">{item.phone ?? "—"}</div>
                    </td>
                    <td>
                      <span className="pill">
                        {item.onboardingStatus ?? "pending_review"}
                      </span>
                    </td>
                    <td>{item.workforceStatus ?? "pending"}</td>
                    <td>
                      {item.onboardingSubmittedAt
                        ? new Date(item.onboardingSubmittedAt).toLocaleString()
                        : item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : "—"}
                    </td>
                    <td>
                      <div className="header-actions">
                        <button
                          className="button button-brand button-small"
                          type="button"
                          disabled={busyId === item.employerId}
                          onClick={() => decide(item.employerId, "approved")}
                        >
                          {busyId === item.employerId ? "Saving…" : "Approve"}
                        </button>
                        <button
                          className="button button-ghost button-small"
                          type="button"
                          disabled={busyId === item.employerId}
                          onClick={() => decide(item.employerId, "rejected")}
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
                      <strong>No Employer approvals waiting</strong>
                      New Employer submissions will appear here.
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
