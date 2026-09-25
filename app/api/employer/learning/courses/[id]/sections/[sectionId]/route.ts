import { requireEmployerContext } from "@/lib/employer/auth";
import {
  deleteEmployerLearningSection,
  updateEmployerLearningSection,
} from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; sectionId: string }>;
};

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, sectionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      required?: boolean;
    };
    const course = await updateEmployerLearningSection(
      context,
      decodeURIComponent(id),
      decodeURIComponent(sectionId),
      body,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { id, sectionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await deleteEmployerLearningSection(
      context,
      decodeURIComponent(id),
      decodeURIComponent(sectionId),
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
