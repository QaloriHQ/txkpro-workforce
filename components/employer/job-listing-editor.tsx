"use client";

import { useEffect, useRef, useState } from "react";
import {
  BLANK_JOB, canCreateJob, canEditJob,
  type JobEditableFields, type JobListing,
} from "@/lib/employer/job-listings";
import type { EmployerRole } from "@/lib/employer/types";

type EditorMode = "wizard" | "advanced";
const STAGES = ["Role & overview", "Location & compensation", "Requirements & benefits", "Review"] as const;
type InputKey = keyof JobEditableFields;

function editable(job: JobListing): JobEditableFields {
  return {
    title: job.title, summary: job.summary, description: job.description,
    locationCity: job.locationCity, locationState: job.locationState,
    remotePolicy: job.remotePolicy, employmentType: job.employmentType,
    payMin: job.payMin, payMax: job.payMax, payPeriod: job.payPeriod,
    shiftText: job.shiftText, requirements: job.requirements,
    benefits: job.benefits, skills: job.skills,
    applicationInstructions: job.applicationInstructions, isTemplate: job.isTemplate,
  };
}

function errorText(result: Response): Promise<string> {
  return result.clone().json().then((body: { error?: string }) => body.error || "Request failed")
    .catch(() => result.text().then((value) => value || "Request failed"));
}

export function JobListingEditor({
  initialJobs, employerId, role, legacyUserId,
}: {
  initialJobs: JobListing[]; employerId: string; role: EmployerRole; legacyUserId: string;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobEditableFields>({ ...BLANK_JOB });
  const [mode, setMode] = useState<EditorMode>("wizard");
  const [stage, setStage] = useState(0);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "jobs" | "templates">("all");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);

  const editGeneration = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const revisionRef = useRef(revision);
  const jobIdRef = useRef(selectedId);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  const conflictRef = useRef(conflict);
  revisionRef.current = revision;
  jobIdRef.current = selectedId;
  draftRef.current = draft;
  dirtyRef.current = dirty;
  conflictRef.current = conflict;

  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const canWrite = selected ? canEditJob(role, legacyUserId, selected.assignedHiringManagerUserId) && selected.status === "draft" : canCreateJob(role);
  const endpoint = "/api/employer/jobs?employerId=" + encodeURIComponent(employerId);

  function updateField<K extends InputKey>(key: K, value: JobEditableFields[K]) {
    if (!canWrite) return;
    draftRef.current = { ...draftRef.current, [key]: value };
    dirtyRef.current = true;
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setMessage("");
    editGeneration.current += 1;
  }

  function selectJob(job: JobListing) {
    jobIdRef.current = job.id;
    draftRef.current = editable(job);
    revisionRef.current = job.revision;
    dirtyRef.current = false;
    conflictRef.current = false;
    setSelectedId(job.id);
    setDraft(editable(job));
    setRevision(job.revision);
    setDirty(false);
    setConflict(false);
    setMessage("");
    setStage(0);
    setPreview(false);
    editGeneration.current += 1;
  }

  async function persist(): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    if (!jobIdRef.current || !dirtyRef.current) return true;
    if (conflictRef.current) return false;
    const jobId = jobIdRef.current;
    const snapshot = draftRef.current;
    const generation = editGeneration.current;
    const expectedRevision = revisionRef.current;
    const promise = (async () => {
      setSaving(true);
      try {
        const response = await fetch("/api/employer/jobs/" + encodeURIComponent(jobId) + "?employerId=" + encodeURIComponent(employerId), {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: expectedRevision, fields: snapshot }),
        });
        if (!response.ok) {
          if (response.status === 409) { conflictRef.current = true; setConflict(true); }
          throw new Error(await errorText(response));
        }
        const payload = await response.json() as { job: JobListing };
        setJobs((previous) => previous.map((item) => item.id === jobId ? payload.job : item));
        if (jobIdRef.current === jobId) {
          revisionRef.current = payload.job.revision;
          setRevision(payload.job.revision);
          if (editGeneration.current === generation) {
            dirtyRef.current = false;
            setDirty(false);
          }
        }
        setMessage("Saved as revision " + payload.job.revision);
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = promise;
    return promise;
  }

  useEffect(() => {
    if (!selectedId || !dirty || conflict) return;
    const timeout = window.setTimeout(() => { void persist(); }, 1200);
    return () => window.clearTimeout(timeout);
    // revision retriggers autosave after edits made while a save was in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, dirty, draft, revision, conflict]);

  async function beforeNavigate(): Promise<boolean> {
    // Flush each edit generation in order. Edits made during a network save
    // need their own revision; navigating early would silently discard them.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (inFlight.current && !(await inFlight.current)) return false;
      if (!dirtyRef.current) return !conflictRef.current;
      const generation = editGeneration.current;
      if (!(await persist())) return false;
      if (editGeneration.current === generation) return !conflictRef.current;
    }
    setMessage("Edits are still arriving; wait for autosave before opening another listing.");
    return false;
  }

  async function reloadSelected() {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/employer/jobs/" + encodeURIComponent(selectedId) + "?employerId=" + encodeURIComponent(employerId), { cache: "no-store" });
      if (!response.ok) throw new Error(await errorText(response));
      const { job } = await response.json() as { job: JobListing };
      setJobs((previous) => previous.map((item) => item.id === job.id ? job : item));
      selectJob(job);
      setMessage("Latest saved revision loaded. Unsaved local edits were discarded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reload failed"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function createJob(asTemplate: boolean) {
    if (busy || !canCreateJob(role) || !(await beforeNavigate())) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: asTemplate ? "New job template" : "Untitled job", isTemplate: asTemplate }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const { job } = await response.json() as { job: JobListing };
      setJobs((previous) => [job, ...previous]);
      selectJob(job);
      setFilter("all");
      setMessage("Draft created. Changes save automatically.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Create failed"); }
    finally { setBusy(false); }
  }

  async function duplicate(job: JobListing) {
    if (busy || !canCreateJob(role) || !(await beforeNavigate())) return;
    setBusy(true);
    try {
      const response = await fetch("/api/employer/jobs/" + encodeURIComponent(job.id) + "/duplicate?employerId=" + encodeURIComponent(employerId), { method: "POST" });
      if (!response.ok) throw new Error(await errorText(response));
      const payload = await response.json() as { job: JobListing };
      setJobs((previous) => [payload.job, ...previous]);
      selectJob(payload.job);
      setMessage("Duplicated into a private draft. No pipeline was copied.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Duplicate failed"); }
    finally { setBusy(false); }
  }

  async function open(job: JobListing) {
    if (job.id === selectedId || !(await beforeNavigate())) return;
    selectJob(job);
  }

  async function archive() {
    if (!selected || busy || !(role === "employer_owner" || role === "employer_admin") || !(await beforeNavigate())) return;
    setBusy(true);
    try {
      const response = await fetch("/api/employer/jobs/" + encodeURIComponent(selected.id) + "?employerId=" + encodeURIComponent(employerId), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revisionRef.current, action: "archive" }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const payload = await response.json() as { job: JobListing };
      setJobs((previous) => previous.map((item) => item.id === selected.id ? payload.job : item));
      selectJob(payload.job);
      setMessage("Draft archived.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Archive failed"); }
    finally { setBusy(false); }
  }

  function fieldLabel(label: string, content: React.ReactNode, hint?: string) {
    return <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <strong style={{ fontSize: 13 }}>{label}</strong>
      {content}
      {hint ? <small className="card-sub">{hint}</small> : null}
    </label>;
  }

  const text = (key: keyof Pick<JobEditableFields, "title" | "summary" | "locationCity" | "locationState" | "shiftText">, label: string, placeholder = "") =>
    fieldLabel(label, <input className="input" value={draft[key]} placeholder={placeholder} disabled={!canWrite} onChange={(event) => updateField(key, event.target.value)} />);
  const area = (key: keyof Pick<JobEditableFields, "description" | "applicationInstructions">, label: string, rows = 5) =>
    fieldLabel(label, <textarea className="textarea" rows={rows} value={draft[key]} disabled={!canWrite} onChange={(event) => updateField(key, event.target.value)} />);
  const lines = (key: keyof Pick<JobEditableFields, "requirements" | "benefits" | "skills">, label: string) =>
    fieldLabel(label, <textarea className="textarea" rows={4} value={draft[key].join("\n")} disabled={!canWrite}
      onChange={(event) => updateField(key, event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} />,
      "One item per line; up to 30.");

  function section(index: number, children: React.ReactNode) {
    return mode === "advanced" || stage === index ? <section className="card" key={index} style={{ display: "grid", gap: 14 }}>
      <h2 style={{ fontSize: 18 }}>{STAGES[index]}</h2>{children}
    </section> : null;
  }

  const filtered = jobs.filter((job) => filter === "all" || (filter === "templates" ? job.isTemplate : !job.isTemplate));

  return <div style={{ display: "grid", gridTemplateColumns: "minmax(250px, 340px) minmax(0, 1fr)", gap: 18, alignItems: "start" }} className="ats-job-layout">
    <aside className="card" style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div className="card-header">
        <div><h2>Job listings</h2><p className="card-sub">{jobs.length} employer-owned records</p></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="button button-brand button-small" type="button" onClick={() => void createJob(false)} disabled={busy || !canCreateJob(role)}>New job</button>
        <button className="button button-ghost button-small" type="button" onClick={() => void createJob(true)} disabled={busy || !canCreateJob(role)}>New template</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Filter listings">
        {(["all", "jobs", "templates"] as const).map((item) => <button className={"button button-small " + (filter === item ? "button-dark" : "button-ghost")} type="button" key={item} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "all" ? "All" : item === "jobs" ? "Jobs" : "Templates"}</button>)}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map((job) => <div key={job.id} style={{ display: "grid", gap: 7, padding: 12, border: job.id === selectedId ? "2px solid #21835a" : "1px solid var(--line)", borderRadius: 12 }}>
          <button type="button" onClick={() => void open(job)} style={{ border: 0, background: "none", color: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }} aria-current={job.id === selectedId ? "true" : undefined}>
            <strong>{job.title || "Untitled job"}</strong>
            <small style={{ display: "block", marginTop: 4 }}>{job.jobListingId} · {job.status} · revision {job.revision}{job.isTemplate ? " · Template" : ""}</small>
            <small style={{ display: "block" }}>{job.locationCity || "Location not set"}{job.locationState ? ", " + job.locationState : ""}</small>
          </button>
          <button className="button button-ghost button-small" type="button" disabled={busy || !canCreateJob(role)} onClick={() => void duplicate(job)}>Duplicate</button>
        </div>)}
        {!filtered.length ? <div className="empty">No listings in this view.</div> : null}
      </div>
    </aside>
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {!selected ? <div className="card">
        <h2>Build a professional job listing</h2>
        <p className="card-sub">Start with a private draft or reusable template. Switch between guided steps and a full editor at any time without losing fields.</p>
      </div> : <>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div className="card-header">
            <div><p className="eyebrow">{selected.jobListingId} · {selected.status}</p><h2>{draft.title || "Untitled job"}</h2></div>
            <span className="pill pill-neutral">{saving ? "Saving…" : conflict ? "Conflict" : dirty ? "Unsaved edits" : "Saved · r" + revision}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className={"button button-small " + (mode === "wizard" ? "button-dark" : "button-ghost")} aria-pressed={mode === "wizard"} onClick={() => { setMode("wizard"); setPreview(false); }}>Guided wizard</button>
            <button type="button" className={"button button-small " + (mode === "advanced" ? "button-dark" : "button-ghost")} aria-pressed={mode === "advanced"} onClick={() => { setMode("advanced"); setPreview(false); }}>Advanced editor</button>
            <button type="button" className="button button-ghost button-small" aria-pressed={preview} onClick={() => setPreview((value) => !value)}>{preview ? "Edit" : "Preview"}</button>
            <button type="button" className="button button-ghost button-small" onClick={() => void persist()} disabled={!canWrite || !dirty || saving || conflict}>Save now</button>
            <button type="button" className="button button-ghost button-small" onClick={() => void duplicate(selected)} disabled={busy || !canCreateJob(role)}>Duplicate</button>
          </div>
          <p className="card-sub">Private draft. Pipeline assignment and publication become available after ATS-02. Your editor mode is only a view; the saved listing is shared.</p>
          {!canWrite ? <div className="callout">This listing is read-only for your employer role or current assignment.</div> : null}
        </div>
        {preview ? <section className="card" aria-label="Job listing preview" style={{ display: "grid", gap: 12 }}>
          <p className="eyebrow">Applicant-facing preview · unpublished</p>
          <h2>{draft.title || "Untitled role"}</h2>
          <p>{[draft.locationCity, draft.locationState].filter(Boolean).join(", ") || "Location to be confirmed"} · {draft.remotePolicy.replace("_", " ")} · {draft.employmentType.replaceAll("_", " ")}</p>
          <p>{draft.summary}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.description}</p>
          {draft.payMin !== null || draft.payMax !== null ? <p><strong>Pay:</strong> {draft.payMin ?? "—"} – {draft.payMax ?? "—"} / {draft.payPeriod}</p> : null}
          <p><strong>Shift:</strong> {draft.shiftText || "To be confirmed"}</p>
          <div><h3>Requirements</h3><ul>{draft.requirements.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          <div><h3>Skills</h3><ul>{draft.skills.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          <div><h3>Benefits</h3><ul>{draft.benefits.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          <p>{draft.applicationInstructions}</p>
          <button className="button button-ghost" disabled type="button">Apply (available after publication)</button>
        </section> : <>
          {mode === "wizard" ? <nav aria-label="Job builder steps" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STAGES.map((label, i) => <button type="button" key={label} className={"button button-small " + (stage === i ? "button-dark" : "button-ghost")} aria-current={stage === i ? "step" : undefined} onClick={() => setStage(i)}>{i + 1}. {label}</button>)}
          </nav> : null}
          {section(0, <>
            {text("title", "Job title", "e.g. Apprentice Electrician")}
            {text("summary", "Short summary", "Write a concise introduction")}
            {area("description", "Full job description", 9)}
            {fieldLabel("Save as reusable job template", <input type="checkbox" checked={draft.isTemplate} disabled={!canWrite} onChange={(event) => updateField("isTemplate", event.target.checked)} />)}
          </>)}
          {section(1, <>
            <div className="form-grid">{text("locationCity", "City", "Texarkana")}{text("locationState", "State", "TX")}</div>
            <div className="form-grid">
              {fieldLabel("Workplace", <select className="select" value={draft.remotePolicy} disabled={!canWrite} onChange={(event) => updateField("remotePolicy", event.target.value as JobEditableFields["remotePolicy"])}><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select>)}
              {fieldLabel("Employment type", <select className="select" value={draft.employmentType} disabled={!canWrite} onChange={(event) => updateField("employmentType", event.target.value as JobEditableFields["employmentType"])}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="temporary">Temporary</option></select>)}
            </div>
            <div className="form-grid">
              {fieldLabel("Minimum pay", <input className="input" type="number" min="0" step="0.01" value={draft.payMin ?? ""} disabled={!canWrite} onChange={(event) => updateField("payMin", event.target.value === "" ? null : Number(event.target.value))} />)}
              {fieldLabel("Maximum pay", <input className="input" type="number" min="0" step="0.01" value={draft.payMax ?? ""} disabled={!canWrite} onChange={(event) => updateField("payMax", event.target.value === "" ? null : Number(event.target.value))} />)}
              {fieldLabel("Pay period", <select className="select" value={draft.payPeriod} disabled={!canWrite} onChange={(event) => updateField("payPeriod", event.target.value as JobEditableFields["payPeriod"])}><option value="hour">Hourly</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Annual</option></select>)}
            </div>
            {text("shiftText", "Shift & schedule", "Weekdays, 7:00 AM – 3:30 PM")}
          </>)}
          {section(2, <>
            {lines("requirements", "Required qualifications")}
            {lines("skills", "Skills")}
            {lines("benefits", "Benefits")}
            {area("applicationInstructions", "Applicant instructions", 3)}
          </>)}
          {section(3, <div style={{ display: "grid", gap: 9 }}>
            <p>Review the applicant-facing content using Preview. Save this private draft before leaving.</p>
            <p><strong>Job:</strong> {draft.title || "Untitled"}</p>
            <p><strong>Location:</strong> {[draft.locationCity, draft.locationState].filter(Boolean).join(", ") || "Incomplete"}</p>
            <p><strong>Requirements:</strong> {draft.requirements.length} · <strong>Skills:</strong> {draft.skills.length} · <strong>Benefits:</strong> {draft.benefits.length}</p>
            <div className="callout"><strong>Publication blocked:</strong> ATS-02 must provide a published pipeline version. This draft is not publicly visible.</div>
          </div>)}
          {mode === "wizard" ? <div style={{ display: "flex", gap: 9, justifyContent: "space-between" }}>
            <button className="button button-ghost" type="button" disabled={stage === 0} onClick={() => setStage((value) => Math.max(0, value - 1))}>Back</button>
            <button className="button button-brand" type="button" disabled={stage === 3} onClick={() => setStage((value) => Math.min(3, value + 1))}>Next step</button>
          </div> : null}
        </>}
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <strong>Publication readiness</strong>
          <p className="card-sub">Pipeline version assignment: unavailable until ATS-02. Publishing cannot be bypassed from this interface or the API.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="button button-brand" type="button" disabled title="ATS-02: published pipeline version required">Publish job (ATS-02)</button>
            {selected.status === "draft" && (role === "employer_owner" || role === "employer_admin") ? <button className="button button-ghost" type="button" disabled={busy || dirty || saving} onClick={() => void archive()}>Archive draft</button> : null}
          </div>
        </div>
      </>}
      {message ? <div className="callout" role={conflict ? "alert" : "status"}>{message}{conflict ? <button type="button" className="button button-ghost button-small" onClick={() => void reloadSelected()}>Discard local edits and reload latest revision</button> : null}</div> : null}
    </div>
  </div>;
}
