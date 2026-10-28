"use client";
import { ExecutionPanel } from "./execution";
import type { EngineWorkspace } from "@/lib/incentives/execution-types";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PointsWorkspace, Program } from "@/lib/pro-points/types";
import type {
  Configuration,
  Case,
  Extension,
} from "@/lib/incentives/contracts";
import { roi } from "@/lib/incentives/contracts";
import type { RewardWorkspace } from "@/lib/rewards/server";
import { RewardsPanel } from "@/components/rewards/panel";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
import { programStatus } from "./gallery";
import { incentiveAction, RuleSimulator } from "./editor";
export function ProgramDetail({
  program,
  points,
  configuration,
  cases,
  audit,
  rewards,
  assignments,
  engine,
}: {
  program: Program;
  points: PointsWorkspace;
  configuration?: Configuration;
  cases: Case[];
  audit: Extension["audit"][string];
  rewards: RewardWorkspace;
  engine: EngineWorkspace;
  assignments: Extension["assignments"][string];
}) {
  const [tab, setTab] = useState("Overview");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const definition = configuration?.published ?? configuration?.draft;
  const policy = rewards.policies.find((p) => p.programId === program.id);
  async function action(op: string) {
    setBusy(true);
    try {
      await incentiveAction({ op, programId: program.id });
      setMessage("Program updated.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="student-section-heading">
        <div>
          <h1>{program.name}</h1>
          <p>{definition?.description}</p>
          <span className="pill">{programStatus(program, configuration)}</span>
        </div>
        <div className="reward-actions">
          {program.canManage && (
            <Link
              className="button"
              href={`/employer/incentives/${program.id}/edit`}
            >
              Edit program
            </Link>
          )}
          {program.canManage && configuration && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() =>
                void action(
                  configuration.archived
                    ? "restore"
                    : program.status === "active"
                      ? configuration.paused
                        ? "resume"
                        : "pause"
                      : "archive",
                )
              }
            >
              {configuration.archived
                ? "Restore"
                : program.status === "active"
                  ? configuration.paused
                    ? "Resume"
                    : "Pause"
                  : "Archive"}
            </button>
          )}
        </div>
      </div>
      <p role="status">{message}</p>
      <nav className="incentive-stage-nav" aria-label="Program sections">
        {[
          "Overview",
          "People",
          "Rules & milestones",
          "Activity",
          "Rewards",
          "Analytics",
          "Automation",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "button" : "button secondary"}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Automation" && (
        <ExecutionPanel
          program={program}
          definition={definition}
          data={engine}
        />
      )}
      {tab === "Overview" && (
        <>
          <div className="incentive-stats">
            <article className="card">
              <span>Enrolled members</span>
              <strong>{program.participants.length}</strong>
            </article>
            <article className="card">
              <span>Milestones</span>
              <strong>
                {definition?.milestones.length ?? program.activities.length}
              </strong>
            </article>
            <article className="card">
              <span>Review decisions</span>
              <strong>
                {
                  cases.filter((c) =>
                    ["pending", "appealed"].includes(c.status),
                  ).length
                }
              </strong>
              <button
                className="button secondary"
                onClick={() => setTab("Activity")}
              >
                Review
              </button>
            </article>
            <article className="card">
              <span>Reward liability · USD</span>
              <strong>
                ${((policy?.liabilityCents ?? 0) / 100).toFixed(2)}
              </strong>
            </article>
          </div>
          <section className="card">
            <h2>Program progress</h2>
            <p>
              {new Date(program.startsAt).toLocaleDateString()} –{" "}
              {new Date(program.endsAt).toLocaleDateString()}
            </p>
            <p>
              {configuration?.published
                ? "Published rules are preserved in version history."
                : "Configure and publish rules in the separate editor."}
            </p>
            <p>
              Live reward issuance from this expanded engine is unavailable
              until its funded launch requirements are verified.
            </p>
            {cases.some(
              (c) =>
                c.kind === "safety" &&
                ["pending", "verified"].includes(c.status),
            ) && (
              <p role="status">
                Safety remediation is open. Preserve crew progress until
                remediation is resolved; do not automatically resume after 24
                hours.
              </p>
            )}
          </section>
        </>
      )}
      {tab === "People" && (
        <>
          <section className="card">
            <h2>Assigned crews</h2>
            {definition?.teams.length ? (
              definition.teams.map((t) => (
                <article key={t.id}>
                  <h3>{t.name}</h3>
                  <p>
                    {(
                      assignments.find((a) => a.crewId === t.id)?.memberIds ??
                      t.participantIds
                    )
                      .map(
                        (id) =>
                          program.participants.find((p) => p.id === id)?.name ??
                          "Unavailable member",
                      )
                      .join(", ") || "No members assigned"}
                  </p>
                  {program.canManage && configuration?.published && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const members = new FormData(e.currentTarget).getAll(
                          "members",
                        );
                        setBusy(true);
                        try {
                          await incentiveAction({
                            op: "crew_assignment",
                            programId: program.id,
                            crewId: t.id,
                            revision:
                              assignments.find((a) => a.crewId === t.id)
                                ?.revision ?? 0,
                            memberIds: members,
                          });
                          setMessage(
                            "Crew assignment saved. Published reward terms are unchanged.",
                          );
                          router.refresh();
                        } catch (e) {
                          setMessage(
                            e instanceof Error
                              ? e.message
                              : "Unable to save roster.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {program.participants
                        .filter((p) => p.status === "active")
                        .map((p) => (
                          <label className="pro-check" key={p.id}>
                            <input
                              name="members"
                              type="checkbox"
                              value={p.id}
                              defaultChecked={(
                                assignments.find((a) => a.crewId === t.id)
                                  ?.memberIds ?? t.participantIds
                              ).includes(p.id)}
                            />
                            {p.name}
                          </label>
                        ))}
                      <button className="button secondary" disabled={busy}>
                        Save crew members
                      </button>
                    </form>
                  )}
                </article>
              ))
            ) : (
              <p>No crews configured.</p>
            )}
          </section>
          <IncentiveWorkspace
            allowActivityAuthoring={false}
            ownerType="employer"
            data={{ ...points, summary: null, owners: [], programs: [program] }}
          />
        </>
      )}
      {tab === "Rules & milestones" && (
        <>
          <section className="card">
            <h2>Employee terms · version {program.termsVersion}</h2>
            <p className="portfolio-text">{program.terms}</p>
            {definition && (
              <>
                <p>
                  {definition.creditsPerBlock} points per $
                  {(definition.centsPerBlock / 100).toFixed(2)} conversion block
                  · {definition.minimumCredits} point normal minimum.
                </p>
                <p>
                  {definition.expiryMonths === null
                    ? "Indefinite earned-point availability"
                    : `${definition.expiryMonths} months after award`}
                  . Departure:{" "}
                  {definition.departure === "retain"
                    ? "original expiry remains"
                    : `${definition.departureDays}-day redemption window`}
                  .
                </p>
                <p>
                  Verified safety rewards:{" "}
                  {definition.safetyMode.replaceAll("_", " ")}. Original award
                  terms must be preserved when policy changes.
                </p>
                {definition.milestones.map((m) => (
                  <article className="card" key={m.id}>
                    <h3>{m.title}</h3>
                    <p>
                      {m.points} points · {m.recipient} ·{" "}
                      {m.approval.replaceAll("_", " ")}
                    </p>
                    <ul>
                      {m.conditions.map((c, i) => (
                        <li key={i}>
                          {c.metric.replaceAll("_", " ")}{" "}
                          {c.operator === "gte" ? "at least" : "at most"}{" "}
                          {c.value}
                        </li>
                      ))}
                    </ul>
                    {m.safetyRequired && (
                      <p>Requires safety and quality checks.</p>
                    )}
                  </article>
                ))}
              </>
            )}
          </section>
          {definition && <RuleSimulator definition={definition} />}
        </>
      )}
      {tab === "Activity" && (
        <>
          <OperationalCases
            program={program}
            cases={cases}
            manager={program.canManage}
          />
          <section className="card">
            <h2>Program history</h2>
            {audit.length ? (
              audit.map((a, i) => (
                <p key={i}>
                  {a.event.replaceAll("_", " ")} ·{" "}
                  {new Date(a.created_at).toLocaleString()}
                </p>
              ))
            ) : (
              <p>No recorded changes yet.</p>
            )}
          </section>
        </>
      )}
      {tab === "Rewards" && (
        <section className="card">
          <h2>Rewards & points banking</h2>
          <p>
            Program scores, giving allowances, and reward points remain
            separate.
          </p>
          {policy ? (
            <>
              <p>
                Allocated: ${(policy.allocatedCents / 100).toFixed(2)} ·
                Committed: ${(policy.liabilityCents / 100).toFixed(2)}
              </p>
              <p>
                Current funded conversion: {policy.creditsPerBlock} credits per
                ${(policy.centsPerBlock / 100).toFixed(2)}.
              </p>
            </>
          ) : (
            <p>
              No funded reward policy is attached. Draft conversion settings do
              not create redeemable value.
            </p>
          )}
          {(!configuration || policy) && (
            <RewardsPanel
              data={rewards}
              points={{ ...points, programs: [program] }}
              ownerType="employer"
              executionMode={!!engine.execution}
            />
          )}
          <h3>Redemption history</h3>
          {rewards.requests
            .filter((r) => r.programId === program.id)
            .map((r) => (
              <p key={r.id}>
                {r.credits} points · ${(r.cents / 100).toFixed(2)} · {r.status}{" "}
                · {r.deliveryStatus ?? "Awaiting delivery"}
              </p>
            ))}
          <p>
            Execution awards use snapshotted terms and existing sandbox
            fulfillment. Existing earned rewards retain their original policy.
          </p>
        </section>
      )}
      {tab === "Analytics" && (
        <>
          <section className="card">
            <h2>Observed activity</h2>
            <p>
              {program.participants.filter((p) => p.status === "active").length}{" "}
              active participants ·{" "}
              {program.activities.reduce(
                (n, a) =>
                  n +
                  a.submissions.filter((s) => s.status === "approved").length,
                0,
              )}{" "}
              approved completions in the loaded activity window.
            </p>
            <p>
              Reported hazards are not an incident-rate or safety-improvement
              measure.
            </p>
          </section>
          <RoiSimulator />
        </>
      )}
    </>
  );
}
export function OperationalCases({
  program,
  cases,
  manager = false,
}: {
  program: Program;
  cases: Case[];
  manager?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(input: Record<string, unknown>) {
    setBusy(true);
    try {
      await incentiveAction({ ...input, programId: program.id });
      setMessage("Saved.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Recognition & review</h2>
      <p>
        Safety reports are confidential. The remediation target is 24 hours;
        unresolved reports remain open.
      </p>
      {program.participation?.status === "active" && (
        <form
          className="pro-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void submit({
              op: f.get("kind"),
              body: f.get("body"),
              sourceKey: f.get("sourceKey") || crypto.randomUUID(),
              recipientEmail: f.get("recipientEmail"),
            });
          }}
        >
          <label className="pro-field">
            <span>Type</span>
            <select name="kind">
              <option value="safety">Report a safety hazard / near miss</option>
              <option value="recognition">Recognize a teammate</option>
              <option value="dispute">Dispute a declined decision</option>
            </select>
          </label>
          <label className="pro-field">
            <span>Details</span>
            <textarea name="body" required maxLength={4000} />
          </label>
          <label className="pro-field">
            <span>Declined submission ID (disputes only)</span>
            <input name="sourceKey" />
          </label>
          <label className="pro-field">
            <span>Teammate email (recognition only)</span>
            <input type="email" name="recipientEmail" autoComplete="off" />
          </label>
          <button className="button" disabled={busy}>
            Submit
          </button>
          <p className="card-sub">
            Recognition posts do not transfer monetary value. Disputes require a
            declined own submission within its 48-hour review window.
          </p>
        </form>
      )}
      <p role="status">{message}</p>
      {cases.length === 0 && <p>No cases to show.</p>}
      {cases.map((c) => (
        <article className="card" key={c.id}>
          <h3>
            {c.kind} · {c.status}
          </h3>
          <p className="portfolio-text">{c.body}</p>
          <p>
            {new Date(c.created_at).toLocaleString()}
            {c.deadline
              ? ` · Remediation target ${new Date(c.deadline).toLocaleString()}`
              : ""}
          </p>
          {c.reason && <p>Review: {c.reason}</p>}
          {manager &&
            ["pending", "appealed", "verified"].includes(c.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void submit({
                    op: f.get("op"),
                    caseId: c.id,
                    reason: f.get("reason"),
                  });
                }}
              >
                <label className="pro-field">
                  <span>Decision</span>
                  <select name="op">
                    {c.status === "verified" ? (
                      <option value="resolve">Remediation resolved</option>
                    ) : (
                      <>
                        <option value="verify">Verify evidence</option>
                        <option value="decline_case">
                          Decline with explanation
                        </option>
                      </>
                    )}
                  </select>
                </label>
                <label className="pro-field">
                  <span>Reason</span>
                  <textarea required maxLength={1000} name="reason" />
                </label>
                <button className="button" disabled={busy}>
                  Save review
                </button>
              </form>
            )}
          {!manager && c.kind === "dispute" && c.status === "declined" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit({
                  op: "appeal",
                  caseId: c.id,
                  reason: new FormData(e.currentTarget).get("reason"),
                });
              }}
            >
              <label className="pro-field">
                <span>Additional evidence for appeal</span>
                <textarea name="reason" required maxLength={1000} />
              </label>
              <button className="button" disabled={busy}>
                Appeal decision
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
export function RoiSimulator() {
  const [values, setValues] = useState({
    departures: 0,
    replacementCost: 0,
    avoidedDepartures: 0,
    incidentCost: 0,
    reduction: 0,
    programCost: 0,
  });
  let result;
  try {
    result = roi({ ...values, reduction: values.reduction / 100 });
  } catch {
    result = null;
  }
  return (
    <section className="card">
      <h2>Estimate program impact</h2>
      <p>
        Scenario only. Improvement assumptions start at zero; projections are
        not observed savings.
      </p>
      <div className="incentive-filters">
        {Object.entries(values).map(([key, value]) => (
          <label className="pro-field" key={key}>
            <span>
              {
                {
                  departures: "Annual departures",
                  replacementCost: "Replacement cost ($)",
                  avoidedDepartures: "Assumed avoided departures",
                  incidentCost: "Annual incident-related cost ($)",
                  reduction: "Assumed cost reduction (%)",
                  programCost: "Full annual program cost ($)",
                }[key]
              }
            </span>
            <input
              type="number"
              min={0}
              max={key === "reduction" ? 100 : undefined}
              value={value}
              onChange={(e) =>
                setValues({ ...values, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      {result ? (
        <div aria-live="polite">
          <p>
            Estimated net benefit: $
            {result.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p>
            Estimated ROI:{" "}
            {result.roi === null
              ? "Enter a program cost"
              : `${result.roi.toFixed(1)}%`}
          </p>
          <p>
            Break-even: {result.breakEvenDepartures ?? "Enter replacement cost"}{" "}
            avoided departures.
          </p>
        </div>
      ) : (
        <p role="alert">
          Check scenario values; avoided departures cannot exceed annual
          departures.
        </p>
      )}
    </section>
  );
}
