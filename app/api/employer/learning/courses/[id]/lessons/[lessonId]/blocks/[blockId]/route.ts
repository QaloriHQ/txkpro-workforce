import { requireEmployerContext } from "@/lib/employer/auth";
import {
  deleteEmployerLearningBlock,
  updateEmployerLearningBlock,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningBlockInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; lessonId: string; blockId: string }>;
};

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId, blockId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningBlockInput;
    const course = await updateEmployerLearningBlock(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
      decodeURIComponent(blockId),
      input,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { id, lessonId, blockId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await deleteEmployerLearningBlock(
      context,
      decodeURIComponent(id),
      decodeURIComponent(lessonId),
      decodeURIComponent(blockId),
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
