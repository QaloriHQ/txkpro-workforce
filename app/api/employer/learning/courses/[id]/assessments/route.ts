import { requireEmployerContext } from "@/lib/employer/auth";
import {
  createEmployerLearningAssessment,
  getEmployerMicroCertModuleDetail,
  reorderEmployerLearningAssessments,
} from "@/lib/employer/learning-repository";
import type { EmployerLearningAssessmentInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const course = await getEmployerMicroCertModuleDetail(
      context,
      decodeURIComponent(id),
    );
    return Response.json({ assessments: course.assessmentSummary });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const input = (await request.json()) as EmployerLearningAssessmentInput;
    const assessment = await createEmployerLearningAssessment(
      context,
      decodeURIComponent(id),
      input,
    );
    return Response.json({ ok: true, assessment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as { assessmentIds?: string[] };
    if (!Array.isArray(body.assessmentIds)) {
      return Response.json(
        { error: "assessmentIds must be an array." },
        { status: 400 },
      );
    }
    const course = await reorderEmployerLearningAssessments(
      context,
      decodeURIComponent(id),
      body.assessmentIds,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
