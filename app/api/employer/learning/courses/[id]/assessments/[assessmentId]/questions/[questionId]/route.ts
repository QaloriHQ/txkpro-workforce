import { requireEmployerContext } from "@/lib/employer/auth";
import {
  deleteEmployerLearningAssessmentQuestion,
  updateEmployerLearningAssessmentQuestion,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningAssessmentQuestionInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{
    id: string;
    assessmentId: string;
    questionId: string;
  }>;
};

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId, questionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input =
      (await request.json()) as EmployerLearningAssessmentQuestionInput;
    const assessment = await updateEmployerLearningAssessmentQuestion(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      decodeURIComponent(questionId),
      input,
    );
    return Response.json({ ok: true, assessment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId, questionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const assessment = await deleteEmployerLearningAssessmentQuestion(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      decodeURIComponent(questionId),
    );
    return Response.json({ ok: true, assessment });
  } catch (error) {
    return jsonError(error);
  }
}
