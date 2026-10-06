"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";
export type ScreeningWorkspace = {
  enabled: boolean;
  canManage: boolean;
  canOrder: boolean;
  members: { userId: string; name: string }[];
  permissions: {
    user_id: string;
    can_order: boolean;
    can_review: boolean;
    monthly_limit_cents: number;
    approval_above_cents: number;
  }[];
  bundles: { id: string; name: string; checks: string[] }[];
  orders: { id: string; status: string; audience: string; createdAt: string }[];
};
export function ScreeningPanel({
  data,
  employerId,
}: {
  data: ScreeningWorkspace;
  employerId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, op: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input =
      op === "permission"
        ? {
            userId: form.get("userId"),
            canOrder: form.has("canOrder"),
            canReview: form.has("canReview"),
            monthlyLimitCents: form.get("monthlyLimitCents"),
            approvalAboveCents: form.get("approvalAboveCents"),
          }
        : {
            name: form.get("name"),
            checks: String(form.get("checks"))
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          };
    setBusy(true);
    setFeedback("");
    try {
      const r = await fetch("/api/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, op, employerId }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Unable to save.");
      setFeedback("Saved. Close the editor to continue.");
      router.refresh();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const status = (
    <p role="status" aria-live="polite">
      {feedback}
    </p>
  );
  return (
    <section className="screening-workspace">
      <div className="screening-gate">
        <strong>
          Background-check ordering is awaiting provider confirmation
        </strong>
        <p>
          Authenticate must confirm an employment-approved product, support for
          minors and required consent. No checks or report emails are sent from
          this page. Reports will remain with Authenticate; TXKPRO will display
          order and status information.
        </p>
      </div>
      {data.canManage ? (
        <article className="card">
          <h2>Ordering permissions and spending controls</h2>
          <p>
            Monthly spending limits include pending reservations. Approval above
            a price threshold never overrides the monthly limit. Saved
            permissions do not enable ordering.
          </p>
          <WorkspaceForm
            modalTitle="Set screening permissions"
            busy={busy}
            feedback={status}
            onSubmit={(e) => void submit(e, "permission")}
          >
            <fieldset disabled={busy}>
              <label className="pro-field">
                Workspace member
                <select name="userId" required defaultValue="">
                  <option value="" disabled>
                    Select member
                  </option>
                  {data.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input name="canOrder" type="checkbox" /> Can order checks
              </label>
              <label>
                <input name="canReview" type="checkbox" /> Can review / approve
                orders
              </label>
              <label className="pro-field">
                Monthly spending limit (USD cents)
                <input
                  name="monthlyLimitCents"
                  type="number"
                  min="0"
                  max="100000000"
                  required
                />
              </label>
              <label className="pro-field">
                Approval required above (USD cents)
                <input
                  name="approvalAboveCents"
                  type="number"
                  min="0"
                  max="100000000"
                  required
                />
              </label>
              <button
                className="button button-dark"
                type="submit"
                disabled={busy}
              >
                Save permissions
              </button>
            </fieldset>
          </WorkspaceForm>
          {data.permissions.map((p) => (
            <p key={p.user_id}>
              {data.members.find((m) => m.userId === p.user_id)?.name ||
                "Workspace member"}{" "}
              · order {p.can_order ? "allowed" : "disabled"} · review{" "}
              {p.can_review ? "allowed" : "disabled"} · monthly $
              {(p.monthly_limit_cents / 100).toFixed(2)} · approval above $
              {(p.approval_above_cents / 100).toFixed(2)}
            </p>
          ))}
        </article>
      ) : null}
      <article className="card">
        <h2>Saved check bundles</h2>
        <p className="card-sub">
          Draft bundles for applicants or employees. Check names require mapping
          to provider-approved products before ordering.
        </p>
        {data.canOrder ? (
          <WorkspaceForm
            modalTitle="Save draft check bundle"
            busy={busy}
            feedback={status}
            onSubmit={(e) => void submit(e, "bundle")}
          >
            <fieldset disabled={busy}>
              <label className="pro-field">
                Bundle name
                <input name="name" maxLength={100} required />
              </label>
              <label className="pro-field">
                Check names (one per line, maximum 15)
                <textarea name="checks" maxLength={1515} required />
              </label>
              <button
                className="button button-dark"
                type="submit"
                disabled={busy}
              >
                Save draft bundle
              </button>
            </fieldset>
          </WorkspaceForm>
        ) : null}
        {data.bundles.length ? (
          data.bundles.map((b) => (
            <div key={b.id}>
              <h3>{b.name}</h3>
              <p>{b.checks.join(" · ")}</p>
            </div>
          ))
        ) : (
          <p>No saved bundles.</p>
        )}
      </article>
      <article className="card">
        <h2>Order status</h2>
        {data.orders.length ? (
          data.orders.map((o) => (
            <p key={o.id}>
              {o.audience} · {o.status.replaceAll("_", " ")} ·{" "}
              {new Date(o.createdAt).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}
            </p>
          ))
        ) : (
          <p>No orders. Ordering remains disabled.</p>
        )}
      </article>
      {status}
    </section>
  );
}
