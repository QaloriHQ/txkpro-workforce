import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { StudentInterviewResponseForm } from "@/components/student/interview-response-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getStudentContext } from "@/lib/student/auth";
import {
  listStudentInterviews,
  listStudentPlacements,
} from "@/lib/student/workflow-repository";

export const dynamic = "force-dynamic";

export default async function StudentWorkspacePage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const [interviews, placements] = await Promise.all([
    listStudentInterviews(),
    listStudentPlacements(),
  ]);

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap">
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

        <section className="card">
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
