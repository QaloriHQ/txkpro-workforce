"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  WorkspaceForm,
  ActionModal,
} from "@/components/design-system/action-modal";
import { ProgressCard } from "./progress-card";
import type {
  PointsWorkspace,
  Program,
  Activity,
} from "@/lib/pro-points/types";
function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <label className="pro-field">
      <span>{text}</span>
      {children}
    </label>
  );
}
export function IncentiveWorkspace({
  data,
  ownerType,
}: {
  data: PointsWorkspace;
  ownerType?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const owners = data.owners.filter((o) => !ownerType || o.type === ownerType);
  const programs = data.programs.filter(
    (p) => !ownerType || p.ownerType === ownerType,
  );
  async function action(input: Record<string, unknown>) {
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/pro-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save.");
      setFeedback("Saved. Close this dialog to continue.");
      router.refresh();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  function form(op: string, extra: Record<string, unknown> = {}) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      const values: Record<string, unknown> = Object.fromEntries(f);
      if (op === "create_program") {
        const selected = owners[Number(f.get("owner"))];
        if (!selected) return;
        values.ownerType = selected.type;
        values.ownerId = selected.id;
        values.leaderboardVisible = f.get("leaderboardVisible") === "on";
        values.startsAt = new Date(String(f.get("startsAt"))).toISOString();
        values.endsAt = new Date(String(f.get("endsAt"))).toISOString();
      }
      if (op === "create_activity") {
        values.options = String(f.get("options") || "")
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean);
        values.weekdays = f.getAll("weekday").map(Number);
      }
      void action({ ...values, ...extra, op });
    };
  }
  const status = (
    <p role="status" aria-live="polite">
      {feedback}
    </p>
  );
  const submit = (
    <button className="button" disabled={busy} type="submit">
      {busy ? "Saving…" : "Save"}
    </button>
  );
  function activity(p: Program, a: Activity) {
    return (
      <article className="card pro-activity" key={a.id}>
        <div className="student-section-heading">
          <h3>{a.title}</h3>
          <span className="pill">{a.kind.replace("_", " ")}</span>
        </div>
        <p>{a.instructions}</p>
        <p className="card-sub">
          {a.points} private points · {a.repeat} ·{" "}
          {a.audience.replace("_", " ")} · caps {a.dailyCap}/day, {a.weeklyCap}
          /week
        </p>
        {p.participation?.status === "active" && p.status === "active" ? (
          <WorkspaceForm
            modalTitle={`Complete: ${a.title}`}
            busy={busy}
            onSubmit={form("submit", { programId: p.id, activityId: a.id })}
            feedback={status}
          >
            {a.options ? (
              <Label text="Choose one answer">
                <select name="answer" required defaultValue="">
                  <option disabled value="">
                    Select an answer
                  </option>
                  {a.options.map((o, i) => (
                    <option key={i} value={i}>
                      {o}
                    </option>
                  ))}
                </select>
              </Label>
            ) : (
              <Label text="Describe your completion evidence">
                <textarea name="evidence" required maxLength={4000} />
              </Label>
            )}
            <p className="card-sub">
              Trivia allows one attempt per scheduled period. Other activities
              need a program administrator’s review.
            </p>
            {submit}
          </WorkspaceForm>
        ) : null}
        {a.submissions.length ? (
          <details>
            <summary>Completion records ({a.submissions.length})</summary>
            {a.submissions.map((z) => (
              <div className="pro-submission" key={z.id}>
                <strong>{z.participantName}</strong>
                <span className="pill">{z.status}</span>
                <p>{z.evidence || "Trivia attempt"}</p>
                {z.reason ? <p className="card-sub">{z.reason}</p> : null}
                {p.canManage && ["pending", "approved"].includes(z.status) ? (
                  <WorkspaceForm
                    modalTitle="Review completion"
                    triggerLabel="Review"
                    busy={busy}
                    feedback={status}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action({
                        programId: p.id,
                        submissionId: z.id,
                        op: f.get("reviewAction"),
                        reason: f.get("reason"),
                      });
                    }}
                  >
                    <Label text="Decision">
                      <select name="reviewAction">
                        {z.status === "pending" ? (
                          <>
                            <option value="approve">Approve evidence</option>
                            <option value="reject">Decline evidence</option>
                          </>
                        ) : (
                          <option value="reverse">
                            Reverse invalid evidence and points
                          </option>
                        )}
                      </select>
                    </Label>
                    <Label text="Reason">
                      <textarea name="reason" required maxLength={1000} />
                    </Label>
                    {submit}
                  </WorkspaceForm>
                ) : null}
              </div>
            ))}
          </details>
        ) : null}
      </article>
    );
  }
  return (
    <div className="pro-workspace">
      {data.summary ? <ProgressCard summary={data.summary} owner /> : null}
      <div className="pro-toolbar">
        <h2>{ownerType ? "Private programs" : "My incentive programs"}</h2>
        {owners.length ? (
          <WorkspaceForm
            modalTitle="Create incentive program"
            busy={busy}
            feedback={status}
            onSubmit={form("create_program")}
          >
            <Label text="Program owner">
              <select name="owner">
                {owners.map((o, i) => (
                  <option key={`${o.type}-${o.id}`} value={i}>
                    {o.name} · {o.type}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Name">
              <input name="name" required maxLength={100} />
            </Label>
            <Label text="Structure">
              <select name="template">
                <option value="competition">Competition</option>
                <option value="earn_redeem">
                  Earn and redeem (redemption coming later)
                </option>
                <option value="combined">
                  Combined (redemption coming later)
                </option>
              </select>
            </Label>
            <Label text="Starts (your local time)">
              <input type="datetime-local" name="startsAt" required />
            </Label>
            <Label text="Ends (your local time)">
              <input type="datetime-local" name="endsAt" required />
            </Label>
            <Label text="Participation terms and award rules">
              <textarea name="terms" required maxLength={4000} />
            </Label>
            <label className="pro-check">
              <input type="checkbox" name="leaderboardVisible" /> Show
              participant names and scores to accepted program participants
            </label>
            <p>
              Scores are private to this program and do not add shared PRO
              Points. Funding and reward redemption are coming later.
            </p>
            {submit}
          </WorkspaceForm>
        ) : null}
      </div>
      <p className="card-sub">
        Employees and sponsored students have separate participation. Joining a
        program grants no employer workspace permissions.
      </p>
      {!programs.length ? (
        <div className="empty">
          No programs yet. Invitations appear here after an administrator adds
          your activated account.
        </div>
      ) : null}
      {programs.map((p) => (
        <section className="card pro-program" key={p.id}>
          <div className="student-section-heading">
            <div>
              <h2>{p.name}</h2>
              <p className="card-sub">
                {p.ownerType} · {p.template.replace("_", " ")} ·{" "}
                {new Date(p.startsAt).toLocaleDateString()}–
                {new Date(p.endsAt).toLocaleDateString()}
              </p>
            </div>
            <span className="pill">{p.status}</span>
          </div>
          <div className="pro-toolbar">
            <ActionModal
              title={`${p.name} · terms v${p.termsVersion}`}
              triggerLabel="View terms"
            >
              <p className="portfolio-text">{p.terms}</p>
              <p>
                {p.leaderboardVisible
                  ? "Participant names and scores are visible to accepted participants."
                  : "Scores are private to participants and program administrators."}
              </p>
            </ActionModal>
            {p.participation?.status === "pending" ? (
              <WorkspaceForm
                modalTitle="Review program invitation"
                triggerLabel="Accept / decline"
                feedback={status}
                busy={busy}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action({
                    op: f.get("decision"),
                    programId: p.id,
                    termsVersion: p.termsVersion,
                  });
                }}
              >
                <p>Participation: {p.participation.kind.replace("_", " ")}</p>
                <p className="portfolio-text">{p.terms}</p>
                <Label text="Decision">
                  <select name="decision">
                    <option value="accept">Accept these terms and join</option>
                    <option value="decline">Decline invitation</option>
                  </select>
                </Label>
                <p>
                  {p.leaderboardVisible
                    ? "Your name and score will appear in this program’s participant leaderboard."
                    : "Your score remains private to you and program administrators."}
                </p>
                {submit}
              </WorkspaceForm>
            ) : p.participation ? (
              <span className="pill">
                {p.participation.kind.replace("_", " ")} ·{" "}
                {p.participation.status} · {p.participation.points} private
                points
              </span>
            ) : null}
            {p.canManage && ["draft", "active"].includes(p.status) ? (
              <WorkspaceForm
                modalTitle="Change program status"
                feedback={status}
                busy={busy}
                onSubmit={form("set_status", { programId: p.id })}
              >
                <Label text="Next status">
                  <select name="status">
                    {p.status === "draft" ? (
                      <option value="active">
                        Activate — freeze rules and terms
                      </option>
                    ) : (
                      <option value="ended">End cycle</option>
                    )}
                    <option value="cancelled">Cancel program</option>
                  </select>
                </Label>
                <p>
                  Rules and terms are fixed after activation. To change them,
                  create a new cycle.
                </p>
                {submit}
              </WorkspaceForm>
            ) : null}
            {p.canManage && p.status === "active" ? (
              <WorkspaceForm
                modalTitle="Invite participant"
                feedback={status}
                busy={busy}
                onSubmit={form("invite", { programId: p.id })}
              >
                <Label text="Activated TXKPRO account email">
                  <input name="email" type="email" required />
                </Label>
                <Label text="Participation">
                  <select name="kind">
                    {p.ownerType === "employer" ? (
                      <>
                        <option value="employee">
                          Employee (program-only affiliation)
                        </option>
                        <option value="sponsored_student">
                          Sponsored Student
                        </option>
                      </>
                    ) : (
                      <option value="student">Student</option>
                    )}
                  </select>
                </Label>
                <p>
                  Invitation remains pending until accepted. Expires after 14
                  days or at cycle end. An employee designation is the
                  employer’s program-specific assertion; it does not verify
                  employment or grant staff access.
                </p>
                {submit}
              </WorkspaceForm>
            ) : null}
            {p.canManage && p.status === "draft" ? (
              <WorkspaceForm
                modalTitle="Add custom activity"
                feedback={status}
                busy={busy}
                onSubmit={form("create_activity", { programId: p.id })}
              >
                <Label text="Title">
                  <input name="title" required maxLength={100} />
                </Label>
                <Label text="Activity type">
                  <select name="kind">
                    {[
                      "check_in",
                      "trivia",
                      "milestone",
                      "lab",
                      "mentoring",
                      "trade_tip",
                      "attendance",
                      "training",
                    ].map((k) => (
                      <option key={k} value={k}>
                        {k.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label text="Audience">
                  <select name="audience">
                    <option value="all">All accepted participants</option>
                    {p.ownerType === "employer" ? (
                      <>
                        <option value="employee">Employees</option>
                        <option value="sponsored_student">
                          Sponsored students
                        </option>
                      </>
                    ) : (
                      <option value="student">Students</option>
                    )}
                  </select>
                </Label>
                <Label text="Instructions / required evidence">
                  <textarea name="instructions" required maxLength={4000} />
                </Label>
                <Label text="Private points">
                  <input
                    type="number"
                    name="points"
                    defaultValue={5}
                    min={0}
                    max={1000}
                    required
                  />
                </Label>
                <Label text="Repeat">
                  <select name="repeat">
                    <option value="daily">Once per eligible day</option>
                    <option value="weekly">Once per week</option>
                    <option value="once">Once per program</option>
                  </select>
                </Label>
                <Label text="Daily point cap">
                  <input
                    type="number"
                    name="dailyCap"
                    defaultValue={20}
                    min={1}
                    max={1000}
                    required
                  />
                </Label>
                <Label text="Weekly point cap">
                  <input
                    type="number"
                    name="weeklyCap"
                    defaultValue={100}
                    min={1}
                    max={1000}
                    required
                  />
                </Label>
                <fieldset>
                  <legend>Eligible weekdays (America/Chicago)</legend>
                  <div className="pro-weekdays">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (d, i) => (
                        <label key={d}>
                          <input
                            type="checkbox"
                            name="weekday"
                            value={i + 1}
                            defaultChecked
                          />
                          {d}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
                <Label text="Trivia choices (one per line; only for trivia)">
                  <textarea name="options" maxLength={2000} />
                </Label>
                <Label text="Correct choice (zero-based; only for trivia)">
                  <input
                    type="number"
                    name="answerIndex"
                    min={0}
                    max={5}
                    defaultValue={0}
                  />
                </Label>
                <p>
                  Trivia is validated automatically. Other evidence requires
                  administrator review. No activity creates a verified skill or
                  credential.
                </p>
                {submit}
              </WorkspaceForm>
            ) : null}
          </div>
          {p.canManage ? (
            <a
              className="button"
              href={`/api/pro-points/report?programId=${encodeURIComponent(p.id)}`}
            >
              Export activity CSV
            </a>
          ) : null}
          <div className="pro-activity-grid">
            {p.activities.map((a) => activity(p, a))}
          </div>
          {p.canManage && p.participants.length ? (
            <details>
              <summary>
                Participants & private scores ({p.participants.length})
              </summary>
              <div className="pro-participant-list">
                {p.participants.map((r) => (
                  <div key={r.id}>
                    <strong>{r.name}</strong>
                    <span>
                      {r.kind.replace("_", " ")} · {r.status}
                    </span>
                    <span>{r.score} points</span>
                    {["pending", "active"].includes(r.status) ? (
                      <WorkspaceForm
                        modalTitle={`Cancel participation: ${r.name}`}
                        triggerLabel="Cancel participation"
                        feedback={status}
                        busy={busy}
                        onSubmit={form("cancel_participant", {
                          programId: p.id,
                          participantId: r.id,
                        })}
                      >
                        <p>
                          Cancel this program participation? Existing evidence
                          and scores remain in the audit trail.
                        </p>
                        {submit}
                      </WorkspaceForm>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {p.leaderboard.length ? (
            <details>
              <summary>Program leaderboard</summary>
              <ol>
                {p.leaderboard.map((r, i) => (
                  <li value={r.rank} key={i}>
                    {r.name} · {r.score} private points
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <p className="card-sub">
            Funding, prizes and reward redemption: coming later. Scores do not
            represent cash or a spendable balance.
          </p>
        </section>
      ))}
      {data.ledger.length ? (
        <section className="card">
          <h2>My PRO Points activity</h2>
          <div className="pro-ledger">
            {data.ledger.map((l) => (
              <div key={l.id}>
                <strong>
                  {l.rule.replace("_", " ")} · {l.points} points
                </strong>
                <span>
                  {l.category} · {new Date(l.occurredAt).toLocaleDateString()}
                </span>
                <span className="card-sub">{l.reason}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
