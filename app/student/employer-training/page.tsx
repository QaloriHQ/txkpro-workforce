import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <StudentWorkspaceNav active="training" trainingCount={activeCount} />

      <main className="page-wrap student-training-page">
        <div className="page-heading student-training-page-heading">
          <div>
            <p className="eyebrow">Student · Employer Training</p>
            <h1>Assigned company training</h1>
            <p className="card-sub">
              Complete company-specific readiness training assigned through your
              Institution. Employer Training is separate from Instructor Verified
              Skills and does not create an employability score.
            </p>
          </div>
          <span className="pill pill-info">{activeCount} active</span>
        </div>

        <section className="student-training-context card">
          <AcademicCapIcon aria-hidden="true" />
          <div>
            <strong>What this training means</strong>
            <p>
              These courses document readiness for a specific Employer&apos;s
              process, equipment, policies, or expectations. Your technical
              competency evidence remains your Instructor Verified Skills.
            </p>
          </div>
        </section>

        <section className="student-training-library" aria-label="Employer Training assignments">
          {assignments.map((assignment) => {
            const progress = assignment.progress?.requiredItems;
            const blocked = assignment.status === "cancelled";
            return (
              <article className="card student-training-card" key={assignment.assignmentId}>
                <div className="student-training-card-top">
                  <span className="student-training-icon">
                    <BuildingOffice2Icon aria-hidden="true" />
                  </span>
                  <span className={"pill " + statusTone(assignment.status)}>
                    {statusLabel(assignment.status)}
                  </span>
                </div>

                <div>
                  <p className="student-training-kicker">{assignment.employerName}</p>
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
                          ? "Resume"
                          : "Open"}
                      <ArrowRightIcon aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!assignments.length ? (
            <div className="card student-training-empty">
              <AcademicCapIcon aria-hidden="true" />
              <h2>No Employer Training assignments yet</h2>
              <p>
                When your Institution assigns a company-specific course, it will
                appear here.
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
