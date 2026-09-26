import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { CheckpointResponse } from "@/components/student/checkpoint-response";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { TrainingStartButton } from "@/components/student/training-start-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getStudentContext } from "@/lib/student/auth";
import {
  getStudentEmployerTrainingAssignment,
  listStudentEmployerTrainingAssignments,
} from "@/lib/student/learning-repository";
import type {
  StudentEmployerTrainingLesson,
  StudentEmployerTrainingSection,
} from "@/lib/student/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ assignmentId: string }> };

function sectionLessons(
  section: StudentEmployerTrainingSection | null,
  lessons: StudentEmployerTrainingLesson[],
) {
  return lessons.filter((lesson) =>
    section ? lesson.sectionId === section.sectionId : !lesson.sectionId,
  );
}

export default async function StudentEmployerTrainingDetailPage({
  params,
}: PageProps) {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const { assignmentId } = await params;
  const decodedAssignmentId = decodeURIComponent(assignmentId);

  let runtime;
  try {
    runtime = await getStudentEmployerTrainingAssignment(decodedAssignmentId);
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const assignments = await listStudentEmployerTrainingAssignments();
  const activeCount = assignments.filter(
    (assignment) => assignment.status !== "cancelled",
  ).length;

  const orderedLessons = [...runtime.lessons].sort((a, b) => {
    const aSection = runtime.sections.find(
      (section) => section.sectionId === a.sectionId,
    );
    const bSection = runtime.sections.find(
      (section) => section.sectionId === b.sectionId,
    );
    const aSectionSequence = aSection?.sequence ?? Number.MAX_SAFE_INTEGER;
    const bSectionSequence = bSection?.sequence ?? Number.MAX_SAFE_INTEGER;
    return aSectionSequence - bSectionSequence || a.sequence - b.sequence;
  });
  const resumeLesson =
    orderedLessons.find((lesson) => !lesson.completedAt) ?? orderedLessons[0] ?? null;
  const firstLessonId = orderedLessons[0]?.lessonId ?? null;
  const groups: Array<StudentEmployerTrainingSection | null> = [
    ...runtime.sections,
    ...(orderedLessons.some((lesson) => !lesson.sectionId) ? [null] : []),
  ];
  const readOnly = runtime.assignment.status === "completed";
  const progress = runtime.progress;

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
        <div className="student-training-back">
          <Link href="/student/employer-training">
            <ArrowLeftIcon aria-hidden="true" />
            Employer Training
          </Link>
        </div>

        <section className="student-training-hero card">
          <div className="student-training-hero-main">
            <p className="student-training-kicker">{runtime.course.employerName}</p>
            <h1>{runtime.course.title}</h1>
            {runtime.course.description ? (
              <p>{runtime.course.description}</p>
            ) : null}
            <div className="student-training-hero-meta">
              <span>Version v{runtime.course.versionNumber}</span>
              <span>
                {runtime.course.durationMinutes
                  ? String(runtime.course.durationMinutes) + " min"
                  : "Self-paced"}
              </span>
              <span>
                {runtime.assignment.status === "in_progress"
                  ? "In Progress"
                  : runtime.assignment.status === "completed"
                    ? "Completed"
                    : "Assigned"}
              </span>
            </div>
          </div>

          <div className="student-training-hero-action">
            {runtime.assignment.status === "assigned" ? (
              <TrainingStartButton
                assignmentId={runtime.assignment.assignmentId}
                firstLessonId={firstLessonId}
              />
            ) : resumeLesson ? (
              <Link
                className="button button-brand student-training-primary-action"
                href={
                  "/student/employer-training/" +
                  encodeURIComponent(runtime.assignment.assignmentId) +
                  "/lessons/" +
                  encodeURIComponent(resumeLesson.lessonId)
                }
              >
                <BookOpenIcon aria-hidden="true" />
                {readOnly ? "Review lessons" : "Resume training"}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="student-training-progress-grid">
          <div className="card student-training-progress-card">
            <span className="student-training-icon">
              <CheckCircleIcon aria-hidden="true" />
            </span>
            <div>
              <small>Required items</small>
              <strong>
                {progress.requiredItems.completed} / {progress.requiredItems.total}
              </strong>
              <span>{progress.requiredItems.percent}% complete</span>
            </div>
          </div>
          <div className="card student-training-progress-card">
            <span className="student-training-icon">
              <BookOpenIcon aria-hidden="true" />
            </span>
            <div>
              <small>Lessons</small>
              <strong>
                {progress.lessons.completed} / {progress.lessons.total}
              </strong>
              <span>
                Required {progress.lessons.requiredCompleted} /{" "}
                {progress.lessons.requiredTotal}
              </span>
            </div>
          </div>
          <div className="card student-training-progress-card">
            <span className="student-training-icon">
              <ClipboardDocumentCheckIcon aria-hidden="true" />
            </span>
            <div>
              <small>Checkpoints</small>
              <strong>
                {progress.checkpoints.completed} / {progress.checkpoints.total}
              </strong>
              <span>
                Required {progress.checkpoints.requiredCompleted} /{" "}
                {progress.checkpoints.requiredTotal}
              </span>
            </div>
          </div>
          <div className="card student-training-progress-card">
            <span className="student-training-icon">
              <ShieldCheckIcon aria-hidden="true" />
            </span>
            <div>
              <small>Assessments</small>
              <strong>
                {progress.assessments.passed} / {progress.assessments.total}
              </strong>
              <span>
                Required {progress.assessments.requiredPassed} /{" "}
                {progress.assessments.requiredTotal}
              </span>
            </div>
          </div>
        </section>

        <section className="student-training-detail-grid">
          <div className="student-training-detail-main">
            <section className="card student-course-outline">
              <div className="student-training-section-heading">
                <div>
                  <p className="student-training-kicker">Course outline</p>
                  <h2>Lessons</h2>
                </div>
                <span>{orderedLessons.length}</span>
              </div>

              <div className="student-course-sections">
                {groups.map((section) => {
                  const lessons = sectionLessons(section, orderedLessons);
                  if (!lessons.length) return null;
                  return (
                    <div
                      className="student-course-section"
                      key={section?.sectionId ?? "unsectioned"}
                    >
                      <div className="student-course-section-header">
                        <div>
                          <h3>{section?.title ?? "Additional lessons"}</h3>
                          {section?.description ? (
                            <p>{section.description}</p>
                          ) : null}
                        </div>
                        {section?.required ? (
                          <span className="pill pill-info">Required section</span>
                        ) : null}
                      </div>

                      <div className="student-course-lesson-list">
                        {lessons.map((lesson, index) => {
                          const lessonAssessments = runtime.assessments.filter(
                            (assessment) => assessment.lessonId === lesson.lessonId,
                          );
                          return (
                            <Link
                              className="student-course-lesson-row"
                              href={
                                "/student/employer-training/" +
                                encodeURIComponent(runtime.assignment.assignmentId) +
                                "/lessons/" +
                                encodeURIComponent(lesson.lessonId)
                              }
                              key={lesson.lessonId}
                            >
                              <span className="student-course-lesson-number">
                                {lesson.completedAt ? (
                                  <CheckCircleIcon aria-hidden="true" />
                                ) : (
                                  index + 1
                                )}
                              </span>
                              <div>
                                <strong>{lesson.title}</strong>
                                <small>
                                  {lesson.estimatedMinutes
                                    ? String(lesson.estimatedMinutes) + " min"
                                    : "Self-paced"}
                                  {lesson.required ? " · Required" : " · Optional"}
                                  {lessonAssessments.length
                                    ? " · " +
                                      String(lessonAssessments.length) +
                                      " assessment" +
                                      (lessonAssessments.length === 1 ? "" : "s")
                                    : ""}
                                </small>
                              </div>
                              <ArrowRightIcon aria-hidden="true" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {runtime.checkpoints.length ? (
              <section className="student-training-checkpoints">
                <div className="student-training-section-heading standalone">
                  <div>
                    <p className="student-training-kicker">Interactive progress</p>
                    <h2>Checkpoints</h2>
                    <p>
                      Checkpoints record explicit acknowledgements, confirmations,
                      or reflections. They do not verify technical skill.
                    </p>
                  </div>
                </div>
                <div className="student-training-checkpoint-list">
                  {runtime.checkpoints.map((checkpoint) => (
                    <CheckpointResponse
                      assignmentId={runtime.assignment.assignmentId}
                      checkpoint={checkpoint}
                      readOnly={readOnly}
                      key={checkpoint.checkpointId}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {runtime.assessments.length ? (
              <section className="card student-training-assessments">
                <div className="student-training-section-heading">
                  <div>
                    <p className="student-training-kicker">Knowledge checks</p>
                    <h2>Assessments</h2>
                  </div>
                  <span>{runtime.assessments.length}</span>
                </div>
                <div className="student-training-assessment-list">
                  {runtime.assessments.map((assessment) => (
                    <Link
                      href={
                        "/student/employer-training/" +
                        encodeURIComponent(runtime.assignment.assignmentId) +
                        "/assessments/" +
                        encodeURIComponent(assessment.assessmentId)
                      }
                      className="student-training-assessment-row"
                      key={assessment.assessmentId}
                    >
                      <span className="student-training-icon">
                        {assessment.latestAttempt?.status === "passed" ? (
                          <CheckCircleIcon aria-hidden="true" />
                        ) : (
                          <ClipboardDocumentCheckIcon aria-hidden="true" />
                        )}
                      </span>
                      <div>
                        <strong>{assessment.title}</strong>
                        <small>
                          {assessment.lessonId ? "Lesson assessment" : "Course assessment"}
                          {" · "}
                          {assessment.required ? "Required" : "Optional"}
                          {" · "}
                          {assessment.questionCount} question
                          {assessment.questionCount === 1 ? "" : "s"}
                        </small>
                      </div>
                      <span className="student-assessment-status">
                        {assessment.latestAttempt?.status === "passed"
                          ? "Passed"
                          : assessment.eligibility.reason === "maximum_attempts_reached"
                            ? "Attempts used"
                            : assessment.latestAttempt?.status === "not_passed"
                              ? "Retry available"
                              : "Ready"}
                      </span>
                      <ArrowRightIcon aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="student-training-detail-aside">
            {runtime.course.learningObjective ? (
              <section className="card">
                <p className="student-training-kicker">Learning objective</p>
                <h2>What you&apos;ll learn</h2>
                <p>{runtime.course.learningObjective}</p>
              </section>
            ) : null}

            {runtime.course.equipmentProcessContext ? (
              <section className="card">
                <p className="student-training-kicker">Employer context</p>
                <h2>Process & equipment</h2>
                <p>{runtime.course.equipmentProcessContext}</p>
              </section>
            ) : null}

            {runtime.course.safetyNotes ? (
              <section className="card student-training-safety">
                <ShieldCheckIcon aria-hidden="true" />
                <div>
                  <p className="student-training-kicker">Safety note</p>
                  <h2>Employer guidance</h2>
                  <p>{runtime.course.safetyNotes}</p>
                </div>
              </section>
            ) : null}

            <section className="card student-training-distinction">
              <AcademicCapIcon aria-hidden="true" />
              <div>
                <strong>Employer Training ≠ Verified Skill</strong>
                <p>
                  Completion reflects company-specific readiness. Instructor
                  Verified Skills remain the authoritative evidence of technical
                  competency.
                </p>
              </div>
            </section>

            <section className="card student-training-assignment-facts">
              <h2>Assignment details</h2>
              <dl>
                <div>
                  <dt>Assigned</dt>
                  <dd>
                    {new Date(runtime.assignment.assignedAt).toLocaleDateString()}
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>v{runtime.course.versionNumber}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {runtime.assignment.status === "in_progress"
                      ? "In Progress"
                      : runtime.assignment.status === "completed"
                        ? "Completed"
                        : "Assigned"}
                  </dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>
                    {runtime.assignment.startedAt
                      ? new Date(runtime.assignment.startedAt).toLocaleDateString()
                      : "Not started"}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </section>

        <div className="student-training-footer-note">
          <ClockIcon aria-hidden="true" />
          Progress is derived from your completed required lessons, satisfied
          checkpoints, and passed required assessments. Final course completion is
          evaluated separately.
        </div>
      </main>
    </>
  );
}
