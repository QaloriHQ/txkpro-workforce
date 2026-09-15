"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Check, Metric, Pill } from "@/components/ui";
import { demoStudents } from "@/lib/demo-data";

export default function EmployerDemo() {
  const [query, setQuery] = useState("");
  const [licenseOnly, setLicenseOnly] = useState(true);
  const [cleanRecordOnly, setCleanRecordOnly] = useState(false);
  const [minVerified, setMinVerified] = useState(10);

  const filtered = useMemo(() => demoStudents.filter((student) => {
    const matchesQuery = `${student.name} ${student.program} ${student.city} ${student.readiness.workPreferences.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (licenseOnly && student.readiness.validDriversLicense !== true) return false;
    if (cleanRecordOnly && student.readiness.cleanDrivingRecord !== true) return false;
    if (student.verifiedSkills < minVerified) return false;
    return true;
  }), [query, licenseOnly, cleanRecordOnly, minVerified]);

  return (
    <Shell active="employer" eyebrow="Employer workspace" title="Find talent you can trust faster.">
      <div className="grid grid-4">
        <Metric label="Matching candidates" value={filtered.length} detail="Current filters" />
        <Metric label="Instructor referrals" value="4" detail="2 new this week" />
        <Metric label="Active placements" value="6" detail="Across 3 crews" />
        <Metric label="Retention flags" value="1" detail="Needs follow-up" />
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <h2>Verified local talent</h2>
            <p className="card-sub">Filter by job-relevant readiness and instructor-verified competencies. Final hiring decisions remain with your team.</p>
          </div>
          <Pill tone="good">Greater Texarkana</Pill>
        </div>

        <div className="filter-bar">
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skill, program, candidate, city…" />
          <label className="button button-ghost button-small"><input type="checkbox" checked={licenseOnly} onChange={(e) => setLicenseOnly(e.target.checked)} /> License</label>
          <label className="button button-ghost button-small"><input type="checkbox" checked={cleanRecordOnly} onChange={(e) => setCleanRecordOnly(e.target.checked)} /> Clean record</label>
          <select className="select" value={minVerified} onChange={(e) => setMinVerified(Number(e.target.value))}>
            <option value={0}>Any skill count</option>
            <option value={10}>10+ verified</option>
            <option value={15}>15+ verified</option>
            <option value={20}>20+ verified</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Candidate</th><th>Program</th><th>Verified</th><th>License</th><th>Driving attestation</th><th>Fit</th><th></th></tr></thead>
            <tbody>
              {filtered.map((student) => (
                <tr key={student.id}>
                  <td><div className="profile-line"><span className="avatar">{student.name.split(" ").map((n) => n[0]).join("")}</span><div><strong>{student.name}</strong><div className="muted">{student.city}</div></div></div></td>
                  <td>{student.program}<div className="muted">{student.school}</div></td>
                  <td><strong>{student.verifiedSkills}</strong> skills</td>
                  <td><Check value={student.readiness.validDriversLicense} /></td>
                  <td><Check value={student.readiness.cleanDrivingRecord} /></td>
                  <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{student.readiness.workPreferences.slice(0,2).map((p) => <Pill key={p}>{p}</Pill>)}</div></td>
                  <td><button className="button button-dark button-small">Request intro</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <section className="card">
          <h3>Instructor referral</h3>
          <p className="card-sub">Alyssa Moore was referred by David Turner for your electrical apprentice pipeline.</p>
          <div className="callout" style={{ marginTop: 14 }}><strong>21 instructor-verified skills</strong>Commercial construction · Residential rough-in · Valid license attested.</div>
          <button className="button button-brand" style={{ marginTop: 14 }}>Review full profile</button>
        </section>
        <section className="card">
          <h3>90-day retention pulse</h3>
          <p className="card-sub">One active placement needs a human check-in before a small problem turns into turnover.</p>
          <div className="alert" style={{ marginTop: 14 }}><strong>Jordan Mills · Day 30</strong><div className="muted" style={{ marginTop: 4 }}>Student selected “Having issues”; employer selected “Okay.”</div></div>
          <button className="button button-ghost" style={{ marginTop: 14 }}>Open retention case</button>
        </section>
      </div>
    </Shell>
  );
}
