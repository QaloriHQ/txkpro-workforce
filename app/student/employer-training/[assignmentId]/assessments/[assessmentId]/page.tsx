import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AssessmentRuntime } from "@/components/student/assessment-runtime";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { getStudentContext } from "@/lib/student/auth";
import {
  getStudentEmployerTrainingAssessment,
  getStudentEmployerTrainingAssignment,
  listStudentEmployerTrainingAssignments,
} from "@/lib/student/learning-repository";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ assignmentId: string; assessmentId: string }>;
};

export default async function StudentEmployerTrainingAssessmentPage({
  params,
}: PageProps) {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");

  const { assignmentId, assessmentId } = await params;
  const decodedAssignmentId = decodeURIComponent(assignmentId);
  const decodedAssessmentId = decodeURIComponent(assessmentId);

  let runtime;
  let assessment;
  try {
    [runtime, assessment] = await Promise.all([
      getStudentEmployerTrainingAssignment(decodedAssignmentId),
      getStudentEmployerTrainingAssessment(
        decodedAssignmentId,
        decodedAssessmentId,
      ),
    ]);
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const assignments = await listStudentEmployerTrainingAssignments();
  const activeCount = assignments.filter(
    (assignment) => assignment.status !== "cancelled",
  ).length;
  const courseHref =
    "/student/employer-training/" +
    encodeURIComponent(runtime.assignment.assignmentId);

  return (
    <>
      <StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} />
      <StudentWorkspaceNav active="training" trainingCount={activeCount} />

      <main className="page-wrap student-training-page student-assessment-page">
        <div className="student-training-back">
          <Link href={courseHref}>
            <ArrowLeftIcon aria-hidden="true" />
            {runtime.course.title}
          </Link>
        </div>

        <AssessmentRuntime
          assignmentId={runtime.assignment.assignmentId}
          initialAssessment={assessment}
          courseHref={courseHref}
          readOnly={runtime.assignment.status === "completed"}
        />
      </main>
    </>
  );
}
