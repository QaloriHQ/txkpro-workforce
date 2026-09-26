import { requireStudentContext } from "@/lib/student/auth";
import { touchStudentEmployerTrainingLesson } from "@/lib/student/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ assignmentId: string; lessonId: string }>;
};

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId, lessonId } = await routeContext.params;
    const progress = await touchStudentEmployerTrainingLesson(
      decodeURIComponent(assignmentId),
      decodeURIComponent(lessonId),
    );
    return Response.json({ progress });
  } catch (error) {
    return jsonError(error);
  }
}
