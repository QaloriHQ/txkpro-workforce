import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ButtonLink, PageHeader, RoleViewBanner, StatusBadge } from "@/components/design-system";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { CourseStructureBuilder } from "@/components/employer/learning/course-structure-builder";
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

export default async function CourseStructurePage({ params }: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(context, decodeURIComponent(id));
  const reusable = await getEmployerLearningReusableLibrary(context);
  const canManage = context.role === "employer_owner" || context.role === "employer_admin";

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Learning · Course structure"
          title={course.title}
          description="Organize sections and lessons here. Detailed content editing happens inside each lesson."
          actions={
            <>
              <ButtonLink href={`/employer/learning/${encodeURIComponent(course.microCertId)}`}>
                <ArrowLeftIcon aria-hidden="true" /> Overview
              </ButtonLink>
              <StatusBadge tone={course.currentVersion.status === "live" ? "success" : "neutral"}>
                Version {course.currentVersion.versionNumber}
              </StatusBadge>
            </>
          }
        />
        <CourseAuthoringNav microCertId={course.microCertId} active="structure" />
        {["live","archived"].includes(course.currentVersion.status) && canManage ? (
          <RoleViewBanner title="Published structure is locked">
            Create a new draft version from Overview before changing sections or lessons.
          </RoleViewBanner>
        ) : null}
        <CourseStructureBuilder course={course} reusable={reusable} canManage={canManage} />
      </main>
    </>
  );
}
