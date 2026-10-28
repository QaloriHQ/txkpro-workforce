"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Program } from "@/lib/pro-points/types";
import type { Definition } from "@/lib/incentives/contracts";
import type { EngineWorkspace } from "@/lib/incentives/execution-types";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pro-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ExecutionPanel({
  program,
  definition,
  data,
}: {
  program: Program;
  definition?: Definition;
  data: EngineWorkspace;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [metricMilestone, setMetricMilestone] = useState(
    definition?.milestones[0]?.id ?? "",
  );
  const selectedRule = definition?.milestones.find(
    (m) => m.id === metricMilestone,
  );
  const keys = useRef(new WeakMap<HTMLFormElement, string>());
  async function send(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/employer/incentives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, programId: program.id }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error ?? "Unable to save.");
      if (result.integrationToken) setToken(result.integrationToken);
      setMessage("Saved. Approved work is queued for sandbox processing.");
      router.refresh();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function form(op: string, extra: Record<string, unknown> = {}) {
    return async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      let key = keys.current.get(el);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(el, key);
      }
      const f = new FormData(el);
      const values: Record<string, unknown> = Object.fromEntries(f);
      for (const k of ["points", "threshold", "capacity", "count"])
        if (k in values) values[k] = Number(values[k]);
      if (op === "metric_event") {
        const metricValues: Record<string, number> = {};
        for (const key of [
          "budget_percent",
          "delay_hours",
          "reviews",
          "training_count",
          "service_days",
          "qualifying_projects",
        ]) {
          const raw = f.get(key);
          if (raw !== null && String(raw).trim() !== "")
            metricValues[key] = Number(raw);
        }
        values.metrics = metricValues;
        values.safetyComplete = f.get("safetyComplete") === "on";
      }
      if (op === "engine_setup")
        values.autoRedeem = f.get("autoRedeem") === "on";
      if (op === "integration") {
        try {
          values.mapping = {
            types: String(f.get("types"))
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            metrics: JSON.parse(String(f.get("mapping") || "{}")),
          };
        } catch {
          setMessage("Enter a valid JSON field mapping.");
          return;
        }
      }
      if (await send({ ...values, ...extra, op, requestKey: key }))
        keys.current.delete(el);
    };
  }
  const members = (name = "participantId") => (
    <select name={name} required>
      <option value="">Choose enrolled participant</option>
      {program.participants.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.kind}
        </option>
      ))}
    </select>
  );
  const milestones = (
    <select name="milestoneId" required>
      {definition?.milestones.map((m) => (
        <option key={m.id} value={m.id}>
          {m.title}
        </option>
      ))}
    </select>
  );
  const submit = (
    <button className="button" disabled={busy}>
      Save
    </button>
  );
  const own = program.participation?.id;
  return (
    <div className="pro-workspace">
      <div className="student-section-heading">
        <div>
          <h2>Program automation</h2>
          <p className="card-sub">
            {data.execution
              ? "Sandbox execution · employer-sponsored rewards"
              : "Configure execution before accepting participants"}
          </p>
        </div>
        {program.canManage && data.execution && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void send({ op: "tick" })}
          >
            Process due milestones
          </button>
        )}
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!data.execution && program.canManage && (
        <section className="card">
          <h3>Enable sandbox execution</h3>
          <p>
            Publish program rules first. Enabling execution locks reward terms
            before participants accept. Allocate confirmed sandbox funding in
            Rewards before awards can be issued.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              try {
                const r = await fetch("/api/rewards/catalog");
                const d = await r.json();
                if (!r.ok) throw new Error(d.error ?? "Catalog unavailable");
                setProducts(d.products);
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Catalog unavailable",
                );
              }
            }}
          >
            Load eligible gift cards
          </button>
          <form onSubmit={form("engine_setup")}>
            <Field label="Gift-card product">
              <select name="productId" required>
                <option value="">Select a catalog product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="pro-check">
              <input type="checkbox" name="autoRedeem" />
              Automatically redeem eligible banked points after verified awards;
              retain balances below the minimum.
            </label>
            {submit}
          </form>
        </section>
      )}
      {data.execution && (
        <>
          {program.canManage && (
            <details className="card">
              <summary>Verified metrics & approval roles</summary>
              <form onSubmit={form("metric_event")}>
                <Field label="Unique source / job reference">
                  <input name="sourceKey" required maxLength={100} />
                </Field>
                <Field label="Milestone">
                  <select
                    name="milestoneId"
                    value={metricMilestone}
                    onChange={(e) => setMetricMilestone(e.target.value)}
                  >
                    {definition?.milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedRule?.recipient !== "crew" && (
                  <Field label="Individual recipient">{members()}</Field>
                )}
                {selectedRule?.recipient === "crew" && (
                  <Field label="Crew">
                    <select name="crewId">
                      <option value="">Select crew if applicable</option>
                      {definition?.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="incentive-filters">
                  {[
                    "budget_percent",
                    "delay_hours",
                    "reviews",
                    "training_count",
                    "service_days",
                    "qualifying_projects",
                  ].map((k) => (
                    <Field key={k} label={k.replaceAll("_", " ")}>
                      <input name={k} type="number" min={0} step="any" />
                    </Field>
                  ))}
                </div>
                <Field label="Verification evidence">
                  <textarea name="evidence" required maxLength={4000} />
                </Field>
                <label className="pro-check">
                  <input name="safetyComplete" type="checkbox" />
                  Required safety and quality checks are verified
                </label>
                {submit}
              </form>
              <h4>Assign a scoped reviewer or crew lead</h4>
              {data.roles.map((role) => (
                <p key={`${role.participantId}:${role.role}:${role.crewId}`}>
                  {program.participants.find((p) => p.id === role.participantId)
                    ?.name ?? "Participant"}{" "}
                  · {role.role.replaceAll("_", " ")} {role.crewId}
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void send({ op: "revoke_role", ...role })}
                  >
                    Revoke role
                  </button>
                </p>
              ))}
              <form onSubmit={form("grant_role")}>
                <Field label="Participant">{members()}</Field>
                <Field label="Role">
                  <select name="role">
                    <option value="safety_reviewer">Safety reviewer</option>
                    <option value="crew_lead">Crew lead</option>
                  </select>
                </Field>
                <Field label="Crew for a crew lead">
                  <select name="crewId">
                    <option value="">Not applicable</option>
                    {definition?.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {submit}
              </form>
            </details>
          )}
          <section className="card">
            <h3>Milestone decisions</h3>
            {!data.events.length && <p>No execution events yet.</p>}
            {data.events.map((e) => (
              <article key={e.id} className="card">
                <h4>
                  {e.rule.title ?? e.milestone_id.replaceAll("-", " ")} ·{" "}
                  {e.status.replaceAll("_", " ")}
                </h4>
                <p>
                  {e.rule.points} points · {e.recipients.length} recipient(s)
                </p>
                <p>{e.evidence}</p>
                {e.reason && <p>{e.reason}</p>}
                {[
                  "review",
                  "safety_review",
                  "disputed",
                  "budget_wait",
                ].includes(e.status) &&
                  e.canReview && (
                    <form onSubmit={form("review_event", { eventId: e.id })}>
                      <Field label="Decision">
                        <select name="decision">
                          <option value="approve">
                            {e.rule.approval === "safety_then_manager" &&
                            !e.safety_approved
                              ? "Approve safety stage"
                              : "Approve verified reward"}
                          </option>
                          <option value="reject">
                            Decline with explanation
                          </option>
                        </select>
                      </Field>
                      <Field label="Reason / exception evidence">
                        <textarea name="reason" required maxLength={1000} />
                      </Field>
                      {submit}
                    </form>
                  )}
                {own &&
                  e.recipients.includes(own) &&
                  e.status === "rejected" &&
                  e.milestone_id !== "peer" && (
                    <form onSubmit={form("event_dispute", { eventId: e.id })}>
                      <p>
                        Exception deadline:{" "}
                        {new Date(e.dispute_until).toLocaleString()}
                      </p>
                      <Field label="Exception evidence">
                        <textarea name="reason" required maxLength={1000} />
                      </Field>
                      <label className="pro-check">
                        <input name="appeal" value="true" type="checkbox" />
                        This is my one appeal with additional evidence
                      </label>
                      {submit}
                    </form>
                  )}
              </article>
            ))}
          </section>
          {own && (
            <section className="card">
              <h3>Points to give</h3>
              {data.allowances
                .filter((a) => a.participant_id === own)
                .map((a) => (
                  <p key={a.period}>
                    {a.points - a.spent} available through{" "}
                    {new Date(a.expires_at).toLocaleDateString()}. Unused giving
                    points expire; earned points keep their own terms.
                  </p>
                ))}
              <form onSubmit={form("peer_points")}>
                <Field label="Teammate email">
                  <input name="recipientEmail" type="email" required />
                </Field>
                <Field label="Points">
                  <input name="points" type="number" min={1} required />
                </Field>
                <Field label="What did they contribute?">
                  <textarea name="note" required maxLength={1000} />
                </Field>
                {submit}
              </form>
            </section>
          )}
          <section className="card">
            <h3>My reward bank</h3>
            {own && (
              <>
                <p>
                  {data.lots
                    .filter((l) => l.participant_id === own)
                    .reduce((sum, l) => sum + l.available, 0)}{" "}
                  points available across your awards.{" "}
                  {definition?.creditsPerBlock} points = $
                  {((definition?.centsPerBlock ?? 0) / 100).toFixed(2)}.
                  Standard minimum: {definition?.minimumCredits} points.
                </p>
                <form onSubmit={form("engine_redeem")}>
                  <Field label="Banked points to exchange">
                    <input
                      name="points"
                      type="number"
                      min={definition?.minimumCredits ?? 1}
                      required
                    />
                  </Field>
                  {submit}
                </form>
              </>
            )}
            <h4>Award history & immediate safety redemption</h4>
            {data.lots.length === 0 && <p>No verified points awarded yet.</p>}
            {data.lots.map((l) => (
              <article key={l.id}>
                <p>
                  {program.participants.find((p) => p.id === l.participant_id)
                    ?.name ?? "Your award"}
                  : {l.available} available of {l.points} points ·{" "}
                  {l.expires_at
                    ? `expires ${new Date(l.expires_at).toLocaleDateString()}`
                    : "no automatic expiry"}
                </p>
                {own === l.participant_id && l.available > 0 && (
                  <form onSubmit={form("engine_redeem", { safetyLot: l.id })}>
                    <Field label="Points to redeem">
                      <input
                        type="number"
                        name="points"
                        min={1}
                        max={l.available}
                        required
                      />
                    </Field>
                    {submit}
                  </form>
                )}
              </article>
            ))}
          </section>
          {program.canManage && (
            <details className="card">
              <summary>Verified employment & retention</summary>
              <p>
                Confirmed native placements are imported automatically. For
                other employees, record an actual verified start; this does not
                create an official placement.
              </p>
              <form onSubmit={form("employment")}>
                <Field label="Employee">{members()}</Field>
                <Field label="Actual employment start">
                  <input name="startedOn" type="date" required />
                </Field>
                <Field label="Employment ended (optional)">
                  <input name="endedOn" type="date" />
                </Field>
                <Field label="Record / verification reference">
                  <input name="evidence" required maxLength={1000} />
                </Field>
                {submit}
              </form>
              {data.employment.map((e) => (
                <p key={e.participant_id}>
                  {program.participants.find((p) => p.id === e.participant_id)
                    ?.name ?? "Participant"}{" "}
                  · {e.started_on} · {e.source.replaceAll("_", " ")}
                  {e.ended_on ? ` · ended ${e.ended_on}` : ""}
                </p>
              ))}
            </details>
          )}
          <section className="card">
            <h3>Recognition & perks</h3>
            {program.canManage && (
              <details>
                <summary>Create a recognition tier</summary>
                <form onSubmit={form("tier")}>
                  <Field label="Company recognition title">
                    <input name="title" required maxLength={100} />
                  </Field>
                  <Field label="Qualifying milestone">{milestones}</Field>
                  <Field label="Verified completions required">
                    <input name="threshold" type="number" min={1} required />
                  </Field>
                  <Field label="Perk / fulfillment commitment">
                    <textarea name="perk" required maxLength={1000} />
                  </Field>
                  <Field label="Available capacity">
                    <input name="capacity" type="number" min={1} required />
                  </Field>
                  {submit}
                </form>
              </details>
            )}
            {data.tiers.map((t) => (
              <article key={t.id}>
                <h4>{t.title}</h4>
                <p>
                  {t.threshold} verified {t.milestone_id} completions · {t.perk}{" "}
                  · company recognition, not a license or verified skill
                  credential.
                </p>
              </article>
            ))}
            {data.perks.map((p) => (
              <article className="card" key={p.id}>
                <p>
                  {data.tiers.find((t) => t.id === p.tier_id)?.title} ·{" "}
                  {p.status}
                </p>
                {p.note && <p>{p.note}</p>}
                {own === p.participant_id && p.status === "unlocked" && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void send({
                        op: "perk",
                        perkId: p.id,
                        status: "requested",
                      })
                    }
                  >
                    Request perk
                  </button>
                )}
                {program.canManage &&
                  ["requested", "approved"].includes(p.status) && (
                    <form onSubmit={form("perk", { perkId: p.id })}>
                      <Field label="Fulfillment decision">
                        <select name="status">
                          {p.status === "requested" ? (
                            <option value="approved">
                              Approve and reserve capacity
                            </option>
                          ) : (
                            <option value="fulfilled">Confirm fulfilled</option>
                          )}
                          <option value="declined">
                            Decline / release capacity
                          </option>
                        </select>
                      </Field>
                      <Field label="Fulfillment reference / reason">
                        <textarea name="note" required maxLength={1000} />
                      </Field>
                      {submit}
                    </form>
                  )}
              </article>
            ))}
            {own && (
              <label className="pro-check">
                <input
                  type="checkbox"
                  checked={data.consent}
                  disabled={busy}
                  onChange={(e) =>
                    void send({
                      op: "recognition_consent",
                      enabled: e.target.checked,
                    })
                  }
                />
                Opt into this program’s company recognition board
              </label>
            )}
            <h4>Company recognition board</h4>
            {data.board.length ? (
              data.board.map((b, i) => (
                <p key={i}>
                  {b.name} · {b.title} · {b.issuer}
                </p>
              ))
            ) : (
              <p>No opted-in recognition yet.</p>
            )}
          </section>
          {program.canManage && (
            <details className="card">
              <summary>Record verified crew safety progress</summary>
              <form onSubmit={form("safety_progress")}>
                <Field label="Crew">
                  <select name="crewId">
                    {definition?.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Qualifying progress count">
                  <input type="number" name="count" min={0} required />
                </Field>
                <Field label="Verification source">
                  <input name="evidence" required maxLength={1000} />
                </Field>
                {submit}
              </form>
            </details>
          )}
          {data.progress.length > 0 && (
            <section className="card">
              <h3>Safety progress</h3>
              {data.progress.map((p) => (
                <p key={p.crewId}>
                  {definition?.teams.find((t) => t.id === p.crewId)?.name ??
                    "Program"}{" "}
                  · {p.count} verified progress units ·{" "}
                  {p.paused
                    ? "Frozen for remediation; progress retained"
                    : "Ready for verified progress"}
                </p>
              ))}
            </section>
          )}
          {program.canManage && (
            <details className="card">
              <summary>ERP / HRMS integrations</summary>
              <p>
                Create a scoped bearer credential, map source fields (including
                dotted paths), then bind external employee identifiers to
                enrolled participants. Source events are validated and
                quarantined on error.
              </p>
              <form onSubmit={form("integration")}>
                <Field label="Integration name">
                  <input name="name" required maxLength={100} />
                </Field>
                <Field label="Allowed event types (comma separated)">
                  <input name="types" defaultValue="metric" required />
                </Field>
                <Field label="Metric mapping JSON: internal metric to source field">
                  <textarea
                    name="mapping"
                    defaultValue={'{"reviews":"approvedReviewCount"}'}
                  />
                </Field>
                {submit}
              </form>
              {token && (
                <section className="card">
                  <p>
                    Copy this token now; it is shown once and stored only as a
                    hash.
                  </p>
                  <code style={{ overflowWrap: "anywhere" }}>{token}</code>
                  <button
                    className="button secondary"
                    onClick={() => setToken(null)}
                  >
                    Hide token
                  </button>
                </section>
              )}
              <p>
                Endpoint: /api/incentives/integrations/events · Authorization:
                Bearer token · include eventId, sentAt, employeeId and type.
              </p>
              {data.integrations.map((i) => (
                <article key={i.id}>
                  <h4>
                    {i.name} · {i.active ? "active" : "disabled"}
                  </h4>
                  {i.active && (
                    <>
                      <form
                        onSubmit={form("bind_integration", {
                          integrationId: i.id,
                        })}
                      >
                        <Field label="External employee ID">
                          <input name="externalId" required maxLength={100} />
                        </Field>
                        <Field label="Enrolled participant">{members()}</Field>
                        {submit}
                      </form>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void send({
                            op: "disable_integration",
                            integrationId: i.id,
                          })
                        }
                      >
                        Disable credential
                      </button>
                    </>
                  )}
                </article>
              ))}
              {data.ingestion.map((x) => (
                <article key={`${x.integrationId}:${x.eventKey}`}>
                  <p>
                    {x.eventKey} · {x.status} · {x.reason}
                  </p>
                  {x.status === "quarantined" && (
                    <form
                      onSubmit={form("retry_ingestion", {
                        integrationId: x.integrationId,
                        eventKey: x.eventKey,
                      })}
                    >
                      <Field label="Reconciliation explanation">
                        <input name="reason" required maxLength={1000} />
                      </Field>
                      <button className="button secondary" disabled={busy}>
                        Authorize source replay
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </details>
          )}
          {data.notices.length > 0 && (
            <section className="card">
              <h3>Your updates</h3>
              {data.notices.map((n) => (
                <article key={n.id}>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
