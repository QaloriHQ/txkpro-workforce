import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { getStudentContext } from "@/lib/student/auth";
import { listStudentInterviews, listStudentPlacements } from "@/lib/student/workflow-repository";
import { listStudentEmployerTrainingAssignments, getStudentReadinessEvidence } from "@/lib/student/learning-repository";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
export const dynamic = "force-dynamic";
export default async function StudentHome() {
 const context = await getStudentContext();
 if (!context) redirect("/dashboard");
 const [interviews, placements, training, evidence] = await Promise.all([listStudentInterviews(),listStudentPlacements(),listStudentEmployerTrainingAssignments(),getStudentReadinessEvidence(context.studentId)]);
 const active = training.filter(a => a.status !== "cancelled");
 const priority = interviews.find(i => ["sent", "no_response"].includes(i.status));
 const nextTraining = active.find(a => a.status !== "completed");
 return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} /><StudentWorkspaceNav active="workspace" trainingCount={active.filter(a => a.status !== "completed").length} />
 <main className="page-wrap student-training-page student-prototype-home">
  <div className="page-heading"><div><p className="eyebrow">Your local workforce journey</p><h1>Hello, {context.firstName || "Student"}.</h1><p className="card-sub">Your next step toward a local career is ready.</p></div></div>
  <section className="student-prototype-hero"><span className="pill">Priority action</span><h2>{priority ? `${priority.employerName} wants to meet you` : nextTraining ? "Keep building your skills" : "Showcase what you can do"}</h2><p>{priority ? `Interview request for ${priority.roleTitle}${priority.scheduledFor ? ` · ${new Date(priority.scheduledFor).toLocaleString()}` : ""}.` : nextTraining ? `${nextTraining.title} · ${nextTraining.employerName}` : "Build your digital resume with projects, certificates and demonstrated skills."}</p><Link className="button" href={priority ? "/student/opportunities?view=interviews" : nextTraining ? `/student/employer-training/${encodeURIComponent(nextTraining.assignmentId)}` : "/student/portfolio"}>{priority ? "Review interview" : nextTraining ? "Continue training" : "Build portfolio"} →</Link></section>
  <section className="student-home-section"><h2>Today</h2><p className="card-sub">A quick daily action that builds consistent workforce habits.</p><article className="card student-daily-card"><div className="student-daily-heading"><ShieldCheckIcon aria-hidden="true" /><div><h3>Daily Safety Trivia</h3><p className="card-sub">Daily practice for your workforce journey.</p></div><span className="pill">Coming soon</span></div><p>Daily questions and streaks will appear here when available.</p></article></section>
  <section className="student-home-section"><h2>PRO Points</h2><p className="card-sub">Transparent activity by category — not an employability score.</p><article className="card student-points-placeholder"><span className="pill">Coming soon</span><h3>Seasonal rankings & lifetime levels</h3><p className="card-sub">Reliability · Skill Mastery · Community</p><p>Your real points, streaks and rankings will appear when the points system is available.</p></article></section>
  <section className="student-home-section"><div className="student-section-heading"><div><h2>Workforce progress</h2><p className="card-sub">Separate, explainable readiness signals.</p></div><Link className="button" href="/student/profile">View profile</Link></div><div className="student-workforce-metrics">{[[evidence.verifiedSkills.length,"Instructor Verified Skills"],[active.filter(a=>a.status === "completed").length,"Completed Employer Training"],[interviews.length,"Interview Activity"],[placements.filter(p=>p.officialPlacement).length,"Confirmed Placements"]].map(([value,label])=><article className="card" key={String(label)}><strong>{value}</strong><span>{label}</span></article>)}</div></section>
 </main></>;
}
