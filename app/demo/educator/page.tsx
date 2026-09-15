"use client";

import { useState } from "react";
import { Shell } from "@/components/shell";
import { Check, Metric, Pill } from "@/components/ui";
import { demoStudents } from "@/lib/demo-data";

export default function EducatorDemo() {
  const [students, setStudents] = useState(demoStudents);
  const [notice, setNotice] = useState<string | null>(null);

  function verifyStudent(studentId: string) {
    setStudents((current) => current.map((student) => student.id === studentId
      ? { ...student, verifiedSkills: Math.min(student.totalSkills, student.verifiedSkills + 1) }
      : student));
    setNotice("Skill verified and added to the student’s live profile.");
  }

  function referStudent(name: string) {
    setNotice(`${name} was referred to LiveWire Electric. The employer can now review the verified profile.`);
  }

  return (
    <Shell active="educator" eyebrow="Educator workspace" title="Verify once. Refer with confidence.">
      <div className="grid grid-4">
        <Metric label="Active students" value="26" detail="3 programs" />
        <Metric label="Skills verified" value="184" detail="This term" />
        <Metric label="Employer referrals" value="17" detail="8 contacted" />
        <Metric label="Placed students" value="9" detail="Current cohort" />
      </div>

      {notice ? <div className="callout" style={{ marginTop: 18 }}><strong>Action complete</strong>{notice}</div> : null}

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <h2>HVAC Technology roster</h2>
            <p className="card-sub">Use the skills matrix as the placement record. Verify demonstrated competencies, then refer directly to local employers.</p>
          </div>
          <Pill tone="info">Fall 2026</Pill>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Student</th><th>Verified skills</th><th>Job-ready</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const pct = Math.round((student.verifiedSkills / student.totalSkills) * 100);
                const ready = student.readiness.validDriversLicense === true && student.readiness.willingBackgroundCheck === true && student.readiness.willingDrugScreen === true;
                return (
                  <tr key={student.id}>
                    <td>
                      <div className="profile-line">
                        <span className="avatar">{student.name.split(" ").map((n) => n[0]).join("")}</span>
                        <div><strong>{student.name}</strong><div className="muted">{student.city}</div></div>
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <div><strong>{student.verifiedSkills}/{student.totalSkills}</strong> <span className="muted">({pct}%)</span></div>
                      <div className="progress" style={{ marginTop: 7 }}><span style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td><Check value={ready} /></td>
                    <td><Pill tone={student.status === "available" ? "good" : "info"}>{student.status}</Pill></td>
                    <td>
                      <div style={{ display: "flex", gap: 7 }}>
                        <button className="button button-ghost button-small" onClick={() => verifyStudent(student.id)}>Verify skill</button>
                        <button className="button button-dark button-small" onClick={() => referStudent(student.name)}>Refer</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <section className="card">
          <h3>Students needing job-readiness coaching</h3>
          <p className="card-sub">Surface non-technical blockers before placement outreach begins.</p>
          <div className="readiness-list" style={{ marginTop: 16 }}>
            <div className="readiness-row"><span>Marcus Reed · Driving record attestation incomplete</span><Pill tone="warn">Needs follow-up</Pill></div>
            <div className="readiness-row"><span>Kayla Smith · Shift preferences incomplete</span><Pill tone="neutral">Profile gap</Pill></div>
          </div>
        </section>
        <section className="card">
          <h3>Placement evidence</h3>
          <p className="card-sub">A living trail of verified skill → referral → contact → hire → 90-day retention.</p>
          <div className="callout" style={{ marginTop: 16 }}><strong>9 current placements</strong>7 are past day 30 · 5 are past day 60 · 4 completed day 90.</div>
        </section>
      </div>
    </Shell>
  );
}
