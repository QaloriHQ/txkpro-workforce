"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/lib/types";

type Institution = { institution_id: string; name: string | null; city: string | null; state: string | null };
type Data = Record<string, unknown>;

const roleCopy: Record<Role, { label: string; description: string }> = {
  student: { label: "Student", description: "Build your skills profile, job-readiness details, and local career preferences." },
  educator: { label: "Educator", description: "Connect to your institution so TXKPRO can verify access before student data is available." },
  employer: { label: "Employer", description: "Create your local hiring profile and contractor workforce account." },
  admin: { label: "TXKPRO Admin", description: "Finish your internal operations profile. Admin access must already be provisioned." },
};

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function OnboardingWizard({
  firstName,
  lastName,
  phone,
  provisionedRole,
  initialRole,
  initialStep,
  initialData,
  institutions,
  pending,
}: {
  firstName: string;
  lastName: string;
  phone: string | null;
  provisionedRole: Role | null;
  initialRole: Role | null;
  initialStep: number;
  initialData: Data;
  institutions: Institution[];
  pending: boolean;
}) {
  const allowedRoles = useMemo<Role[]>(() => provisionedRole ? [provisionedRole] : ["student", "educator", "employer"], [provisionedRole]);
  const [role, setRole] = useState<Role>(provisionedRole ?? initialRole ?? "student");
  const [step, setStep] = useState(Math.min(4, Math.max(1, initialStep || 1)));
  const [data, setData] = useState<Data>({ firstName, lastName, phone: phone ?? "", ...initialData });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setField(name: string, value: unknown) {
    setData((current) => ({ ...current, [name]: value }));
  }

  function toggleList(name: string, value: string) {
    const current = list(data[name]);
    setField(name, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function save(nextStep: number) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, currentStep: nextStep, profileData: data }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Unable to save onboarding.");
      return false;
    }
    setStep(nextStep);
    return true;
  }

  async function finish() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, profileData: data }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Unable to complete onboarding.");
      return;
    }
    window.location.href = body.redirectTo ?? "/dashboard";
  }

  if (pending) {
    return (
      <div className="onboarding-panel">
        <div className="success-mark">✓</div>
        <h2>Onboarding submitted</h2>
        <p className="muted">Your educator relationship is waiting for TXKPRO or your institution to approve it. Student records remain unavailable until that approval is complete.</p>
        <div className="hero-actions">
          <button className="button button-ghost" onClick={() => window.location.reload()} type="button">Check status</button>
          <form action="/auth/signout" method="post"><button className="button button-dark" type="submit">Sign out</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-panel">
      <div className="onboarding-progress" aria-label={`Step ${step} of 4`}>
        {[1, 2, 3, 4].map((item) => <span className={item <= step ? "active" : ""} key={item} />)}
      </div>
      <p className="eyebrow">Step {step} of 4</p>

      {step === 1 ? (
        <section>
          <h2>Choose your workforce role</h2>
          <p className="muted">Your role determines the onboarding questions and what you can access after setup.</p>
          <div className="role-grid role-grid-onboarding">
            {allowedRoles.map((item) => (
              <button className={role === item ? "role-option selected" : "role-option"} key={item} type="button" onClick={() => setRole(item)} disabled={Boolean(provisionedRole)}>
                <strong>{roleCopy[item].label}</strong><span>{roleCopy[item].description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h2>Your contact profile</h2>
          <p className="muted">Use information TXKPRO can use for account and workforce communication.</p>
          <div className="form-stack">
            <div className="grid grid-2">
              <label><span>First name</span><input className="input" value={String(data.firstName ?? "")} onChange={(e) => setField("firstName", e.target.value)} /></label>
              <label><span>Last name</span><input className="input" value={String(data.lastName ?? "")} onChange={(e) => setField("lastName", e.target.value)} /></label>
            </div>
            <label><span>Mobile phone</span><input className="input" type="tel" value={String(data.phone ?? "")} onChange={(e) => setField("phone", e.target.value)} placeholder="(903) 555-0123" /></label>
            {role === "student" ? <StudentBasics data={data} setField={setField} institutions={institutions} /> : null}
            {role === "educator" ? <EducatorBasics data={data} setField={setField} institutions={institutions} /> : null}
            {role === "employer" ? <EmployerBasics data={data} setField={setField} /> : null}
            {role === "admin" ? <label><span>Team / title</span><input className="input" value={String(data.title ?? "")} onChange={(e) => setField("title", e.target.value)} /></label> : null}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h2>{role === "student" ? "Job readiness & preferences" : role === "educator" ? "Teaching & placement" : role === "employer" ? "Hiring profile" : "Operations profile"}</h2>
          <p className="muted">These details make the first TXKPRO experience useful immediately after onboarding.</p>
          {role === "student" ? <StudentReadiness data={data} setField={setField} toggleList={toggleList} /> : null}
          {role === "educator" ? <EducatorDetails data={data} setField={setField} toggleList={toggleList} /> : null}
          {role === "employer" ? <EmployerDetails data={data} setField={setField} toggleList={toggleList} /> : null}
          {role === "admin" ? <div className="callout"><strong>Administrator access</strong>Your existing TXKPRO role membership controls internal permissions. Onboarding does not grant or elevate admin access.</div> : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h2>Review and finish</h2>
          <p className="muted">You are creating a <strong>{roleCopy[role].label}</strong> workforce profile.</p>
          <div className="review-grid">
            <div><span>Name</span><strong>{String(data.firstName ?? "")} {String(data.lastName ?? "")}</strong></div>
            <div><span>Phone</span><strong>{String(data.phone ?? "Not provided")}</strong></div>
            {role === "student" ? <><div><span>Trade</span><strong>{String(data.primaryTrade ?? "Not selected")}</strong></div><div><span>Location</span><strong>{String(data.city ?? "")}, {String(data.state ?? "")}</strong></div></> : null}
            {role === "educator" ? <div><span>Institution</span><strong>{institutions.find((item) => item.institution_id === data.institutionId)?.name ?? "Not selected"}</strong></div> : null}
            {role === "employer" ? <><div><span>Business</span><strong>{String(data.businessName ?? "Not provided")}</strong></div><div><span>Hiring trades</span><strong>{list(data.tradesHiring).join(", ") || "Not selected"}</strong></div></> : null}
          </div>
          {role === "educator" && !provisionedRole ? <div className="alert" style={{ marginTop: 18 }}>Educator access is submitted for institution verification. You will not receive student-record access until the relationship is approved.</div> : null}
          {role === "employer" ? <div className="alert" style={{ marginTop: 18 }}>Your employer account can be created immediately, while contractor approval remains a separate TXKPRO review state.</div> : null}
        </section>
      ) : null}

      {message ? <div className="alert" style={{ marginTop: 18 }}>{message}</div> : null}
      <div className="wizard-actions">
        {step > 1 ? <button className="button button-ghost" type="button" onClick={() => setStep(step - 1)} disabled={busy}>Back</button> : <span />}
        {step < 4 ? <button className="button button-dark" type="button" onClick={() => save(step + 1)} disabled={busy}>{busy ? "Saving…" : "Save & continue"}</button> : <button className="button button-brand" type="button" onClick={finish} disabled={busy}>{busy ? "Finishing…" : role === "educator" && !provisionedRole ? "Submit for approval" : "Finish onboarding"}</button>}
      </div>
    </div>
  );
}

function StudentBasics({ data, setField, institutions }: { data: Data; setField: (n: string, v: unknown) => void; institutions: Institution[] }) {
  return <>
    <label><span>School / training institution</span><select className="select" value={String(data.schoolId ?? "")} onChange={(e) => setField("schoolId", e.target.value)}><option value="">Select an institution</option>{institutions.map((item) => <option key={item.institution_id} value={item.institution_id}>{item.name}{item.city ? ` — ${item.city}` : ""}</option>)}</select></label>
    <div className="grid grid-2"><label><span>Program type</span><input className="input" value={String(data.programType ?? "")} onChange={(e) => setField("programType", e.target.value)} placeholder="HVAC, Electrical, Welding…" /></label><label><span>Primary trade</span><input className="input" value={String(data.primaryTrade ?? "")} onChange={(e) => setField("primaryTrade", e.target.value)} placeholder="HVAC" /></label></div>
    <div className="grid grid-3"><label><span>City</span><input className="input" value={String(data.city ?? "")} onChange={(e) => setField("city", e.target.value)} /></label><label><span>State</span><input className="input" value={String(data.state ?? "TX")} onChange={(e) => setField("state", e.target.value)} /></label><label><span>ZIP</span><input className="input" value={String(data.zipCode ?? "")} onChange={(e) => setField("zipCode", e.target.value)} /></label></div>
    <label><span>Expected graduation year</span><input className="input" inputMode="numeric" value={String(data.graduationYear ?? "")} onChange={(e) => setField("graduationYear", e.target.value)} placeholder="2027" /></label>
  </>;
}

function EducatorBasics({ data, setField, institutions }: { data: Data; setField: (n: string, v: unknown) => void; institutions: Institution[] }) {
  return <>
    <label><span>Institution</span><select className="select" required value={String(data.institutionId ?? "")} onChange={(e) => setField("institutionId", e.target.value)}><option value="">Select your institution</option>{institutions.map((item) => <option key={item.institution_id} value={item.institution_id}>{item.name}{item.city ? ` — ${item.city}` : ""}</option>)}</select></label>
    <label><span>Title / role</span><input className="input" value={String(data.educatorTitle ?? "")} onChange={(e) => setField("educatorTitle", e.target.value)} placeholder="HVAC Instructor" /></label>
  </>;
}

function EmployerBasics({ data, setField }: { data: Data; setField: (n: string, v: unknown) => void }) {
  return <>
    <label><span>Business name</span><input className="input" required value={String(data.businessName ?? "")} onChange={(e) => setField("businessName", e.target.value)} /></label>
    <div className="grid grid-2"><label><span>Business phone</span><input className="input" type="tel" value={String(data.businessPhone ?? "")} onChange={(e) => setField("businessPhone", e.target.value)} /></label><label><span>Website</span><input className="input" type="url" value={String(data.website ?? "")} onChange={(e) => setField("website", e.target.value)} /></label></div>
    <div className="grid grid-3"><label><span>City</span><input className="input" value={String(data.city ?? "")} onChange={(e) => setField("city", e.target.value)} /></label><label><span>State</span><input className="input" value={String(data.state ?? "TX")} onChange={(e) => setField("state", e.target.value)} /></label><label><span>ZIP</span><input className="input" value={String(data.zipCode ?? "")} onChange={(e) => setField("zipCode", e.target.value)} /></label></div>
  </>;
}

const readinessOptions = [{ key: "validDriversLicense", label: "I have a valid driver's license" }, { key: "cleanDrivingRecord", label: "I attest that my driving record meets typical employer insurance requirements" }, { key: "willingBackgroundCheck", label: "I am willing to complete a lawful, job-related background check" }, { key: "willingDrugScreen", label: "I am willing to complete a lawful, job-related drug screen" }];
function StudentReadiness({ data, setField, toggleList }: { data: Data; setField: (n: string, v: unknown) => void; toggleList: (n: string, v: string) => void }) {
  return <div className="form-stack">
    <div className="check-grid">{readinessOptions.map((item) => <label className="check-card" key={item.key}><input type="checkbox" checked={data[item.key] === true} onChange={(e) => setField(item.key, e.target.checked)} /><span>{item.label}</span></label>)}</div>
    <ChoiceGroup title="Shift preferences" name="shiftPreferences" values={["Weekdays", "Evenings", "Weekends", "On-call"]} selected={list(data.shiftPreferences)} toggle={toggleList} />
    <ChoiceGroup title="Work preferences" name="workPreferences" values={["Residential service", "Commercial service", "New construction", "Maintenance"]} selected={list(data.workPreferences)} toggle={toggleList} />
    <label><span>About your goals</span><textarea className="input" rows={4} value={String(data.about ?? "")} onChange={(e) => setField("about", e.target.value)} /></label>
    <label className="check-card"><input type="checkbox" checked={data.discoverable === true} onChange={(e) => setField("discoverable", e.target.checked)} /><span>Make my workforce profile discoverable to approved TXKPRO employers when eligibility rules are met.</span></label>
  </div>;
}

function EducatorDetails({ data, setField, toggleList }: { data: Data; setField: (n: string, v: unknown) => void; toggleList: (n: string, v: string) => void }) {
  return <div className="form-stack"><ChoiceGroup title="Programs / trades you support" name="educatorTrades" values={["HVAC", "Electrical", "Plumbing", "Welding", "Construction", "Automotive"]} selected={list(data.educatorTrades)} toggle={toggleList} /><label className="check-card"><input type="checkbox" checked={data.canVerifySkills !== false} onChange={(e) => setField("canVerifySkills", e.target.checked)} /><span>I need skill-verification access for students assigned to my institution.</span></label><label className="check-card"><input type="checkbox" checked={data.canReferStudents !== false} onChange={(e) => setField("canReferStudents", e.target.checked)} /><span>I need referral/placement access for eligible students.</span></label></div>;
}

function EmployerDetails({ data, setField, toggleList }: { data: Data; setField: (n: string, v: unknown) => void; toggleList: (n: string, v: string) => void }) {
  return <div className="form-stack"><ChoiceGroup title="Trades you hire" name="tradesHiring" values={["HVAC", "Electrical", "Plumbing", "Welding", "Construction", "Automotive"]} selected={list(data.tradesHiring)} toggle={toggleList} /><label><span>Years in business</span><input className="input" value={String(data.yearsInBusiness ?? "")} onChange={(e) => setField("yearsInBusiness", e.target.value)} /></label><label><span>Hiring needs</span><textarea className="input" rows={4} value={String(data.hiringNeeds ?? "")} onChange={(e) => setField("hiringNeeds", e.target.value)} placeholder="Entry-level HVAC service technicians, apprentices…" /></label><label><span>Business description</span><textarea className="input" rows={4} value={String(data.businessDescription ?? "")} onChange={(e) => setField("businessDescription", e.target.value)} /></label></div>;
}

function ChoiceGroup({ title, name, values, selected, toggle }: { title: string; name: string; values: string[]; selected: string[]; toggle: (n: string, v: string) => void }) {
  return <div><strong className="field-title">{title}</strong><div className="choice-row">{values.map((value) => <button className={selected.includes(value) ? "choice-pill selected" : "choice-pill"} key={value} type="button" onClick={() => toggle(name, value)}>{value}</button>)}</div></div>;
}
