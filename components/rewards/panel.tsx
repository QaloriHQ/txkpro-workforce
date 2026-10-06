"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import type { PointsWorkspace } from "@/lib/pro-points/types";
import type { RewardWorkspace } from "@/lib/rewards/server";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pro-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
export function RewardsPanel({
  data,
  points,
  ownerType,
}: {
  data: RewardWorkspace;
  points: PointsWorkspace;
  ownerType?: string;
}) {
  const router = useRouter(),
    keys = useRef(new WeakMap<HTMLFormElement, string>());
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const owners = points.owners.filter(
    (o) =>
      (!ownerType || o.type === ownerType) &&
      ["institution", "employer"].includes(o.type),
  );
  async function send(
    input: Record<string, unknown>,
    endpoint = "/api/rewards",
  ) {
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const r = await response.json();
      if (!response.ok) throw new Error(r.error || "Unable to save.");
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      setFeedback("Saved. Close this dialog to continue.");
      return true;
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  function submit(op: string, extra: Record<string, unknown> = {}) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const f = event.currentTarget,
        values = Object.fromEntries(new FormData(f));
      let key = keys.current.get(f);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(f, key);
      }
      void send({ ...values, ...extra, op, requestKey: key }).then((ok) => {
        if (ok) keys.current.delete(f);
      });
    };
  }
  const status = (
      <p role="status" aria-live="polite">
        {feedback}
      </p>
    ),
    save = (
      <button className="button button-dark" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save"}
      </button>
    );
  return (
    <section className="reward-workspace">
      <h2>Rewards and funding</h2>
      <p className="card-sub">
        Sandbox rewards · USD. Reward credits are separate from seasonal
        rankings and lifetime levels. Minors can earn points; direct redemption
        remains restricted to eligible adults.
      </p>
      {owners.map((o) => {
        const a = data.accounts.find(
          (a) => a.ownerType === o.type && a.ownerId === o.id,
        );
        return (
          <article className="card" key={`${o.type}:${o.id}`}>
            <h3>{o.name} reward pool</h3>
            <p>
              {a?.connected
                ? `${dollars(a.balanceCents)} last confirmed sandbox balance`
                : "Tremendous account not connected"}
            </p>
            <p className="card-sub">
              Each workspace funds its own provider account. Pending deposits
              are unavailable until Tremendous confirms them.
            </p>
            <div className="reward-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void send(
                    { ownerType: o.type, ownerId: o.id },
                    "/api/rewards/connect",
                  )
                }
              >
                Connect Tremendous sandbox
              </button>
              <a
                className="button"
                href="https://testflight.tremendous.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Set up / fund provider account
              </a>
              <button
                className="button"
                disabled={busy || !a?.connected}
                onClick={() =>
                  void send({
                    op: "refresh_balance",
                    ownerType: o.type,
                    ownerId: o.id,
                  })
                }
              >
                Refresh confirmed funding
              </button>
            </div>
          </article>
        );
      })}
      {points.programs
        .filter((p) => !ownerType || p.ownerType === ownerType)
        .map((p) => {
          const q = data.policies.find((q) => q.programId === p.id),
            credits = data.credits.find((c) => c.programId === p.id);
          return (
            <article className="card" key={p.id}>
              <h3>{p.name} rewards</h3>
              {q ? (
                <p>
                  {q.creditsPerBlock} credits = {dollars(q.centsPerBlock)} ·
                  minimum {q.minimumCredits} · {q.approval} approval
                  <br />
                  Allocated {dollars(q.allocatedCents)} · committed{" "}
                  {dollars(q.liabilityCents)}
                </p>
              ) : (
                <p className="card-sub">
                  No reward policy configured. Activities still earn points.
                </p>
              )}
              {p.canManage && p.status === "draft" ? (
                <WorkspaceForm
                  modalTitle="Configure reward policy"
                  busy={busy}
                  feedback={status}
                  onSubmit={submit("policy", { programId: p.id })}
                >
                  <fieldset disabled={busy}>
                    <Field label="Credits per conversion block">
                      <input
                        name="creditsPerBlock"
                        type="number"
                        min="1"
                        max="1000000"
                        defaultValue={q?.creditsPerBlock || 100}
                        required
                      />
                    </Field>
                    <Field label="USD cents per block">
                      <input
                        name="centsPerBlock"
                        type="number"
                        min="1"
                        max="100000"
                        defaultValue={q?.centsPerBlock || 100}
                        required
                      />
                    </Field>
                    <Field label="Minimum credits per redemption">
                      <input
                        name="minimumCredits"
                        type="number"
                        min="1"
                        max="1000000"
                        defaultValue={q?.minimumCredits || 500}
                        required
                      />
                    </Field>
                    <Field label="Approval">
                      <select
                        name="approval"
                        defaultValue={q?.approval || "admin"}
                      >
                        <option value="admin">Administrator</option>
                        <option value="automatic">Automatic</option>
                      </select>
                    </Field>
                    <Field label="Tremendous sandbox gift-card product ID">
                      <input
                        name="productId"
                        minLength={4}
                        maxLength={40}
                        defaultValue={q?.productId || ""}
                        required
                      />
                    </Field>
                    <p className="card-sub">
                      Use an approved USD gift-card product. Rules are fixed on
                      activation. Reward credits have no automatic expiry;
                      provider-issued rewards follow provider terms.
                    </p>
                    {save}
                  </fieldset>
                </WorkspaceForm>
              ) : null}
              {p.canManage && q && ["draft", "active"].includes(p.status) ? (
                <WorkspaceForm
                  modalTitle="Allocate confirmed reward funds"
                  busy={busy}
                  feedback={status}
                  onSubmit={submit("allocate", { programId: p.id })}
                >
                  <fieldset disabled={busy}>
                    <Field label="Allocation in USD cents">
                      <input
                        name="cents"
                        type="number"
                        min="1"
                        max="100000000"
                        required
                      />
                    </Field>
                    <p>
                      Refresh funding first. This reserves existing provider
                      funds for this program.
                    </p>
                    {save}
                  </fieldset>
                </WorkspaceForm>
              ) : null}
              {p.canManage && q && ["ended", "cancelled"].includes(p.status) ? (
                <WorkspaceForm
                  modalTitle="Release unallocated budget"
                  busy={busy}
                  feedback={status}
                  onSubmit={submit("release_budget", { programId: p.id })}
                >
                  <p>
                    Earned credits and submitted rewards remain reserved. Only
                    unallocated funds return to the workspace pool.
                  </p>
                  {save}
                </WorkspaceForm>
              ) : null}
              {p.canManage &&
              q &&
              p.status === "ended" &&
              ["competition", "combined"].includes(p.template) ? (
                <WorkspaceForm
                  modalTitle="Award cycle winner credits"
                  busy={busy}
                  feedback={status}
                  onSubmit={submit("award", { programId: p.id })}
                >
                  <fieldset disabled={busy}>
                    <Field label="Accepted participant">
                      <select name="participantId" required defaultValue="">
                        <option value="" disabled>
                          Select participant
                        </option>
                        {p.participants
                          .filter((r) => r.status === "active")
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} · score {r.score}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Reward credits">
                      <input
                        name="credits"
                        type="number"
                        min="1"
                        max="1000000"
                        required
                      />
                    </Field>
                    <Field label="Award reason and tie treatment">
                      <textarea name="reason" maxLength={1000} required />
                    </Field>
                    <p>
                      Review the final standings and apply the program’s
                      disclosed tie rules consistently. Awarding credits never
                      changes rankings.
                    </p>
                    {save}
                  </fieldset>
                </WorkspaceForm>
              ) : null}
              {credits && q ? (
                <>
                  <p>
                    Your reward credits: <strong>{credits.credits}</strong>
                  </p>
                  {data.eligible ? (
                    <WorkspaceForm
                      modalTitle="Redeem reward credits"
                      busy={busy}
                      feedback={status}
                      onSubmit={submit("redeem", {
                        participantId: credits.participantId,
                      })}
                    >
                      <fieldset disabled={busy}>
                        <Field label="Credits to redeem">
                          <input
                            name="credits"
                            type="number"
                            min={q.minimumCredits}
                            max={Math.max(0, credits.credits)}
                            required
                          />
                        </Field>
                        <p>
                          Gift cards are delivered by Tremendous to your saved
                          account email. Credits must convert to a whole USD
                          cent.{" "}
                          {q.approval === "admin"
                            ? "An administrator must approve your request."
                            : "Eligible requests are approved and submitted automatically."}
                        </p>
                        {save}
                      </fieldset>
                    </WorkspaceForm>
                  ) : (
                    <p>
                      Redemption eligibility is separate from point earning.
                      Review your eligibility below.
                    </p>
                  )}
                </>
              ) : null}
              {data.requests
                .filter((x) => x.programId === p.id)
                .map((x) => (
                  <div className="reward-request" key={x.id}>
                    <p>
                      {x.credits} credits · {dollars(x.cents)} ·{" "}
                      <strong>{x.status.replaceAll("_", " ")}</strong>
                      {x.deliveryStatus
                        ? ` · delivery ${x.deliveryStatus}`
                        : ""}
                    </p>
                    <div className="reward-actions">
                      {p.canManage && x.status === "pending" && !x.own ? (
                        <>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void send({ op: "approve", requestId: x.id })
                            }
                          >
                            Approve
                          </button>
                          <WorkspaceForm
                            modalTitle="Reject reward request"
                            busy={busy}
                            feedback={status}
                            onSubmit={submit("reject", { requestId: x.id })}
                          >
                            <p>Reserved credits return to the participant.</p>
                            {save}
                          </WorkspaceForm>
                        </>
                      ) : null}
                      {x.own && ["pending", "approved"].includes(x.status) ? (
                        <WorkspaceForm
                          modalTitle="Cancel unsubmitted reward"
                          busy={busy}
                          feedback={status}
                          onSubmit={submit("cancel", { requestId: x.id })}
                        >
                          <p>This releases reserved credits.</p>
                          {save}
                        </WorkspaceForm>
                      ) : null}
                      {[
                        "approved",
                        "processing",
                        "provider_pending",
                        "reconciliation_required",
                      ].includes(x.status) ? (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            void send({ op: "dispatch", requestId: x.id })
                          }
                        >
                          Retry / reconcile same reward
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
            </article>
          );
        })}
      {!ownerType ? (
        <WorkspaceForm
          modalTitle="Reward redemption eligibility"
          busy={busy}
          feedback={status}
          onSubmit={submit("eligibility")}
        >
          <fieldset disabled={busy}>
            <Field label="Country">
              <select name="country">
                <option value="US">United States</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input name="bornOn" type="date" min="1900-01-01" required />
            </Field>
            <p className="card-sub">
              Used privately for reward eligibility. Students aged 13–17
              continue earning points; direct Tremendous redemption stays
              unavailable until eligible. These details never appear on your
              public profile.
            </p>
            {save}
          </fieldset>
        </WorkspaceForm>
      ) : null}
      {status}
    </section>
  );
}
