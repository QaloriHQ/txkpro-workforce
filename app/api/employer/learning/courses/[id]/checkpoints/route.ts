import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerLearningCheckpoint,
  reorderEmployerLearningCheckpoints,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningCheckpointInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningCheckpointInput;
    const course = await createEmployerLearningCheckpoint(
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
    const body = (await request.json()) as { checkpointIds?: string[] };
    if (!Array.isArray(body.checkpointIds)) {
      return Response.json(
        { error: "checkpointIds must be an array." },
        { status: 400 },
      );
    }
    const course = await reorderEmployerLearningCheckpoints(
      context,
      decodeURIComponent(id),
      body.checkpointIds,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
