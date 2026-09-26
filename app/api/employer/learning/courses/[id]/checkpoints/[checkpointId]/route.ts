import { requireEmployerContext } from "@/lib/employer/auth";
import {
  deleteEmployerLearningCheckpoint,
  updateEmployerLearningCheckpoint,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningCheckpointInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; checkpointId: string }>;
};

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, checkpointId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningCheckpointInput;
    const course = await updateEmployerLearningCheckpoint(
      context,
      decodeURIComponent(id),
      decodeURIComponent(checkpointId),
      input,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { id, checkpointId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await deleteEmployerLearningCheckpoint(
      context,
      decodeURIComponent(id),
      decodeURIComponent(checkpointId),
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
