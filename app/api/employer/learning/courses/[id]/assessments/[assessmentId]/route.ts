import { requireEmployerContext } from "@/lib/employer/auth";
import {
  deleteEmployerLearningAssessment,
  getEmployerLearningAssessmentAuthoringDetail,
  updateEmployerLearningAssessment,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningAssessmentInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; assessmentId: string }>;
};

export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const assessment = await getEmployerLearningAssessmentAuthoringDetail(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
    );
    return Response.json({ assessment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningAssessmentInput;
    const assessment = await updateEmployerLearningAssessment(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      input,
    );
    return Response.json({ ok: true, assessment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await deleteEmployerLearningAssessment(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
