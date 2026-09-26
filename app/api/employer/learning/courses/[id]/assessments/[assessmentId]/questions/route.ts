import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerLearningAssessmentQuestion,
  reorderEmployerLearningAssessmentQuestions,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningAssessmentQuestionInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string; assessmentId: string }>;
};

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input =
      (await request.json()) as EmployerLearningAssessmentQuestionInput;
    const assessment = await createEmployerLearningAssessmentQuestion(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      input,
    );
    return Response.json({ ok: true, assessment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id, assessmentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as { questionIds?: string[] };
    if (!Array.isArray(body.questionIds)) {
      return Response.json(
        { error: "questionIds must be an array." },
        { status: 400 },
      );
    }
    const assessment = await reorderEmployerLearningAssessmentQuestions(
      context,
      decodeURIComponent(id),
      decodeURIComponent(assessmentId),
      body.questionIds,
    );
    return Response.json({ ok: true, assessment });
  } catch (error) {
    return jsonError(error);
  }
}
