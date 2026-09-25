import { Brand } from "@/components/brand";
import { LessonEditorWorkspace } from "@/components/employer/learning/lesson-editor-workspace";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningReusableLibrary,
  getEmployerMicroCertAuthoringDetail,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export default async function EmployerLearningLessonEditorPage({
  params,
}: RouteContext) {
  const { id, lessonId } = await params;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(
    context,
    decodeURIComponent(id),
  );
  const lesson = course.lessons.find(
    (item) => item.lessonId === decodeURIComponent(lessonId),
  );

  if (!lesson) {
    throw new Response("Lesson not found", { status: 404 });
  }

  const reusableLibrary = await getEmployerLearningReusableLibrary(context);
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

      <main className="page-wrap txk-editor-page">
        <LessonEditorWorkspace
          course={course}
          lesson={lesson}
          canManage={canManage}
          reusableLibrary={reusableLibrary}
        />
      </main>
    </>
  );
}
