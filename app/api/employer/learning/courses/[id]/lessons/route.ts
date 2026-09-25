import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerLearningLesson,
  reorderEmployerLearningLessons,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningLessonInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningLessonInput;
    const course = await createEmployerLearningLesson(
      context,
      decodeURIComponent(id),
      input,
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as { lessonIds?: string[] };
    if (!Array.isArray(body.lessonIds)) {
      return Response.json({ error: "lessonIds must be an array." }, { status: 400 });
    }
    const course = await reorderEmployerLearningLessons(
      context,
      decodeURIComponent(id),
      body.lessonIds,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
