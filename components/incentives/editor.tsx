"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BLUEPRINTS,
  blueprintMilestones,
  initialDefinition,
  validateDefinition,
  evaluateMilestone,
  splitCrew,
  type Definition,
  type Configuration,
  type Milestone,
} from "@/lib/incentives/contracts";
import Link from "next/link";
import { EditorField, CheckField, FieldHelp } from "./field-help";
import { editorHelp } from "@/lib/incentives/field-help";
import type { Program } from "@/lib/pro-points/types";
import { CrewCreateModal } from "@/components/employer/crew-create-modal";
import { CrewSelector } from "@/components/incentives/crew-selector";
import {
  selectedCrewsToTeams,
  type EmployerCrew,
  type EmployerCrewWorkspace,
} from "@/lib/employer/crew-contracts";
export async function incentiveAction(input: Record<string, unknown>) {
  const response = await fetch("/api/employer/incentives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to save.");
  return data as { id: string; revision: number };
}
export function ProgramEditor({
  ownerId,
  program,
  configuration,
  initialDraft,
  templateName,
  initialMode,
  crewWorkspace,
}: {
  ownerId: string;
  program?: Program;
  configuration?: Configuration;
  initialDraft?: Definition;
  templateName?: string;
  initialMode?: "guided" | "advanced";
  crewWorkspace: EmployerCrewWorkspace;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Definition>(
    () =>
      configuration?.draft ??
      initialDraft ?? {
        ...initialDefinition(),
        ...(program
          ? {
              name: program.name,
              startsAt: program.startsAt.slice(0, 10),
              endsAt: program.endsAt.slice(0, 10),
              terms: program.terms,
            }
          : {}),
      },
  );
  const [mode, setMode] = useState<"guided" | "advanced">(
    () =>
      initialMode ??
      (draft.milestones.some(
        (m) =>
          m.conditions.length > 1 ||
          m.match === "any" ||
          m.approval !== "manager",
      )
        ? "advanced"
        : "guided"),
  );
  const [step, setStep] = useState(0);
  const [revision, setRevision] = useState(configuration?.revision ?? 0);
  const [message, setMessage] = useState(
    configuration ? "Saved" : "Draft not saved yet",
  );
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [availableCrews, setAvailableCrews] = useState(crewWorkspace.crews);
  const saving = useRef(false);
  const latest = useRef(draft);
  const [savedFingerprint, setSavedFingerprint] = useState(
    configuration ? JSON.stringify(configuration.draft) : "",
  );
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const stages = [
    "Blueprint",
    "People",
    "Milestones",
    "Rewards & policies",
    "Review & notifications",
    "Preview",
  ];
  function update<K extends keyof Definition>(key: K, value: Definition[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function save(value = draft) {
    if (saving.current || conflict) return;
    const errors = validateDefinition(value);
    if (errors.length) {
      setMessage(errors.join(" "));
      return;
    }
    saving.current = true;
    setBusy(true);
    setMessage("Saving…");
    try {
      const result = await incentiveAction(
        program
          ? { op: "save", programId: program.id, definition: value, revision }
          : { op: "create", ownerId, definition: value },
      );
      setSavedFingerprint(JSON.stringify(value));
      setRevision(result.revision);
      setMessage("Saved");
      if (!program) router.replace(`/employer/incentives/${result.id}/edit`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save. Retry.";
      setMessage(msg);
      if (msg.includes("changed")) setConflict(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!program || conflict || savedFingerprint === JSON.stringify(draft))
      return;
    const timer = setTimeout(() => {
      void save(latest.current);
    }, 1000);
    return () => clearTimeout(timer);
    // Save uses revision-checked writes; any revision update schedules the latest unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, program?.id, revision, conflict]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (savedFingerprint !== JSON.stringify(latest.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savedFingerprint]);
  const advanced = draft.milestones.some(
    (m) =>
      m.conditions.length > 1 || m.match === "any" || m.approval !== "manager",
  );
  const crewById = useMemo(
    () => new Map(availableCrews.map((crew) => [crew.id, crew])),
    [availableCrews],
  );
  const directoryCrewIds = draft.teams.flatMap((team) => {
    const id = team.directoryCrewId ?? team.id;
    return crewById.has(id) ? [id] : [];
  });
  const legacyCrewCount = draft.teams.length - directoryCrewIds.length;
  function selectDirectoryCrews(ids: string[]) {
    update(
      "teams",
      selectedCrewsToTeams(
        availableCrews,
        ids.slice(0, Math.max(0, 50 - legacyCrewCount)),
        program?.participants ?? [],
        draft.teams,
      ),
    );
  }
  function addCreatedCrew(crew: EmployerCrew) {
    const next = [
      ...availableCrews.filter((item) => item.id !== crew.id),
      crew,
    ].sort((a, b) => a.name.localeCompare(b.name));
    setAvailableCrews(next);
    if (draft.teams.length >= 50) {
      setMessage(
        "Crew created in Directory. This program already has the 50-crew maximum, so it was not selected.",
      );
      return;
    }
    update(
      "teams",
      selectedCrewsToTeams(
        next,
        [...new Set([...directoryCrewIds, crew.id])],
        program?.participants ?? [],
        draft.teams,
      ),
    );
  }
  function changeMilestone(index: number, value: Partial<Milestone>) {
    update(
      "milestones",
      draft.milestones.map((m, i) => (i === index ? { ...m, ...value } : m)),
    );
  }
  function addMilestone() {
    update("milestones", [
      ...draft.milestones,
      {
        id: crypto.randomUUID(),
        title: "",
        recipient: "individual",
        points: 100,
        match: "all",
        conditions: [
          {
            metric:
              draft.blueprint === "retention"
                ? "service_days"
                : draft.blueprint === "delivery"
                  ? "delay_hours"
                  : "reviews",
            operator: draft.blueprint === "delivery" ? "lte" : "gte",
            value: draft.blueprint === "retention" ? 90 : 1,
          },
        ],
        safetyRequired: true,
        approval: "manager",
      },
    ]);
  }
  const field = (
    label: string,
    content: React.ReactElement<{ id?: string; "aria-describedby"?: string }>,
  ) => (
    <EditorField label={label} help={editorHelp(label)}>
      {content}
    </EditorField>
  );
  return (
    <>
      <div className="student-section-heading">
        <div>
          <h1>{program ? "Edit program" : "Create program"}</h1>
          <p className="card-sub">One program. Two ways to configure it.</p>
        </div>
        <div className="reward-actions">
          <button
            type="button"
            className="button secondary"
            disabled={mode === "advanced" && advanced}
            title={
              advanced
                ? "Advanced conditions require the Advanced Editor"
                : undefined
            }
            onClick={() => setMode(mode === "guided" ? "advanced" : "guided")}
          >
            {mode === "guided" ? "Use Advanced Editor" : "Use Guided Setup"}
          </button>
          <button
            className="button"
            type="button"
            disabled={busy || conflict}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
      {templateName && (
        <section className="card incentive-template-applied">
          <strong>Using {templateName}</strong>
          <p>
            All settings are editable. Confirm dates, amounts, terms and crew
            membership before publishing. This draft is not saved until you
            choose Save draft.
          </p>
          <Link href="/employer/incentives/templates" className="link">
            Browse templates
          </Link>
        </section>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {conflict && (
        <button
          className="button secondary"
          onClick={() => window.location.reload()}
        >
          Reload latest revision
        </button>
      )}
      {program && program.status !== "draft" && (
        <p className="card">
          Edits remain unpublished. Existing participants keep their terms.
          Changed published terms require a separate program.
        </p>
      )}
      <nav className="incentive-stage-nav" aria-label="Editor stages">
        {stages.map((s, i) => (
          <button
            key={s}
            type="button"
            aria-current={step === i ? "step" : undefined}
            className={step === i ? "button" : "button secondary"}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s}
          </button>
        ))}
      </nav>
      <section className="card incentive-editor-stage">
        <h2>
          {mode === "advanced" ? "Stage" : "Step"} {step + 1}: {stages[step]}
        </h2>
        {step === 0 && (
          <>
            {field(
              "Program name",
              <input
                value={draft.name}
                maxLength={100}
                onChange={(e) => update("name", e.target.value)}
              />,
            )}
            {field(
              "Description",
              <textarea
                value={draft.description}
                maxLength={1000}
                onChange={(e) => update("description", e.target.value)}
              />,
            )}
            {field(
              "Trade context (optional)",
              <input
                value={draft.trade}
                maxLength={100}
                onChange={(e) => update("trade", e.target.value)}
              />,
            )}
            <div className="incentive-field-label">
              <h3 id="incentive-goal-label">Program goal</h3>
              <FieldHelp
                label="Program goal"
                help="Choose the program focus. Selecting another goal preserves existing milestones; remove or adjust them explicitly if you want different rules."
              />
            </div>
            <div
              className="incentive-gallery"
              role="group"
              aria-labelledby="incentive-goal-label"
            >
              {BLUEPRINTS.map((b) => (
                <button
                  type="button"
                  key={b}
                  className={`card incentive-blueprint ${draft.blueprint === b ? "selected" : ""}`}
                  aria-pressed={draft.blueprint === b}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      blueprint: b,
                      milestones: d.milestones.length
                        ? d.milestones
                        : blueprintMilestones(b),
                    }))
                  }
                >
                  <strong>
                    {b === "delivery"
                      ? "Crew Project Delivery"
                      : b === "quality"
                        ? "Quality & Customer Appreciation"
                        : b === "safety"
                          ? "Safety Reporting & Improvement"
                          : b === "recognition"
                            ? "Peer Recognition"
                            : b === "retention"
                              ? "Retention & Anniversaries"
                              : "Combined Program"}
                  </strong>
                  <span>Start with {b} goals and tailor your milestones.</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            {field(
              "Starts",
              <input
                type="date"
                value={draft.startsAt.slice(0, 10)}
                onChange={(e) => update("startsAt", e.target.value)}
              />,
            )}
            {field(
              "Ends",
              <input
                type="date"
                value={draft.endsAt.slice(0, 10)}
                onChange={(e) => update("endsAt", e.target.value)}
              />,
            )}
            {field(
              "Employer timezone",
              <input
                value={draft.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              />,
            )}
            <p>
              Crews are reusable organization records from Directory. Selecting
              a crew does not invite or enroll its members; only active program
              participants are mapped into its reward roster.
            </p>
            <div className="incentive-crew-actions">
              <CrewSelector
                crews={availableCrews}
                selectedIds={directoryCrewIds}
                maxSelected={Math.max(0, 50 - legacyCrewCount)}
                onChange={selectDirectoryCrews}
              />
              {crewWorkspace.canManage ? (
                <CrewCreateModal
                  people={crewWorkspace.people}
                  onCreated={addCreatedCrew}
                  triggerClassName="txk-button txk-button-default txk-button-md"
                />
              ) : null}
              <Link className="button secondary" href="/employer/directory">
                Open organization directory
              </Link>
            </div>
            {draft.teams.length ? (
              <div className="incentive-selected-crews">
                {draft.teams.map((team, index) => {
                  const crew = crewById.get(
                    team.directoryCrewId ?? team.id,
                  );
                  if (crew) {
                    const synced = selectedCrewsToTeams(
                      [crew],
                      [crew.id],
                      program?.participants ?? [],
                      [],
                    )[0];
                    const currentIds = [...team.participantIds].sort();
                    const syncedIds = [...synced.participantIds].sort();
                    const inSync =
                      JSON.stringify(currentIds) === JSON.stringify(syncedIds);
                    return (
                      <article className="incentive-selected-crew" key={team.id}>
                        <div className="student-section-heading">
                          <div>
                            <span className="pill">Organization crew</span>
                            <h3>{crew.name}</h3>
                            {crew.description ? <p>{crew.description}</p> : null}
                          </div>
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() =>
                              update(
                                "teams",
                                draft.teams.filter((item) => item.id !== team.id),
                              )
                            }
                          >
                            Remove from program
                          </button>
                        </div>
                        <p className="card-sub">
                          {crew.memberCount} organization member
                          {crew.memberCount === 1 ? "" : "s"} ·{" "}
                          {team.participantIds.length} active program participant
                          {team.participantIds.length === 1 ? "" : "s"} mapped
                        </p>
                        <p className="card-sub">
                          {crew.members.length
                            ? crew.members
                                .slice(0, 6)
                                .map((member) => member.name)
                                .join(", ")
                            : "No organization members assigned"}
                          {crew.members.length > 6
                            ? ` +${crew.members.length - 6} more`
                            : ""}
                        </p>
                        {program && !inSync ? (
                          <div className="alert" role="status">
                            Directory membership or program enrollment changed.
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() =>
                                update(
                                  "teams",
                                  draft.teams.map((item) =>
                                    item.id === team.id ? synced : item,
                                  ),
                                )
                              }
                            >
                              Sync active participants
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  }
                  return (
                    <fieldset key={team.id}>
                      <legend>Program-only crew {index + 1}</legend>
                      <p className="card-sub">
                        This older crew is stored only in this program. Select an
                        organization crew above to use a reusable roster.
                      </p>
                      {field(
                        "Crew name",
                        <input
                          value={team.name}
                          maxLength={100}
                          onChange={(event) =>
                            update(
                              "teams",
                              draft.teams.map((item) =>
                                item.id === team.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />,
                      )}
                      {program?.participants.map((participant) => (
                        <CheckField
                          key={participant.id}
                          label={`${participant.name} · ${participant.kind}`}
                          help={editorHelp("Crew membership")}
                        >
                          <input
                            type="checkbox"
                            checked={team.participantIds.includes(participant.id)}
                            onChange={(event) =>
                              update(
                                "teams",
                                draft.teams.map((item) =>
                                  item.id === team.id
                                    ? {
                                        ...item,
                                        participantIds: event.target.checked
                                          ? [
                                              ...new Set([
                                                ...item.participantIds,
                                                participant.id,
                                              ]),
                                            ]
                                          : item.participantIds.filter(
                                              (id) => id !== participant.id,
                                            ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </CheckField>
                      ))}
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() =>
                          update(
                            "teams",
                            draft.teams.filter((item) => item.id !== team.id),
                          )
                        }
                      >
                        Remove crew
                      </button>
                    </fieldset>
                  );
                })}
              </div>
            ) : (
              <div className="employer-crew-empty">
                <div>
                  <h3>No crews selected</h3>
                  <p className="card-sub">
                    Select an existing crew or create one without leaving this
                    draft. Individual milestones can still operate without a
                    crew.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p>
              Individual milestones remain independent of crew project speed.
              Reports never count as safety failures.
            </p>
            {draft.milestones.map((m, index) => (
              <fieldset key={m.id}>
                <legend>Milestone {index + 1}</legend>
                {field(
                  "Milestone title",
                  <input
                    value={m.title}
                    maxLength={100}
                    onChange={(e) =>
                      changeMilestone(index, { title: e.target.value })
                    }
                  />,
                )}
                {field(
                  "Reward points",
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={m.points}
                    onChange={(e) =>
                      changeMilestone(index, { points: Number(e.target.value) })
                    }
                  />,
                )}
                {field(
                  "Recipient",
                  <select
                    value={m.recipient}
                    onChange={(e) =>
                      changeMilestone(index, {
                        recipient: e.target.value as Milestone["recipient"],
                      })
                    }
                  >
                    <option value="individual">Individual employee</option>
                    <option value="crew">Crew · equal individual shares</option>
                  </select>,
                )}
                {mode === "advanced" &&
                  field(
                    "Condition grouping",
                    <select
                      value={m.match}
                      onChange={(e) =>
                        changeMilestone(index, {
                          match: e.target.value as "all" | "any",
                        })
                      }
                    >
                      <option value="all">All conditions (AND)</option>
                      <option value="any">Any condition (OR)</option>
                    </select>,
                  )}
                {m.conditions.map((c, ci) => (
                  <div className="incentive-filters" key={ci}>
                    {field(
                      "Metric",
                      <select
                        value={c.metric}
                        onChange={(e) =>
                          changeMilestone(index, {
                            conditions: m.conditions.map((x, i) =>
                              i === ci
                                ? {
                                    ...x,
                                    metric: e.target.value as typeof c.metric,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        {[
                          "budget_percent",
                          "delay_hours",
                          "reviews",
                          "training_count",
                          "service_days",
                          "qualifying_projects",
                        ].map((x) => (
                          <option key={x} value={x}>
                            {x.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>,
                    )}
                    {field(
                      "Comparison",
                      <select
                        value={c.operator}
                        onChange={(e) =>
                          changeMilestone(index, {
                            conditions: m.conditions.map((x, i) =>
                              i === ci
                                ? {
                                    ...x,
                                    operator: e.target
                                      .value as typeof c.operator,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="gte">At least</option>
                        <option value="lte">At most</option>
                      </select>,
                    )}
                    {field(
                      "Target",
                      <input
                        type="number"
                        min={0}
                        value={c.value}
                        onChange={(e) =>
                          changeMilestone(index, {
                            conditions: m.conditions.map((x, i) =>
                              i === ci
                                ? { ...x, value: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />,
                    )}
                    {m.conditions.length > 1 && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          changeMilestone(index, {
                            conditions: m.conditions.filter((_, i) => i !== ci),
                          })
                        }
                      >
                        Remove condition
                      </button>
                    )}
                  </div>
                ))}
                {mode === "advanced" && (
                  <button
                    className="button secondary"
                    disabled={m.conditions.length >= 10}
                    onClick={() =>
                      changeMilestone(index, {
                        conditions: [
                          ...m.conditions,
                          {
                            metric: "training_count",
                            operator: "gte",
                            value: 1,
                          },
                        ],
                      })
                    }
                  >
                    Add condition
                  </button>
                )}
                {field(
                  "Award frequency",
                  <select
                    value={
                      m.repeat ??
                      (m.conditions.some((c) =>
                        ["service_days", "qualifying_projects"].includes(
                          c.metric,
                        ),
                      )
                        ? "once"
                        : "per_source")
                    }
                    onChange={(e) =>
                      changeMilestone(index, {
                        repeat: e.target.value as Milestone["repeat"],
                      })
                    }
                  >
                    <option value="once">Once per participant or crew</option>
                    <option value="per_source">
                      Each distinct verified source event
                    </option>
                  </select>,
                )}
                <CheckField
                  label="Require completed safety and quality checks"
                  help={editorHelp("Safety checks")}
                >
                  <input
                    type="checkbox"
                    checked={m.safetyRequired}
                    onChange={(e) =>
                      changeMilestone(index, {
                        safetyRequired: e.target.checked,
                      })
                    }
                  />
                </CheckField>
                {mode === "advanced" &&
                  field(
                    "Approval sequence",
                    <select
                      value={m.approval}
                      onChange={(e) =>
                        changeMilestone(index, {
                          approval: e.target.value as Milestone["approval"],
                        })
                      }
                    >
                      <option value="manager">Manager review</option>
                      <option value="safety_then_manager">
                        Safety review → Manager review
                      </option>
                    </select>,
                  )}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    update(
                      "milestones",
                      draft.milestones.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove milestone
                </button>
              </fieldset>
            ))}
            <button
              className="button secondary"
              disabled={draft.milestones.length >= 50}
              onClick={addMilestone}
            >
              Add milestone
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <p>
              These are proposed program terms. Saving does not fund rewards or
              enable redemption.
            </p>
            {(
              [
                ["budgetCents", "Program budget (USD cents)"],
                ["creditsPerBlock", "Points per conversion block"],
                ["centsPerBlock", "USD cents per block"],
                ["minimumCredits", "Normal redemption minimum (points)"],
                ["safetyPoints", "Verified safety report points"],
                ["givingAllowance", "Monthly points to give"],
                ["recipientMonthlyCap", "Monthly peer recipient cap"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                {field(
                  label,
                  <input
                    type="number"
                    min={
                      k === "creditsPerBlock" ||
                      k === "centsPerBlock" ||
                      k === "minimumCredits"
                        ? 1
                        : 0
                    }
                    value={draft[k]}
                    onChange={(e) => update(k, Number(e.target.value))}
                  />,
                )}
              </div>
            ))}
            {field(
              "Earned-point expiration",
              <select
                value={draft.expiryMonths === null ? "indefinite" : "window"}
                onChange={(e) =>
                  update(
                    "expiryMonths",
                    e.target.value === "indefinite" ? null : 12,
                  )
                }
              >
                <option value="indefinite">
                  Remain available indefinitely
                </option>
                <option value="window">Expire after a defined period</option>
              </select>,
            )}
            {draft.expiryMonths !== null &&
              field(
                "Months after award",
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.expiryMonths}
                  onChange={(e) =>
                    update("expiryMonths", Number(e.target.value))
                  }
                />,
              )}
            {field(
              "After employment ends",
              <select
                value={draft.departure}
                onChange={(e) =>
                  update("departure", e.target.value as Definition["departure"])
                }
              >
                <option value="retain">
                  Retain earned points under original expiry
                </option>
                <option value="window">Defined redemption window</option>
              </select>,
            )}
            {draft.departure === "window" &&
              field(
                "Departure redemption days",
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={draft.departureDays}
                  onChange={(e) =>
                    update("departureDays", Number(e.target.value))
                  }
                />,
              )}
            {field(
              "Verified safety report reward",
              <select
                value={draft.safetyMode}
                onChange={(e) =>
                  update(
                    "safetyMode",
                    e.target.value as Definition["safetyMode"],
                  )
                }
              >
                <option value="immediate">Immediate reward</option>
                <option value="bank">Bank points</option>
                <option value="bank_and_redeem">
                  Bank points · immediate redemption available
                </option>
              </select>,
            )}
            <p>
              Earned value will retain its original terms. Budget exhaustion
              never reduces existing entitlements.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            {field(
              "Employee-facing program terms",
              <textarea
                rows={7}
                maxLength={4000}
                value={draft.terms}
                onChange={(e) => update("terms", e.target.value)}
              />,
            )}
            <CheckField
              label="Offer opt-in public recognition (participant consent still required)"
              help={editorHelp("Public recognition")}
            >
              <input
                type="checkbox"
                checked={draft.publicRecognition}
                onChange={(e) => update("publicRecognition", e.target.checked)}
              />
            </CheckField>
            {(["inApp", "email"] as const).map((k) => (
              <CheckField
                key={k}
                label={`${k === "inApp" ? "In-app" : "Email"} notification preference`}
                help={editorHelp(
                  k === "inApp"
                    ? "In-app notification preference"
                    : "Email notification preference",
                )}
              >
                <input
                  type="checkbox"
                  checked={draft.notifications[k]}
                  onChange={(e) =>
                    update("notifications", {
                      ...draft.notifications,
                      [k]: e.target.checked,
                    })
                  }
                />
              </CheckField>
            ))}
            <p className="card-sub">
              Operational in-app notices remain available in the program. Email
              delivery and external HRMS/ERP connections require a verified
              integration.
            </p>
          </>
        )}
        {step === 5 && (
          <>
            <h3>{draft.name || "Untitled program"}</h3>
            <p>{draft.description}</p>
            <p>
              {draft.creditsPerBlock} points = $
              {(draft.centsPerBlock / 100).toFixed(2)} in eligible rewards.{" "}
              {draft.expiryMonths === null
                ? "Earned points remain available indefinitely."
                : `Earned points expire ${draft.expiryMonths} months after award.`}
            </p>
            <p>
              {draft.departure === "retain"
                ? "After employment ends, original expiration terms continue."
                : `After employment ends, redeem within ${draft.departureDays} days, subject to original expiry.`}
            </p>
            <p className="portfolio-text">{draft.terms}</p>
            <ul>
              {validateDefinition(draft, true).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <p>
              Publish locks this definition into history. Activation uses the
              existing program and funding controls; no monetary operations are
              enabled by this editor.
            </p>
            <button
              className="button"
              disabled={
                !program ||
                busy ||
                conflict ||
                validateDefinition(draft, true).length > 0 ||
                savedFingerprint !== JSON.stringify(draft)
              }
              onClick={async () => {
                if (!program) return;
                try {
                  setBusy(true);
                  await incentiveAction({
                    op: "publish",
                    programId: program.id,
                    revision,
                  });
                  setMessage(
                    "Rules published. Activate from the program page when eligible.",
                  );
                  router.refresh();
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Could not publish.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publish rules
            </button>
            <RuleSimulator definition={draft} />
          </>
        )}
      </section>
      <div className="student-section-heading">
        <button
          className="button secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          Back
        </button>
        {step < 5 && (
          <button className="button" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        )}
      </div>
    </>
  );
}
export function RuleSimulator({ definition }: { definition: Definition }) {
  const [metrics, setMetrics] = useState<Record<string, number>>({
    budget_percent: 100,
    delay_hours: 0,
    reviews: 0,
    training_count: 0,
    service_days: 0,
    qualifying_projects: 0,
  });
  const [safe, setSafe] = useState(false);
  return (
    <details className="card">
      <summary>Test this program · no awards created</summary>
      <p>
        Scenario only. Real rewards require verified evidence, approvals and
        funded capacity.
      </p>
      <div className="incentive-filters">
        {Object.entries(metrics).map(([key, value]) => (
          <EditorField
            key={key}
            label={key.replaceAll("_", " ")}
            help={editorHelp(key.replaceAll("_", " "))}
          >
            <input
              type="number"
              min={0}
              value={value}
              onChange={(e) =>
                setMetrics({ ...metrics, [key]: Number(e.target.value) })
              }
            />
          </EditorField>
        ))}
      </div>
      <CheckField
        label="Safety and quality checks complete"
        help={editorHelp("Simulation safety")}
      >
        <input
          type="checkbox"
          checked={safe}
          onChange={(e) => setSafe(e.target.checked)}
        />
      </CheckField>
      {definition.milestones.map((m) => {
        const result = evaluateMilestone(m, metrics, safe);
        return (
          <article className="card" key={m.id}>
            <h4>{m.title}</h4>
            <p>
              {result.eligible
                ? `${result.points} proposed points`
                : "No award in this scenario"}
            </p>
            <p>{result.reason}</p>
            {m.recipient === "crew" &&
              definition.teams.map((t) => (
                <p key={t.id}>
                  {t.name}:{" "}
                  {t.participantIds.length
                    ? splitCrew(result.points, t.participantIds)
                        .map((x) => x.points)
                        .join(" / ")
                    : "Assign a roster to preview equal shares"}
                </p>
              ))}
          </article>
        );
      })}
    </details>
  );
}
