import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { LessonEditor } from "@/components/employer/learning/lesson-editor";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningReusableLibrary,
  getEmployerMicroCertAuthoringDetail,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string; lessonId: string }> };

export default async function LessonEditorPage({ params }: RouteContext) {
  const { id, lessonId } = await params;
  const context = await requireEmployerContext({ approved: true });
  const course = await getEmployerMicroCertAuthoringDetail(context, decodeURIComponent(id));
  const decodedLessonId = decodeURIComponent(lessonId);
  if (!course.lessons.some((lesson) => lesson.lessonId === decodedLessonId)) notFound();
  const reusable = await getEmployerLearningReusableLibrary(context);
  const canManage = context.role === "employer_owner" || context.role === "employer_admin";

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
      </header>
      <div className="page-wrap txk-prototype-content txk-lesson-editor-page">
        <LessonEditor
          course={course}
          lessonId={decodedLessonId}
          reusable={reusable}
          canManage={canManage}
        />
      </div>
    </>
  );
}
