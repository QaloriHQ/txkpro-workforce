import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { StudentInterviewResponseForm } from "@/components/student/interview-response-form";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getStudentContext } from "@/lib/student/auth";
import {
  listStudentInterviews,
  listStudentPlacements,
} from "@/lib/student/workflow-repository";
import { listStudentEmployerTrainingAssignments } from "@/lib/student/learning-repository";

export const dynamic = "force-dynamic";

export default async function StudentWorkspacePage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const [interviews, placements, trainingAssignments] = await Promise.all([
    listStudentInterviews(),
    listStudentPlacements(),
    listStudentEmployerTrainingAssignments(),
  ]);
  const activeTrainingCount = trainingAssignments.filter(
    (assignment) => assignment.status !== "cancelled",
  ).length;

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <StudentWorkspaceNav active="workspace" trainingCount={activeTrainingCount} />
      <main className="page-wrap student-training-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Student workspace</p>
            <h1>Interviews & placements</h1>
            <p className="card-sub">
              You control your Interview responses. Employer-private evaluations are never displayed here.
            </p>
          </div>
          <span className="pill pill-good">{context.firstName || "Student"}</span>
        </div>

        <section className="card student-workspace-training-summary">
          <div className="card-header">
            <div>
              <p className="eyebrow">Employer Training</p>
              <h2>Assigned company training</h2>
              <p className="card-sub">
                Company-specific readiness training stays separate from Instructor Verified Skills.
              </p>
            </div>
            <span className="pill pill-info">{activeTrainingCount}</span>
          </div>
          <div className="student-workspace-training-actions">
            <a className="button button-brand" href="/student/employer-training">
              Open Employer Training
            </a>
            <span className="muted">
              {trainingAssignments.some((assignment) => assignment.status === "in_progress")
                ? "You have training in progress."
                : trainingAssignments.some((assignment) => assignment.status === "assigned")
                  ? "You have training ready to start."
                  : activeTrainingCount
                    ? "Review your completed Employer Training."
                    : "No Employer Training has been assigned yet."}
            </span>
          </div>
        </section>

        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-header">
            <div>
              <h2>Interview Requests</h2>
              <p className="card-sub">Respond to active requests and review scheduling details.</p>
            </div>
            <span className="pill pill-info">{interviews.length}</span>
          </div>

          <div className="grid">
            {interviews.map((interview) => (
              <article className="student-workflow-card" key={interview.interviewRequestId}>
                <div className="card-header">
                  <div>
                    <h3>{interview.employerName}</h3>
                    <p className="card-sub">{interview.roleTitle}</p>
                  </div>
                  <span className="pill pill-info">{interview.status.replaceAll("_", " ")}</span>
                </div>
                {interview.message ? <p>{interview.message}</p> : null}
                <div className="readiness-list">
                  <div className="readiness-row"><span>Sent</span><strong>{interview.sentAt ? new Date(interview.sentAt).toLocaleDateString() : "—"}</strong></div>
                  {interview.scheduledFor ? (
                    <>
                      <div className="readiness-row"><span>Scheduled</span><strong>{new Date(interview.scheduledFor).toLocaleString()}</strong></div>
                      <div className="readiness-row"><span>Format</span><strong>{interview.interviewFormat ?? "—"}</strong></div>
                      <div className="readiness-row"><span>Location</span><strong>{interview.locationDetail ?? "—"}</strong></div>
                    </>
                  ) : null}
                </div>
                {["sent", "no_response"].includes(interview.status) ? (
                  <div style={{ marginTop: 16 }}>
                    <StudentInterviewResponseForm interviewRequestId={interview.interviewRequestId} />
                  </div>
                ) : null}
              </article>
            ))}
            {!interviews.length ? <div className="empty">No Interview Requests yet.</div> : null}
          </div>
        </section>

        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-header">
            <div>
              <h2>Placement status</h2>
              <p className="card-sub">Employment outcomes recorded through the shared Workforce workflow.</p>
            </div>
          </div>
          <div className="grid grid-2">
            {placements.map((placement) => (
              <div className="metric-card" key={placement.placementId}>
                <span>{placement.employerName}</span>
                <strong style={{ fontSize: 22 }}>{placement.roleTitle}</strong>
                <small>
                  {placement.status.replaceAll("_", " ")} · Start {placement.hireDate}
                </small>
              </div>
            ))}
          </div>
          {!placements.length ? <div className="empty">No Placement has been recorded.</div> : null}
        </section>
      </main>
    </>
  );
}
