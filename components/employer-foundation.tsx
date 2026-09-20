"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  EmployerCompanyProfile,
  EmployerContext,
  HiringNeed,
} from "@/lib/employer/types";

type Props = {
  initialContext: EmployerContext;
  initialCompany: EmployerCompanyProfile;
  initialHiringNeeds: HiringNeed[];
};

function list(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Request failed.",
    );
  }
  return body as T;
}

export function EmployerFoundation({
  initialContext,
  initialCompany,
  initialHiringNeeds,
}: Props) {
  const [context] = useState(initialContext);
  const [company, setCompany] = useState(initialCompany);
  const [hiringNeeds, setHiringNeeds] = useState(initialHiringNeeds);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [needBusy, setNeedBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canManageCompany =
    context.role === "employer_owner" || context.role === "employer_admin";
  const canCreateHiringNeed =
    context.approvalStatus === "approved" &&
    ["employer_owner", "employer_admin", "recruiter"].includes(context.role);

  const statusTone = useMemo(
    () => (context.approvalStatus === "approved" ? "pill-good" : ""),
    [context.approvalStatus],
  );

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageCompany) return;
    setCompanyBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const result = await jsonRequest<{ company: EmployerCompanyProfile }>(
        "/api/employer/company",
        {
          method: "PATCH",
          body: JSON.stringify({
            businessName: String(form.get("businessName") ?? ""),
            businessPhone: String(form.get("businessPhone") ?? "") || null,
            website: String(form.get("website") ?? "") || null,
            description: String(form.get("description") ?? "") || null,
            yearsInBusiness: String(form.get("yearsInBusiness") ?? "") || null,
            operatingBaseZip: String(form.get("operatingBaseZip") ?? "") || null,
            city: String(form.get("city") ?? "") || null,
            state: String(form.get("state") ?? "") || null,
            serviceArea: {
              cities: list(String(form.get("serviceCities") ?? "")),
            },
            tradeIds: list(String(form.get("tradeIds") ?? "")),
            hiringRoles: list(String(form.get("hiringRoles") ?? "")),
            annualHiringVolume: form.get("annualHiringVolume")
              ? Number(form.get("annualHiringVolume"))
              : null,
            hiringHorizon: String(form.get("hiringHorizon") ?? "") || null,
            workforceDescription:
              String(form.get("workforceDescription") ?? "") || null,
          }),
        },
      );
      setCompany(result.company);
      setMessage("Company Profile saved to Supabase.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setCompanyBusy(false);
    }
  }

  async function createNeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateHiringNeed) return;
    setNeedBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const result = await jsonRequest<{ hiringNeed: HiringNeed }>(
        "/api/employer/hiring-needs",
        {
          method: "POST",
          body: JSON.stringify({
            title: String(form.get("title") ?? ""),
            tradeId: String(form.get("tradeId") ?? "") || null,
            roleType: String(form.get("roleType") ?? "") || null,
            targetHires: Number(form.get("targetHires") ?? 1),
            targetHireDate: String(form.get("targetHireDate") ?? "") || null,
            serviceArea: {
              cities: list(String(form.get("serviceCities") ?? "")),
            },
            workTypes: list(String(form.get("workTypes") ?? "")),
            shifts: list(String(form.get("shifts") ?? "")),
            requiredVerifiedSkills: list(
              String(form.get("requiredSkills") ?? ""),
            ),
            optionalVerifiedSkills: list(
              String(form.get("optionalSkills") ?? ""),
            ),
            minimumVerifiedSkillCount: Number(
              form.get("minimumVerifiedSkillCount") ?? 0,
            ),
            requiresDriversLicense:
              form.get("requiresDriversLicense") === "on",
            requiresDrivingRecordAttestation:
              form.get("requiresDrivingRecordAttestation") === "on",
            requiresBackgroundWillingness:
              form.get("requiresBackgroundWillingness") === "on",
            requiresDrugScreenWillingness:
              form.get("requiresDrugScreenWillingness") === "on",
            sharedNotes: String(form.get("sharedNotes") ?? "") || null,
            status: "draft",
            visibility: "employer_private",
          }),
        },
      );
      setHiringNeeds((current) => [result.hiringNeed, ...current]);
      event.currentTarget.reset();
      setMessage("Draft Hiring Need saved to Supabase.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create Hiring Need.",
      );
    } finally {
      setNeedBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-4">
        <div className="metric">
          <div className="metric-label">Employer</div>
          <div className="metric-value" style={{ fontSize: 18 }}>
            {context.employerName}
          </div>
          <div className="metric-detail">{context.employerId}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Role</div>
          <div className="metric-value" style={{ fontSize: 18 }}>
            {context.role.replaceAll("_", " ")}
          </div>
          <div className="metric-detail">Server-resolved membership</div>
        </div>
        <div className="metric">
          <div className="metric-label">Approval</div>
          <div className="metric-value" style={{ fontSize: 18 }}>
            {context.approvalStatus}
          </div>
          <div className="metric-detail">TXKPRO-controlled state</div>
        </div>
        <div className="metric">
          <div className="metric-label">Hiring Needs</div>
          <div className="metric-value">{hiringNeeds.length}</div>
          <div className="metric-detail">Persistent canonical records</div>
        </div>
      </div>

      {message ? (
        <div className="callout" style={{ marginTop: 18 }}>
          <strong>Production integration</strong>
          {message}
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <form className="card" onSubmit={saveCompany}>
          <div className="card-header">
            <div>
              <h2>Company Profile</h2>
              <p className="card-sub">
                Employer-owned fields persist to the shared Workforce backend.
                Approval fields remain TXKPRO-controlled.
              </p>
            </div>
            <span className={`pill ${statusTone}`}>
              {context.approvalStatus}
            </span>
          </div>

          <div className="form-grid">
            <label>
              <span>Business name</span>
              <input
                className="input"
                name="businessName"
                defaultValue={company.businessName}
                disabled={!canManageCompany}
                required
              />
            </label>
            <label>
              <span>Business phone</span>
              <input
                className="input"
                name="businessPhone"
                defaultValue={company.businessPhone ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>Website</span>
              <input
                className="input"
                name="website"
                defaultValue={company.website ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>Years in business</span>
              <input
                className="input"
                name="yearsInBusiness"
                defaultValue={company.yearsInBusiness ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>City</span>
              <input
                className="input"
                name="city"
                defaultValue={company.city ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>State</span>
              <input
                className="input"
                name="state"
                defaultValue={company.state ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>ZIP</span>
              <input
                className="input"
                name="operatingBaseZip"
                defaultValue={company.operatingBaseZip ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>Annual hiring volume</span>
              <input
                className="input"
                type="number"
                min="0"
                name="annualHiringVolume"
                defaultValue={company.annualHiringVolume ?? ""}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>Service cities</span>
              <input
                className="input"
                name="serviceCities"
                defaultValue={
                  Array.isArray(company.serviceArea.cities)
                    ? company.serviceArea.cities.join(", ")
                    : ""
                }
                disabled={!canManageCompany}
                placeholder="Texarkana, New Boston"
              />
            </label>
            <label>
              <span>Trades hiring</span>
              <input
                className="input"
                name="tradeIds"
                defaultValue={company.tradeIds.join(", ")}
                disabled={!canManageCompany}
                placeholder="electrical, welding"
              />
            </label>
            <label>
              <span>Hiring roles</span>
              <input
                className="input"
                name="hiringRoles"
                defaultValue={company.hiringRoles.join(", ")}
                disabled={!canManageCompany}
              />
            </label>
            <label>
              <span>Hiring horizon</span>
              <input
                className="input"
                name="hiringHorizon"
                defaultValue={company.hiringHorizon ?? ""}
                disabled={!canManageCompany}
                placeholder="Next 90 days"
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 14 }}>
            <span>Company description</span>
            <textarea
              className="textarea"
              name="description"
              defaultValue={company.description ?? ""}
              disabled={!canManageCompany}
            />
          </label>
          <label style={{ display: "block", marginTop: 14 }}>
            <span>Workforce description</span>
            <textarea
              className="textarea"
              name="workforceDescription"
              defaultValue={company.workforceDescription ?? ""}
              disabled={!canManageCompany}
            />
          </label>

          <button
            className="button button-brand"
            type="submit"
            disabled={!canManageCompany || companyBusy}
            style={{ marginTop: 14 }}
          >
            {companyBusy ? "Saving…" : canManageCompany ? "Save Company Profile" : "Read-only"}
          </button>
        </form>

        <form className="card" onSubmit={createNeed}>
          <div className="card-header">
            <div>
              <h2>Create Hiring Need</h2>
              <p className="card-sub">
                Structured employer demand with explicit criteria. This does not
                create a public job posting.
              </p>
            </div>
            <span className="pill">Draft</span>
          </div>

          {context.approvalStatus !== "approved" ? (
            <div className="alert">
              <strong>Employer approval required</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                Company setup remains available, but Hiring Need creation is
                gated until TXKPRO approves the Employer.
              </div>
            </div>
          ) : null}

          <div className="form-grid" style={{ marginTop: 14 }}>
            <label>
              <span>Internal title</span>
              <input className="input" name="title" required disabled={!canCreateHiringNeed} />
            </label>
            <label>
              <span>Trade</span>
              <input className="input" name="tradeId" disabled={!canCreateHiringNeed} placeholder="electrical" />
            </label>
            <label>
              <span>Role type</span>
              <input className="input" name="roleType" disabled={!canCreateHiringNeed} placeholder="technician" />
            </label>
            <label>
              <span>Target hires</span>
              <input className="input" name="targetHires" type="number" min="1" defaultValue="1" disabled={!canCreateHiringNeed} />
            </label>
            <label>
              <span>Target hire date</span>
              <input className="input" name="targetHireDate" type="date" disabled={!canCreateHiringNeed} />
            </label>
            <label>
              <span>Service cities</span>
              <input className="input" name="serviceCities" disabled={!canCreateHiringNeed} placeholder="Texarkana" />
            </label>
            <label>
              <span>Work types</span>
              <input className="input" name="workTypes" disabled={!canCreateHiringNeed} placeholder="Full-time, Apprenticeship" />
            </label>
            <label>
              <span>Shifts</span>
              <input className="input" name="shifts" disabled={!canCreateHiringNeed} placeholder="Day" />
            </label>
            <label>
              <span>Required verified skills</span>
              <input className="input" name="requiredSkills" disabled={!canCreateHiringNeed} />
            </label>
            <label>
              <span>Optional verified skills</span>
              <input className="input" name="optionalSkills" disabled={!canCreateHiringNeed} />
            </label>
            <label>
              <span>Minimum verified-skill count</span>
              <input className="input" name="minimumVerifiedSkillCount" type="number" min="0" defaultValue="0" disabled={!canCreateHiringNeed} />
            </label>
          </div>

          <div className="readiness-list" style={{ marginTop: 14 }}>
            <label className="readiness-row"><span>Driver&apos;s license required</span><input type="checkbox" name="requiresDriversLicense" disabled={!canCreateHiringNeed} /></label>
            <label className="readiness-row"><span>Driving-record attestation required</span><input type="checkbox" name="requiresDrivingRecordAttestation" disabled={!canCreateHiringNeed} /></label>
            <label className="readiness-row"><span>Background-screen willingness required</span><input type="checkbox" name="requiresBackgroundWillingness" disabled={!canCreateHiringNeed} /></label>
            <label className="readiness-row"><span>Drug-screen willingness required</span><input type="checkbox" name="requiresDrugScreenWillingness" disabled={!canCreateHiringNeed} /></label>
          </div>

          <label style={{ display: "block", marginTop: 14 }}>
            <span>Shared requirement notes</span>
            <textarea className="textarea" name="sharedNotes" disabled={!canCreateHiringNeed} />
          </label>

          <button
            className="button button-brand"
            type="submit"
            disabled={!canCreateHiringNeed || needBusy}
            style={{ marginTop: 14 }}
          >
            {needBusy ? "Saving…" : "Save Draft Hiring Need"}
          </button>
        </form>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <h2>Persistent Hiring Needs</h2>
            <p className="card-sub">
              Loaded from <code>wf_hiring_needs</code> through the authenticated
              Supabase session and RLS.
            </p>
          </div>
          <span className="pill">{hiringNeeds.length} records</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hiring Need</th>
                <th>Trade</th>
                <th>Target</th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {hiringNeeds.length ? (
                hiringNeeds.map((need) => (
                  <tr key={need.hiringNeedId}>
                    <td>
                      <strong>{need.title}</strong>
                      <div className="muted">{need.hiringNeedId}</div>
                    </td>
                    <td>{need.tradeId ?? "—"}</td>
                    <td>{need.targetHires}</td>
                    <td><span className="pill">{need.status}</span></td>
                    <td>{need.visibility.replaceAll("_", " ")}</td>
                    <td>{need.version}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <strong>No Hiring Needs yet</strong>
                      Create the first draft after Employer approval.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
