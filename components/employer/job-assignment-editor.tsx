"use client";

import { useState } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { ActionModal } from "@/components/design-system/action-modal";
import { FieldHelp } from "@/components/incentives/field-help";
import type { JobWorkspaceAssignments } from "@/lib/employer/job-workspace";

export function JobAssignmentEditor({ employerId, jobId, initial }: { employerId: string; jobId: string; initial: JobWorkspaceAssignments }) {
  const [workspace, setWorkspace] = useState(initial);
  const [people, setPeople] = useState(initial.hiringTeamUserIds);
  const [crews, setCrews] = useState(initial.crewIds);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hiringPeople = workspace.people.filter((person) => workspace.hiringTeamUserIds.includes(person.userId));
  const assignedCrews = workspace.crews.filter((crew) => workspace.crewIds.includes(crew.id));
  function toggle(values: string[], id: string, set: (values: string[]) => void) { set(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]); }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/employer/jobs/${encodeURIComponent(jobId)}/assignments?employerId=${encodeURIComponent(employerId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hiringTeamUserIds: people, crewIds: crews }) });
      const result = await response.json() as { workspace?: JobWorkspaceAssignments; error?: string };
      if (!response.ok || !result.workspace) throw new Error(result.error ?? "Unable to save assignments");
      setWorkspace(result.workspace); setPeople(result.workspace.hiringTeamUserIds); setCrews(result.workspace.crewIds); setMessage("Assignments saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save assignments"); }
    finally { setBusy(false); }
  }
  return <section className="card job-people-card" id="people">
    <div className="card-header"><div><p className="eyebrow">People & placement</p><h2>Hiring team and operational crews</h2></div>{workspace.canManageAssignments ? <ActionModal title="Assign people and crews" triggerLabel="Edit job assignments" triggerContent={<><UserGroupIcon aria-hidden="true" /> Edit assignments</>} triggerClassName="txk-button txk-button-secondary txk-button-md" busy={busy} description="Hiring responsibility and operational placement are separate. Crew membership grants no recruiting access." footerActions={<button className="txk-button txk-button-primary txk-button-md" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save assignments"}</button>}>
      <div className="job-assignment-modal">
        <fieldset><legend>Hiring team <FieldHelp label="Hiring team" help="Choose active employer members responsible for recruiting coordination. Their canonical role and existing job-scope rules still control access." /></legend>{workspace.people.map((person) => <label className="pro-check" key={person.userId}><input type="checkbox" checked={people.includes(person.userId)} onChange={() => toggle(people, person.userId, setPeople)} /><span><strong>{person.name}</strong><small>{person.role.replaceAll("_", " ")}</small></span></label>)}</fieldset>
        <fieldset><legend>Operational crews <FieldHelp label="Operational crews" help="Describe likely placement context after hire. This does not enroll people, grant hiring access, or assign rewards." /></legend>{workspace.crews.map((crew) => <label className="pro-check" key={crew.id}><input type="checkbox" checked={crews.includes(crew.id)} onChange={() => toggle(crews, crew.id, setCrews)} /><span><strong>{crew.name}</strong><small>{crew.memberCount} current members</small></span></label>)}{!workspace.crews.length ? <p className="card-sub">Create reusable crews in Organization Directory first.</p> : null}</fieldset>
        {message ? <p role="status" className="callout">{message}</p> : null}
      </div>
    </ActionModal> : null}</div>
    <div className="job-people-columns"><div><h3>Hiring team</h3>{hiringPeople.length ? <ul>{hiringPeople.map((person) => <li key={person.userId}><strong>{person.name}</strong><span>{person.role.replaceAll("_", " ")}</span></li>)}</ul> : <p className="card-sub">No hiring team members assigned.</p>}</div><div><h3>Operational crews</h3>{assignedCrews.length ? <ul>{assignedCrews.map((crew) => <li key={crew.id}><strong>{crew.name}</strong><span>{crew.memberCount} current members</span></li>)}</ul> : <p className="card-sub">No operational crews assigned.</p>}</div></div>
    <p className="card-sub">Assignments organize responsibility and intended placement. They do not change employer roles, applicant access, program enrollment, or reward eligibility.</p>
  </section>;
}
