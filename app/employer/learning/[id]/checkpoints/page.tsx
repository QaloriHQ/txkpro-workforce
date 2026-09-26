import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  PageHeader,
  RoleViewBanner,
  StatusBadge,
} from "@/components/design-system";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { CourseCheckpointsWorkspace } from "@/components/employer/learning/course-checkpoints-workspace";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerMicroCertModuleDetail } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export default async function CourseCheckpointsPage({ params }: RouteContext) {
  const { id } = await params;
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
          eyebrow="Employer Learning · Module detail"
          title={course.title}
          description="Manage interactive checkpoints and deterministic completion requirements for the current course version."
          actions={
            <>
              <ButtonLink
                href={`/employer/learning/${encodeURIComponent(course.microCertId)}`}
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
          active="checkpoints"
        />

        {!canManage ? (
          <RoleViewBanner title="Read-only Module Detail">
            Your Employer role can inspect checkpoints and completion
            requirements, but only Employer Owner/Admin may change them.
          </RoleViewBanner>
        ) : null}

        <CourseCheckpointsWorkspace course={course} canManage={canManage} />
      </main>
    </>
  );
}
