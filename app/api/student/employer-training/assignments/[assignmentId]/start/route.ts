import { requireStudentContext } from "@/lib/student/auth";
import { startStudentEmployerTraining } from "@/lib/student/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId } = await routeContext.params;
    const runtime = await startStudentEmployerTraining(
      decodeURIComponent(assignmentId),
    );
    return Response.json({ runtime });
  } catch (error) {
    return jsonError(error);
  }
}
