import { requireEmployerContext } from "@/lib/employer/auth";
import { duplicateEmployerLearningLesson } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await duplicateEmployerLearningLesson(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
