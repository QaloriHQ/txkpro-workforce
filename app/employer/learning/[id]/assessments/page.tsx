import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import { AssessmentWorkspace } from "@/components/employer/learning/assessment-workspace";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerMicroCertModuleDetail } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
};

export default async function CourseAssessmentsPage({
  params,
  searchParams,
}: RouteContext) {
  const { id } = await params;
  const query = await searchParams;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertModuleDetail(
    context,
    decodeURIComponent(id),
  );
  const canManage =
    context.role === "employer_owner" || context.role === "employer_admin";

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
          eyebrow="Employer Learning · Assessments"
          title={course.title}
          description="Author deterministic lesson checkpoints, quizzes, and final assessments. Answer keys stay restricted to authorized Employer authoring roles."
          actions={
            <>
              <ButtonLink
                href={`/employer/learning/${encodeURIComponent(
                  course.microCertId,
                )}`}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Overview
              </ButtonLink>
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
            </>
          }
        />

        <CourseAuthoringNav
          microCertId={course.microCertId}
          active="assessments"
        />

        {!canManage ? (
          <RoleViewBanner title="Read-only assessment summary">
            Your Employer role can inspect assessment summaries and Student
            Preview, but only Employer Owner/Admin can access answer keys or
            change assessment definitions.
          </RoleViewBanner>
        ) : null}

        <AssessmentWorkspace
          course={course}
          canManage={canManage}
          initialLessonId={query.lesson ?? null}
        />
      </main>
    </>
  );
}
