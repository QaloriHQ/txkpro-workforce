import { requireEmployerContext } from "@/lib/employer/auth";
import { updateEmployerLearningStructure } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      structure?: Array<{ sectionId: string | null; lessonIds: string[] }>;
    };
    if (!Array.isArray(body.structure)) {
      return Response.json({ error: "structure must be an array." }, { status: 400 });
    }
    const course = await updateEmployerLearningStructure(
      context,
      decodeURIComponent(id),
      body.structure,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
