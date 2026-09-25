import { requireEmployerContext } from "@/lib/employer/auth";
import {
  archiveEmployerLearningLesson,
  updateEmployerLearningLesson,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningLessonInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningLessonInput;
    const course = await updateEmployerLearningLesson(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
      input,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await archiveEmployerLearningLesson(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
