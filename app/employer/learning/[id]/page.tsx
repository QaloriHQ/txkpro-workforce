import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import { CourseAuthoringWorkspace } from "@/components/employer/learning/course-authoring-workspace";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerMicroCertAuthoringDetail } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export default async function EmployerLearningCoursePage({
  params,
}: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(
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
          eyebrow="Employer Learning · Course authoring"
          title={course.title}
          description={
            <>
              Version {course.currentVersion.versionNumber} ·{" "}
              {course.currentVersion.learningObjective ||
                "No learning objective has been added yet."}
            </>
          }
          actions={
            <>
              <ButtonLink href="/employer/learning">
                <ArrowLeftIcon aria-hidden="true" />
                Back to library
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
                {course.currentVersion.status.replaceAll("_", " ")}
              </StatusBadge>
            </>
          }
        />

        {!canManage ? (
          <RoleViewBanner title="Read-only Employer Learning access">
            Your Employer role can inspect this course, lesson hierarchy and
            content, but only Employer Owner/Admin may author or publish it.
          </RoleViewBanner>
        ) : null}

        <CourseAuthoringWorkspace course={course} canManage={canManage} />
      </main>
    </>
  );
}
