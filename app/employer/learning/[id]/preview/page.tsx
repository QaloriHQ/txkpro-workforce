import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ButtonLink, PageHeader, StatusBadge } from "@/components/design-system";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { StudentPreviewWorkspace } from "@/components/employer/learning/student-preview-workspace";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerMicroCertAuthoringDetail } from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
};

export default async function EmployerLearningPreviewPage({
  params,
  searchParams,
}: RouteContext) {
  const { id } = await params;
  const query = await searchParams;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(
    context,
    decodeURIComponent(id),
  );

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
          eyebrow="Employer Learning · Preview"
          title={course.title}
          description="Interactive Student simulation. Preview progress is browser-only and never creates assignment, assessment, badge, certification, or completion evidence."
          actions={
            <>
              <ButtonLink
                href={`/employer/learning/${encodeURIComponent(course.microCertId)}`}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Course overview
              </ButtonLink>
              <StatusBadge tone="info">Simulation</StatusBadge>
            </>
          }
        />

        <CourseAuthoringNav
          microCertId={course.microCertId}
          active="preview"
        />

        <StudentPreviewWorkspace
          course={course}
          initialLessonId={query.lesson ?? null}
        />
      </main>
    </>
  );
}
