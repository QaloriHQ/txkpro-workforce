import { StudentTrainingLibrary } from "@/components/student/training-library";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { getStudentContext } from "@/lib/student/auth";
import { listStudentEmployerTrainingAssignments } from "@/lib/student/learning-repository";
import type { StudentEmployerTrainingAssignmentStatus } from "@/lib/student/types";

export const dynamic = "force-dynamic";

function statusLabel(status: StudentEmployerTrainingAssignmentStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Assigned";
}

function statusTone(status: StudentEmployerTrainingAssignmentStatus) {
  if (status === "completed") return "pill-good";
  if (status === "in_progress") return "pill-warn";
  if (status === "cancelled") return "pill-neutral";
  return "pill-info";
}

export default async function StudentEmployerTrainingPage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const assignments = await listStudentEmployerTrainingAssignments();
  const activeCount = assignments.filter(
    (assignment) => assignment.status !== "cancelled",
  ).length;

  return (
    <>
      <StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} />
      <StudentWorkspaceNav active="training" trainingCount={activeCount} />

      <main className="page-wrap student-training-page">
        <div className="page-heading student-training-page-heading">
          <div>
            <p className="eyebrow">Employer learning</p>
            <h1>Training Center</h1>
            <p className="card-sub">
              Complete company-specific readiness training assigned through your
              Institution. Employer Training is separate from Instructor Verified
              Skills and does not create an employability score.
            </p>
          </div>
          <span className="pill pill-info">{activeCount} active</span>
        </div>

        <section className="student-prototype-hero"><span className="pill">Employer learning</span><h2>Bridge the lab-to-field gap.</h2><p>Explore employer expectations, complete company-specific training, and earn workforce evidence. These credentials complement Instructor Verified Skills.</p><div className="student-hero-stats"><span>{assignments.filter(a => a.status === "completed").length} completed</span><span>{assignments.filter(a => a.status === "in_progress").length} in progress</span></div></section>

        <StudentTrainingLibrary items={assignments.map((assignment) => {
            const progress = assignment.progress?.requiredItems;
            const blocked = assignment.status === "cancelled";
            return { id: assignment.assignmentId, search: `${assignment.title} ${assignment.employerName} ${assignment.description || ""}`, status: assignment.status, content: (
              <article className="card student-training-card student-training-compact-card" key={assignment.assignmentId}>
                <div className="student-training-card-top student-training-card-cover">
                  <span className="student-training-icon">
                    <BuildingOffice2Icon aria-hidden="true" />
                  </span>
                  <span className={"pill " + statusTone(assignment.status)}>
                    {statusLabel(assignment.status)}
                  </span>
                  <div className="student-training-cover-identity"><strong>{assignment.employerName}</strong><span>{assignment.durationMinutes ? `${assignment.durationMinutes} min` : "Self-paced"}</span></div>
                </div>

                <div>
                  <h2>{assignment.title}</h2>
                  {assignment.description ? <p>{assignment.description}</p> : null}
                </div>

                <dl className="student-training-facts">
                  <div>
                    <dt>Version</dt>
                    <dd>v{assignment.versionNumber}</dd>
                  </div>
                  <div>
                    <dt>Assigned</dt>
                    <dd>{new Date(assignment.assignedAt).toLocaleDateString()}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>
                      {assignment.durationMinutes
                        ? String(assignment.durationMinutes) + " min"
                        : "Self-paced"}
                    </dd>
                  </div>
                </dl>

                {progress ? (
                  <div className="student-training-progress">
                    <div>
                      <span>Required items complete</span>
                      <strong>
                        {progress.completed} / {progress.total}
                      </strong>
                    </div>
                    <div
                      className="student-training-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress.percent}
                    >
                      <span style={{ width: String(progress.percent) + "%" }} />
                    </div>
                    <small>
                      {progress.percent}% · derived from required lessons,
                      checkpoints, and assessments.
                    </small>
                  </div>
                ) : null}

                <div className="student-training-card-footer">
                  <span>
                    {assignment.status === "completed" ? (
                      <>
                        <CheckCircleIcon aria-hidden="true" />
                        Completed training
                      </>
                    ) : (
                      <>
                        <ClockIcon aria-hidden="true" />
                        {assignment.status === "in_progress"
                          ? "Resume where you left off"
                          : blocked
                            ? "Assignment cancelled"
                            : "Ready to begin"}
                      </>
                    )}
                  </span>
                  {!blocked ? (
                    <Link
                      className="button button-brand button-small"
                      href={
                        "/student/employer-training/" +
                        encodeURIComponent(assignment.assignmentId)
                      }
                    >
                      {assignment.status === "completed"
                        ? "Review"
                        : assignment.status === "in_progress"
                          ? "Continue"
                          : "Start"}
                      <ArrowRightIcon aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </article>
            ) };
          })} />
      </main>
    </>
  );
}
