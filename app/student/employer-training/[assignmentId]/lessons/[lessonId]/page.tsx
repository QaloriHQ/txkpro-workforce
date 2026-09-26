import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { LearningBlockRenderer } from "@/components/employer/learning/learning-block-renderer";
import { SignOutButton } from "@/components/sign-out-button";
import { LessonProgressActions } from "@/components/student/lesson-progress-actions";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getStudentContext } from "@/lib/student/auth";
import {
  getStudentEmployerTrainingAssignment,
  listStudentEmployerTrainingAssignments,
} from "@/lib/student/learning-repository";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ assignmentId: string; lessonId: string }>;
};

export default async function StudentEmployerTrainingLessonPage({
  params,
}: PageProps) {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const { assignmentId, lessonId } = await params;
  const decodedAssignmentId = decodeURIComponent(assignmentId);
  const decodedLessonId = decodeURIComponent(lessonId);

  let runtime;
  try {
    runtime = await getStudentEmployerTrainingAssignment(decodedAssignmentId);
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const lesson = runtime.lessons.find(
    (item) => item.lessonId === decodedLessonId,
  );
  if (!lesson) notFound();

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
    return (
      (aSection?.sequence ?? Number.MAX_SAFE_INTEGER) -
        (bSection?.sequence ?? Number.MAX_SAFE_INTEGER) ||
      a.sequence - b.sequence
    );
  });
  const lessonIndex = orderedLessons.findIndex(
    (item) => item.lessonId === lesson.lessonId,
  );
  const previousLesson = lessonIndex > 0 ? orderedLessons[lessonIndex - 1] : null;
  const nextLesson =
    lessonIndex >= 0 && lessonIndex < orderedLessons.length - 1
      ? orderedLessons[lessonIndex + 1]
      : null;
  const courseHref =
    "/student/employer-training/" +
    encodeURIComponent(runtime.assignment.assignmentId);
  const previousHref = previousLesson
    ? courseHref + "/lessons/" + encodeURIComponent(previousLesson.lessonId)
    : courseHref;
  const nextHref = nextLesson
    ? courseHref + "/lessons/" + encodeURIComponent(nextLesson.lessonId)
    : courseHref;
  const relatedAssessments = runtime.assessments.filter(
    (assessment) => assessment.lessonId === lesson.lessonId,
  );
  const readOnly = runtime.assignment.status === "completed";

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

      <main className="page-wrap student-training-page student-lesson-page">
        <div className="student-training-back">
          <Link href={courseHref}>
            <ArrowLeftIcon aria-hidden="true" />
            {runtime.course.title}
          </Link>
        </div>

        <header className="student-lesson-header">
          <div>
            <p className="student-training-kicker">{runtime.course.employerName}</p>
            <h1>{lesson.title}</h1>
            {lesson.description ? <p>{lesson.description}</p> : null}
          </div>
          <div className="student-lesson-meta">
            <span>
              <ClockIcon aria-hidden="true" />
              {lesson.estimatedMinutes
                ? String(lesson.estimatedMinutes) + " min"
                : "Self-paced"}
            </span>
            <span className={"pill " + (lesson.completedAt ? "pill-good" : "pill-info")}>
              {lesson.completedAt ? "Completed" : lesson.required ? "Required" : "Optional"}
            </span>
          </div>
        </header>

        {lesson.learningObjective ? (
          <section className="card student-lesson-objective">
            <p className="student-training-kicker">Lesson objective</p>
            <p>{lesson.learningObjective}</p>
          </section>
        ) : null}

        <article className="card student-lesson-content">
          {lesson.blocks.length ? (
            lesson.blocks.map((block) => (
              <section
                className={"student-lesson-block student-lesson-block-" + block.blockType}
                key={block.lessonBlockId}
              >
                <LearningBlockRenderer block={block} />
              </section>
            ))
          ) : (
            <div className="student-training-empty compact">
              <p>No lesson content has been published for this lesson.</p>
            </div>
          )}
        </article>

        {relatedAssessments.length ? (
          <section className="card student-lesson-assessments">
            <div className="student-training-section-heading">
              <div>
                <p className="student-training-kicker">Lesson assessments</p>
                <h2>Knowledge checks</h2>
              </div>
              <span>{relatedAssessments.length}</span>
            </div>
            <div className="student-training-assessment-list">
              {relatedAssessments.map((assessment) => (
                <Link
                  className="student-training-assessment-row"
                  href={
                    courseHref +
                    "/assessments/" +
                    encodeURIComponent(assessment.assessmentId)
                  }
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
                      Passing score {assessment.passingScore}% ·{" "}
                      {assessment.required ? "Required" : "Optional"}
                    </small>
                  </div>
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!readOnly ? (
          <LessonProgressActions
            assignmentId={runtime.assignment.assignmentId}
            lessonId={lesson.lessonId}
            completed={Boolean(lesson.completedAt)}
            nextHref={nextLesson ? nextHref : courseHref}
          />
        ) : (
          <div className="student-lesson-completion read-only">
            <CheckCircleIcon aria-hidden="true" />
            <span>This completed assignment is available for review only.</span>
          </div>
        )}

        <nav className="student-lesson-nav" aria-label="Lesson navigation">
          <Link className="button button-ghost" href={previousHref}>
            <ArrowLeftIcon aria-hidden="true" />
            {previousLesson ? "Previous lesson" : "Course overview"}
          </Link>
          <Link className="button button-ghost" href={nextHref}>
            {nextLesson ? "Next lesson" : "Course overview"}
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </nav>
      </main>
    </>
  );
}
