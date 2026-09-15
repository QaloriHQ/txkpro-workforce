import { Shell } from "@/components/shell";
import { Metric, Pill } from "@/components/ui";
import { demoPulses, demoReferrals } from "@/lib/demo-data";

export default function AdminDemo() {
  return (
    <Shell active="admin" eyebrow="TXKPRO operations" title="See the workforce loop end to end.">
      <div className="grid grid-4">
        <Metric label="Discoverable students" value="74" detail="Across 6 programs" />
        <Metric label="Verified competencies" value="1,286" detail="312 this term" />
        <Metric label="Employer referrals" value="42" detail="71% viewed" />
        <Metric label="Retention alerts" value="3" detail="1 high priority" />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header"><div><h2>Referral activity</h2><p className="card-sub">Placement activity from educator referral through employer response.</p></div><Pill tone="info">Live workflow</Pill></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Referral</th><th>Student</th><th>Employer</th><th>Educator</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>{demoReferrals.map((ref) => <tr key={ref.id}><td className="muted">{ref.id}</td><td><strong>{ref.student}</strong></td><td>{ref.employer}</td><td>{ref.educator}</td><td>{ref.date}</td><td><Pill tone={ref.status === "Contacted" ? "good" : "info"}>{ref.status}</Pill></td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <aside className="card">
          <div className="card-header"><div><h3>Retention alerts</h3><p className="card-sub">A score of 3 from either side opens a follow-up flag.</p></div></div>
          <div className="grid">
            {demoPulses.map((pulse) => (
              <div className={pulse.flag ? "alert" : "callout"} key={pulse.id}>
                <strong>{pulse.employee} · Day {pulse.day}</strong>
                <div className="muted" style={{ marginTop: 4 }}>{pulse.employer}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}>Student: {pulse.studentScore} · Employer: {pulse.employerScore}</div>
                <div className="muted" style={{ marginTop: 6 }}>{pulse.note}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        <section className="card"><h3>Schools & programs</h3><p className="card-sub">6 active programs · 4 educator organizations connected.</p></section>
        <section className="card"><h3>Employer network</h3><p className="card-sub">18 approved local employers · 11 currently reviewing talent.</p></section>
        <section className="card"><h3>Audit trail</h3><p className="card-sub">Skill verification, referrals, readiness changes, placements, and interventions are recorded.</p></section>
      </div>
    </Shell>
  );
}
