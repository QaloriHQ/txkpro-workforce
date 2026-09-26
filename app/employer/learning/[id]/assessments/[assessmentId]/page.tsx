import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PageHeader, StatusBadge } from "@/components/design-system";
import { AssessmentBuilder } from "@/components/employer/learning/assessment-builder";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningAssessmentAuthoringDetail,
  getEmployerMicroCertModuleDetail,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; assessmentId: string }>;
};

export default async function AssessmentBuilderPage({
  params,
}: RouteContext) {
  const { id, assessmentId } = await params;
  const microCertId = decodeURIComponent(id);
  const decodedAssessmentId = decodeURIComponent(assessmentId);
  const context = await requireEmployerContext({ approved: true });
  const canManage =
    context.role === "employer_owner" || context.role === "employer_admin";

  if (!canManage) {
    redirect(
      `/employer/learning/${encodeURIComponent(microCertId)}/assessments`,
    );
  }

  const [course, assessment] = await Promise.all([
    getEmployerMicroCertModuleDetail(context, microCertId),
    getEmployerLearningAssessmentAuthoringDetail(
      context,
      microCertId,
      decodedAssessmentId,
    ),
  ]);

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Learning · Assessment builder"
          title={assessment.title}
          description="Author questions, answer keys, deterministic scoring rules, attempts, feedback, and learner-safe preview behavior."
          actions={
            <StatusBadge
              tone={
                course.currentVersion.status === "live"
                  ? "success"
                  : course.currentVersion.status === "ready"
                    ? "info"
                    : "neutral"
              }
            >
              Version {course.currentVersion.versionNumber}
            </StatusBadge>
          }
        />

        <CourseAuthoringNav
          microCertId={course.microCertId}
          active="assessments"
        />

        <AssessmentBuilder
          course={course}
          assessment={assessment}
          canManage={canManage}
        />
      </main>
    </>
  );
}
