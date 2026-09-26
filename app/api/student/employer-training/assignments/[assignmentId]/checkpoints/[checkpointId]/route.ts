import { requireStudentContext } from "@/lib/student/auth";
import { submitStudentEmployerTrainingCheckpoint } from "@/lib/student/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{ assignmentId: string; checkpointId: string }>;
};

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId, checkpointId } = await routeContext.params;
    const body = (await request.json()) as {
      response?: Record<string, unknown>;
    };
    const result = await submitStudentEmployerTrainingCheckpoint(
      decodeURIComponent(assignmentId),
      decodeURIComponent(checkpointId),
      body.response ?? {},
    );
    return Response.json({ result });
  } catch (error) {
    return jsonError(error);
  }
}
