import { requireEmployerContext } from "@/lib/employer/auth";
import { duplicateEmployerLearningAssessment } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; assessmentId: string }>;
};

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const assessment = await duplicateEmployerLearningAssessment(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
    );
    return Response.json({ ok: true, assessment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
