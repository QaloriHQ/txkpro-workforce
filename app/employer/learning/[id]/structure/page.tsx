import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ButtonLink, PageHeader, StatusBadge } from "@/components/design-system";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { CourseStructureWorkspace } from "@/components/employer/learning/course-structure-workspace";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningReusableLibrary,
  getEmployerMicroCertAuthoringDetail,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export default async function EmployerLearningStructurePage({
  params,
}: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(
    context,
    decodeURIComponent(id),
  );
  const library = await getEmployerLearningReusableLibrary(context);
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
          eyebrow="Employer Learning · Structure"
          title={course.title}
          description="Manage sections, lesson sequence, lesson placement and course architecture. Detailed lesson content is edited separately."
          actions={
            <>
              <ButtonLink href="/employer/learning">
                <ArrowLeftIcon aria-hidden="true" />
                Library
              </ButtonLink>
              <StatusBadge
                tone={
                  course.currentVersion.status === "live"
                    ? "success"
                    : "neutral"
                }
              >
                Version {course.currentVersion.versionNumber} ·{" "}
                {course.currentVersion.status.replaceAll("_", " ")}
              </StatusBadge>
            </>
          }
        />

        <CourseAuthoringNav
          microCertId={course.microCertId}
          active="structure"
        />

        <CourseStructureWorkspace
          course={course}
          canManage={canManage}
          lessonTemplates={library.lessonTemplates}
        />
      </main>
    </>
  );
}
