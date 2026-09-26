import { requireEmployerContext } from "@/lib/employer/auth";
import { duplicateEmployerLearningSection } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; sectionId: string }>;
};

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { id, sectionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await duplicateEmployerLearningSection(
      context,
      decodeURIComponent(id),
      decodeURIComponent(sectionId),
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
