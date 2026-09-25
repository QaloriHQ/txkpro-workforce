import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerLearningBlock,
  reorderEmployerLearningBlocks,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningBlockInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string }>;
};

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningBlockInput;
    const course = await createEmployerLearningBlock(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
      input,
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as { lessonBlockIds?: string[] };
    if (!Array.isArray(body.lessonBlockIds)) {
      return Response.json(
        { error: "lessonBlockIds must be an array." },
        { status: 400 },
      );
    }
    const course = await reorderEmployerLearningBlocks(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
      body.lessonBlockIds,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
