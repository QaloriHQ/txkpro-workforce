import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ButtonLink, PageHeader } from "@/components/design-system";
import { CourseAuthoringNav } from "@/components/employer/learning/course-authoring-nav";
import { StudentCoursePreview } from "@/components/employer/learning/student-course-preview";
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

export default async function CoursePreviewPage({
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
          eyebrow="Employer Learning · Student preview"
          title={course.title}
          description="Preview the learner experience interactively. Simulation state stays in this browser session and never creates Student completion evidence."
          actions={
            <ButtonLink
              href={`/employer/learning/${encodeURIComponent(course.microCertId)}`}
            >
              <ArrowLeftIcon aria-hidden="true" />
              Back to overview
            </ButtonLink>
          }
        />

        <CourseAuthoringNav
          microCertId={course.microCertId}
          active="preview"
        />

        <StudentCoursePreview
          course={course}
          initialLessonId={query.lesson ?? null}
        />
      </main>
    </>
  );
}
