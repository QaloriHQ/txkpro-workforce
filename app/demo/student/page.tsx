"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Check, Metric, Pill } from "@/components/ui";
import { demoSkills } from "@/lib/demo-data";
import type { JobReadiness, SkillStatus } from "@/lib/types";

const statusLabel: Record<SkillStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  self_attested: "Ready for verification",
  verified: "Instructor verified",
};

export default function StudentDemo() {
  const [skills, setSkills] = useState(demoSkills);
  const [readiness, setReadiness] = useState<JobReadiness>({
    validDriversLicense: true,
    cleanDrivingRecord: true,
    willingBackgroundCheck: true,
    willingDrugScreen: true,
    shiftPreferences: ["Day shift", "On-call rotation"],
    workPreferences: ["Residential service", "Light commercial"],
    discoverable: true,
  });

  const verified = useMemo(() => skills.filter((s) => s.status === "verified").length, [skills]);

  function toggleAttestation(id: string) {
    setSkills((current) => current.map((skill) => {
      if (skill.id !== id || skill.status === "verified") return skill;
      return { ...skill, status: skill.status === "self_attested" ? "learning" : "self_attested" };
    }));
  }

  function toggleReadiness(key: keyof Pick<JobReadiness, "validDriversLicense" | "cleanDrivingRecord" | "willingBackgroundCheck" | "willingDrugScreen">) {
    setReadiness((current) => ({ ...current, [key]: current[key] === true ? null : true }));
  }

  return (
    <Shell active="student" eyebrow="Student workspace" title="Your skills are your résumé.">
      <div className="grid grid-4">
        <Metric label="Verified skills" value={verified} detail={`${skills.length} shown in demo`} />
        <Metric label="Profile strength" value="86%" detail="Add 2 more instructor verifications" />
        <Metric label="Employer referrals" value="2" detail="1 viewed this week" />
        <Metric label="Job-ready status" value="Ready" detail="Core attestations complete" />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Verified Skills Matrix</h2>
              <p className="card-sub">Mark skills you can demonstrate. Your instructor converts self-attestation into a verified competency.</p>
            </div>
            <Pill tone="good">HVAC Technology</Pill>
          </div>
          <div className="skill-list">
            {skills.map((skill) => (
              <div className="skill-row" key={skill.id}>
                <div>
                  <div className="skill-title">{skill.name}</div>
                  <div className="skill-meta">{skill.category} · {skill.description}</div>
                  {skill.verifiedBy ? <div className="skill-meta">Verified by {skill.verifiedBy} · {skill.verifiedAt}</div> : null}
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <Pill tone={skill.status === "verified" ? "good" : skill.status === "self_attested" ? "info" : "neutral"}>{statusLabel[skill.status]}</Pill>
                  {skill.status !== "verified" ? (
                    <button className="button button-ghost button-small" onClick={() => toggleAttestation(skill.id)}>
                      {skill.status === "self_attested" ? "Undo" : "I can do this"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="grid">
          <section className="card">
            <div className="card-header">
              <div>
                <h3>Job-Ready Profile</h3>
                <p className="card-sub">These are candidate attestations, not third-party verification.</p>
              </div>
            </div>
            <div className="readiness-list">
              <button className="readiness-row" onClick={() => toggleReadiness("validDriversLicense")} style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0, width: "100%", cursor: "pointer" }}>
                <span>Valid driver’s license</span><Check value={readiness.validDriversLicense} />
              </button>
              <button className="readiness-row" onClick={() => toggleReadiness("cleanDrivingRecord")} style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0, width: "100%", cursor: "pointer" }}>
                <span>Clean driving record</span><Check value={readiness.cleanDrivingRecord} />
              </button>
              <button className="readiness-row" onClick={() => toggleReadiness("willingBackgroundCheck")} style={{ background: "none", borderTop: 0, borderLeft: 0, borderRight: 0, width: "100%", cursor: "pointer" }}>
                <span>Willing to complete background check</span><Check value={readiness.willingBackgroundCheck} />
              </button>
              <button className="readiness-row" onClick={() => toggleReadiness("willingDrugScreen")} style={{ background: "none", border: 0, width: "100%", cursor: "pointer" }}>
                <span>Willing to complete drug screen</span><Check value={readiness.willingDrugScreen} />
              </button>
            </div>
          </section>

          <section className="card">
            <h3>Work preferences</h3>
            <p className="card-sub">Help instructors refer you to shops where the actual work fits.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
              {[...readiness.shiftPreferences, ...readiness.workPreferences].map((item) => <Pill key={item}>{item}</Pill>)}
            </div>
          </section>

          <div className="callout">
            <strong>Discoverable to approved employers</strong>
            Your contact information stays private until a referral or connection is made.
          </div>
        </aside>
      </div>
    </Shell>
  );
}
