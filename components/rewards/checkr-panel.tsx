"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionModal } from "@/components/design-system/action-modal";
import { ShieldCheckIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import type { CheckrWorkspace } from "@/lib/checkr/server";
import type { CheckrPackage, CheckrNode } from "@/lib/checkr/contracts";
// JavaScript SDK: avoids the provider's React adapter (documented through React 18).
declare global {
  interface Window {
    Checkr?: {
      Embeds: {
        SignUpFlow: new (options: Record<string, unknown>) => {
          modal: () => void;
        };
      };
    };
  }
}
let sdk: Promise<void> | undefined;
function loadSDK() {
  if (window.Checkr) return Promise.resolve();
  if (!sdk)
    sdk = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@checkr/web-sdk/dist/web-sdk.umd.js";
      script.onload = () => resolve();
      script.onerror = () => {
        sdk = undefined;
        script.remove();
        reject(new Error("Unable to load Checkr setup. Try again."));
      };
      document.head.appendChild(script);
    });
  return sdk;
}
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
export function CheckrPanel({
  employerId,
  data,
  configured,
  orderingEnabled,
}: {
  employerId: string;
  data: CheckrWorkspace;
  configured: boolean;
  orderingEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const [packages, setPackages] = useState<CheckrPackage[]>([]),
    [nodes, setNodes] = useState<CheckrNode[]>([]),
    [node, setNode] = useState("");
  const [selected, setSelected] = useState(""),
    [subject, setSubject] = useState(""),
    [state, setState] = useState("TX"),
    [city, setCity] = useState("");
  const [quote, setQuote] = useState<{
      id: string;
      baseCents: number;
      packageName: string;
      expiresAt: string;
    } | null>(null),
    [orderId, setOrderId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  async function call(op: string, input: Record<string, unknown> = {}) {
    const r = await fetch("/api/checkr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, employerId, ...input }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Checkr request not confirmed.");
    return result;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback("");
    try {
      await action();
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : "Checkr request not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    await run(async () => {
      const setup = await call("setup");
      await loadSDK();
      if (!window.Checkr) throw new Error("Checkr setup unavailable");
      new window.Checkr.Embeds.SignUpFlow({
        env: "staging",
        oauthTokenPath: `/api/checkr/oauth?employer=${encodeURIComponent(employerId)}`,
        partner: { id: setup.clientId, name: "TXKPRO Workforce" },
      }).modal();
      setFeedback("Finish Checkr setup, then refresh your connection.");
    });
  }
  async function refreshCatalog() {
    await run(async () => {
      const result = await call("catalog");
      setPackages(result.packages);
      setNodes(result.nodes);
      setNode("");
      setSelected("");
      setQuote(null);
      setFeedback(
        result.credentialed
          ? "Catalog refreshed from your Checkr account."
          : "Checkr is reviewing your employer account.",
      );
      router.refresh();
    });
  }
  function resetQuote() {
    setQuote(null);
    setAck(false);
  }
  const person = data.subjects.find((s) => `${s.audience}:${s.id}` === subject);
  const visible = nodes.length
    ? nodes.find((n) => n.id === node)?.packages.length
      ? packages.filter((p) =>
          nodes.find((n) => n.id === node)?.packages.includes(p.slug),
        )
      : node
        ? packages
        : []
    : packages;
  return (
    <section className="checkr-workspace">
      <article className="card checkr-connection">
        <div>
          <h2>
            <ShieldCheckIcon aria-hidden="true" /> Checkr screening
          </h2>
          <p>
            Order employment screening packages and follow progress in your
            workspace. Reports and candidate consent remain with Checkr.
          </p>
          <p className="pill">
            Sandbox ·{" "}
            {data.connected
              ? data.credentialed
                ? "Employer approved"
                : "Employer review pending"
              : "Not connected"}
          </p>
        </div>
        {!configured ? (
          <p role="status">
            Checkr partner credentials are required to connect. No checks or
            screening payments are being taken.
          </p>
        ) : (
          <div className="checkr-actions">
            {data.canManage ? (
              <button
                className="button button-dark"
                disabled={busy}
                onClick={() => void connect()}
              >
                Set up / connect Checkr
              </button>
            ) : null}
            {data.connected ? (
              <button
                className="button"
                disabled={busy}
                onClick={() => void refreshCatalog()}
              >
                Refresh connection and catalog
              </button>
            ) : null}
          </div>
        )}
        <p className="card-sub">
          US adults only during this release. Eligibility details must be
          recorded by the recipient; they do not replace Checkr’s screening
          consent. Minors remain unavailable.
        </p>
      </article>
      <article className="card">
        <h2>Screening gallery</h2>
        <p>
          Packages and base prices come from your employer’s Checkr account.
          Access fees may be additional. Custom combinations must be configured
          with Checkr.
        </p>
        {!packages.length ? (
          <p>
            Connect Checkr and refresh the catalog to see available packages.
          </p>
        ) : (
          <ActionModal
            title="Choose screening and review order"
            triggerLabel="Browse packages"
            busy={busy}
            onClose={() => {
              setOrderId(null);
              resetQuote();
            }}
          >
            <fieldset
              disabled={busy || Boolean(orderId)}
              className="checkr-fields"
            >
              <label className="pro-field">
                Applicant or employee
                <select
                  required
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    resetQuote();
                  }}
                >
                  <option value="">Select person</option>
                  {data.subjects.map((s) => (
                    <option
                      key={`${s.audience}:${s.id}`}
                      value={`${s.audience}:${s.id}`}
                    >
                      {s.name} · {s.audience}
                    </option>
                  ))}
                </select>
              </label>
              {nodes.length ? (
                <label className="pro-field">
                  Checkr account division
                  <select
                    value={node}
                    onChange={(e) => {
                      setNode(e.target.value);
                      setSelected("");
                      resetQuote();
                    }}
                  >
                    <option value="">Select division</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="checkr-gallery">
                {visible.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    className={`checkr-package ${selected === p.slug ? "selected" : ""}`}
                    aria-pressed={selected === p.slug}
                    onClick={() => {
                      setSelected(p.slug);
                      resetQuote();
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span>{money(p.price)} base price</span>
                    <small>{p.screenings.join(" · ")}</small>
                  </button>
                ))}
              </div>
              <div className="checkr-location">
                <label className="pro-field">
                  US work state
                  <input
                    maxLength={2}
                    required
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value.toUpperCase());
                      resetQuote();
                    }}
                  />
                </label>
                <label className="pro-field">
                  Work city
                  <input
                    maxLength={100}
                    required
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      resetQuote();
                    }}
                  />
                </label>
              </div>
              <p>
                Checkr uses the work location for required disclosures. Your
                monthly limit includes reserved orders; higher-priced orders
                require another authorized reviewer.
              </p>
              {!quote ? (
                <button
                  className="button button-dark"
                  disabled={
                    !orderingEnabled ||
                    !data.canOrder ||
                    !person ||
                    !selected ||
                    !city
                  }
                  onClick={() =>
                    void run(async () => {
                      setQuote(
                        await call("quote", {
                          subject: person?.id,
                          audience: person?.audience,
                          package: selected,
                          node,
                          state,
                          city,
                        }),
                      );
                    })
                  }
                >
                  Review order
                </button>
              ) : null}
            </fieldset>
            {quote ? (
              <div className="checkr-summary">
                <h3>Order review</h3>
                <p>
                  {person?.name} · {quote.packageName}
                </p>
                <dl>
                  <dt>Package base price</dt>
                  <dd>{money(quote.baseCents)}</dd>
                  <dt>Provider access fees</dt>
                  <dd>Additional where applicable</dd>
                  <dt>TXKPRO screening payment</dt>
                  <dd>No payment collected in this sandbox release</dd>
                </dl>
                <p>
                  Checkr billing applies under your employer account agreement.
                  This is an order summary, not an invoice or receipt.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={ack}
                    disabled={busy || Boolean(orderId)}
                    onChange={(e) => setAck(e.target.checked)}
                  />{" "}
                  I confirm the employment purpose and work location. Checkr
                  must obtain the recipient’s disclosure and consent.
                </label>
                <button
                  className="button button-dark"
                  disabled={busy || !ack || Boolean(orderId)}
                  onClick={() =>
                    void run(async () => {
                      const result = await call("prepare", {
                        quoteId: quote.id,
                        subject: person?.id,
                        audience: person?.audience,
                      });
                      setOrderId(result.id);
                      setFeedback(
                        "Order reserved. Check order history for approval or resume submission.",
                      );
                      router.refresh();
                    })
                  }
                >
                  Reserve screening order
                </button>
              </div>
            ) : null}
            {orderId ? (
              <p role="status">
                Saved order {orderId}. Close this window and continue from order
                history.
              </p>
            ) : null}
            {feedback ? <p role="status">{feedback}</p> : null}
          </ActionModal>
        )}
        {!orderingEnabled ? (
          <p>
            Sandbox ordering awaits Checkr activation. Your permission and
            spending controls remain available below.
          </p>
        ) : null}
      </article>
      <article className="card">
        <h2>Orders and documents</h2>
        {data.orders.length ? (
          data.orders.map((o) => (
            <div className="checkr-order" key={o.id}>
              <div>
                <strong>{o.name}</strong>
                <p>
                  {o.packageName} · {o.audience}
                </p>
                <span className="pill">{o.status.replaceAll("_", " ")}</span>
                <p>
                  {o.invitationStatus
                    ? `Invitation: ${o.invitationStatus}`
                    : "Awaiting submission"}
                  {o.reportStatus ? ` · Screening: ${o.reportStatus}` : ""}
                </p>
              </div>
              <div className="checkr-actions">
                <ActionModal
                  title="Screening order summary"
                  triggerLabel="Order summary"
                >
                  <DocumentTextIcon
                    className="checkr-icon"
                    aria-hidden="true"
                  />
                  <p>Order {o.id}</p>
                  <p>
                    {o.name} · {o.packageName}
                  </p>
                  <p>
                    Base price: {money(o.baseCents)}. Provider access fees may
                    be additional.
                  </p>
                  <p>Created {new Date(o.createdAt).toLocaleString("en-US")}</p>
                  <p>
                    Billing documents remain unavailable until the Checkr
                    billing integration is confirmed. This summary does not
                    confirm payment.
                  </p>
                  <button className="button" onClick={() => window.print()}>
                    Print summary
                  </button>
                </ActionModal>
                {o.status === "pending_approval" && data.canReview && !o.own ? (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call("approve", { orderId: o.id });
                        router.refresh();
                        setFeedback(
                          "Order approved. Authorized orderer can submit it.",
                        );
                      })
                    }
                  >
                    Approve order
                  </button>
                ) : null}
                {data.canOrder &&
                ["reserved", "processing"].includes(o.status) ? (
                  <button
                    className="button"
                    disabled={busy || !orderingEnabled}
                    onClick={() =>
                      void run(async () => {
                        await call("dispatch", { orderId: o.id });
                        setFeedback(
                          "Checkr confirmed the invitation. Refresh status to follow progress.",
                        );
                        router.refresh();
                        setOrderId(null);
                        resetQuote();
                      })
                    }
                  >
                    Submit / resume same order
                  </button>
                ) : null}
                {o.invitationStatus ? (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call("reconcile", { orderId: o.id });
                        router.refresh();
                        setFeedback("Status refreshed from Checkr.");
                      })
                    }
                  >
                    Refresh status
                  </button>
                ) : null}
                {["pending_approval", "reserved"].includes(o.status) ? (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call("cancel", { orderId: o.id });
                        router.refresh();
                        setFeedback("Unsubmitted order cancelled.");
                        setOrderId(null);
                        resetQuote();
                      })
                    }
                  >
                    Cancel unsubmitted order
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p>No Checkr orders yet.</p>
        )}
      </article>
      <p role="status" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}
