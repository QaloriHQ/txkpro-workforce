"use client";

import { useActionState, useState } from "react";
import { WorkspaceForm } from "@/components/design-system/action-modal";
import type { InstitutionProgramManagementCohort, InstitutionProgramManagementProgram } from "@/lib/institution/types";

export type CohortSaveState = { ok: boolean; message: string };
const initialState: CohortSaveState = { ok: false, message: "" };
const statuses = ["planning", "active", "enrolling", "in_progress", "completed", "paused", "archived"];

export function CohortEditor({ programs, cohort, newProgram = false, defaultProgramKey, saveAction }: {
  programs: InstitutionProgramManagementProgram[];
  cohort?: InstitutionProgramManagementCohort;
  newProgram?: boolean;
  defaultProgramKey?: string;
  saveAction: (state: CohortSaveState, form: FormData) => Promise<CohortSaveState>;
}) {
  const choices = programs.filter(p => p.canManage || p.programKey === cohort?.programKey);
  const [programKey, setProgramKey] = useState(cohort?.programKey ?? defaultProgramKey ?? choices[0]?.programKey ?? "");
  const selected = choices.find(p => p.programKey === programKey);
  const [draft, setDraft] = useState({
    programName: "", tradeId: "", name: cohort?.name ?? "", term: cohort?.term ?? "",
    graduationDate: cohort?.graduationDate ?? "", status: cohort?.status ?? "active",
  });
  function update(field: keyof typeof draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }
  const [state, action, pending] = useActionState(saveAction, initialState);
  const title = cohort ? "Edit cohort" : newProgram ? "Add program & first cohort" : "Create cohort";

  return <WorkspaceForm modalTitle={title} busy={pending} action={action} className="form-stack"
    description={newProgram ? "Add a program by creating its first cohort. You can add more cohorts later." : "Choose the program and name your cohort. Add dates and other details when needed."}>
    <input type="hidden" name="cohortId" value={cohort?.cohortId ?? ""} />
    {newProgram ? <label><span>Program name (required)</span><input className="input" name="programName" required maxLength={200} placeholder="Electrical Technology" value={draft.programName} onChange={event => update("programName", event.target.value)} /></label> : <>
      <label><span>Program (required)</span><select className="select" required value={programKey} onChange={event => setProgramKey(event.target.value)}>
        <option value="">Choose a program</option>{choices.map(p => <option key={p.programKey} value={p.programKey}>{p.programName}</option>)}
      </select></label>
      <input type="hidden" name="programName" value={selected?.programName ?? ""} />
      <input type="hidden" name="tradeId" value={selected?.tradeId ?? ""} />
    </>}
    <label><span>{newProgram ? "First cohort name" : "Cohort name"} (required)</span><input className="input" name="name" required maxLength={200} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="Fall 2026 Electrical" /></label>
    <details open={cohort ? true : undefined}><summary>Additional details (optional)</summary><div className="form-stack">
      {newProgram ? <label><span>Trade code (optional)</span><input className="input" name="tradeId" maxLength={120} value={draft.tradeId} onChange={event => update("tradeId", event.target.value)} placeholder="electrical" /></label> : null}
      <label><span>Term (optional)</span><input className="input" name="term" maxLength={120} value={draft.term} onChange={event => update("term", event.target.value)} placeholder="Fall 2026" /></label>
      <label><span>Graduation date (optional)</span><input className="input" name="graduationDate" type="date" value={draft.graduationDate} onChange={event => update("graduationDate", event.target.value)} /></label>
      <label><span>Status</span><select className="select" name="status" value={draft.status} onChange={event => update("status", event.target.value)}>{statuses.map(status => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    </div></details>
    {state.message ? <div className="alert" role={state.ok ? "status" : "alert"}>{state.message}</div> : null}
    {state.ok ? <button className="button button-ghost" type="button" onClick={() => window.location.reload()}>Done — view programs and cohorts</button> : null}
    <button className="button button-dark" type="submit" disabled={pending || (state.ok && !cohort)}>{pending ? "Saving…" : cohort ? "Save changes" : newProgram ? "Create program & cohort" : "Create cohort"}</button>
  </WorkspaceForm>;
}
