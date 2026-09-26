import { requireStudentContext } from "@/lib/student/auth";
import {
  getStudentEmployerTrainingAssessment,
  startStudentEmployerTrainingAssessment,
  submitStudentEmployerTrainingAssessment,
} from "@/lib/student/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ assignmentId: string; assessmentId: string }>;
};

export async function GET(_request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId, assessmentId } = await routeContext.params;
    const assessment = await getStudentEmployerTrainingAssessment(
      decodeURIComponent(assignmentId),
      decodeURIComponent(assessmentId),
    );
    return Response.json({ assessment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId, assessmentId } = await routeContext.params;
    const body = (await request.json()) as {
      action?: "start" | "submit";
      assessmentAttemptId?: string;
      responses?: Array<{
        questionId: string;
        response: Record<string, unknown>;
      }>;
    };

    if (body.action === "start") {
      const assessment = await startStudentEmployerTrainingAssessment(
        decodeURIComponent(assignmentId),
        decodeURIComponent(assessmentId),
      );
      return Response.json({ assessment });
    }

    if (body.action === "submit") {
      if (!body.assessmentAttemptId) {
        return Response.json(
          { error: "assessmentAttemptId is required." },
          { status: 400 },
        );
      }
      const result = await submitStudentEmployerTrainingAssessment(
        decodeURIComponent(assignmentId),
        decodeURIComponent(assessmentId),
        body.assessmentAttemptId,
        Array.isArray(body.responses) ? body.responses : [],
      );
      return Response.json({ result });
    }

    return Response.json(
      { error: "Invalid assessment action." },
      { status: 400 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
