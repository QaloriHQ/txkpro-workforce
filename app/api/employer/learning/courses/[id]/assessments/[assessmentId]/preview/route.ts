import { requireEmployerContext } from "@/lib/employer/auth";
import {
  getEmployerLearningAssessmentPreview,
  scoreEmployerLearningAssessmentPreview,
} from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; assessmentId: string }>;
};

export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const assessment = await getEmployerLearningAssessmentPreview(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
    );
    return Response.json({ assessment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      responses?: Array<{
        questionId: string;
        response: Record<string, unknown>;
      }>;
    };
    if (!Array.isArray(body.responses)) {
      return Response.json(
        { error: "responses must be an array." },
        { status: 400 },
      );
    }
    const result = await scoreEmployerLearningAssessmentPreview(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      body.responses,
    );
    return Response.json({ ok: true, result });
  } catch (error) {
    return jsonError(error);
  }
}
