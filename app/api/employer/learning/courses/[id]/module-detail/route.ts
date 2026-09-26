import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerMicroCertModuleDetail } from "@/lib/employer/learning-repository";
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
    return Response.json({ course });
  } catch (error) {
    return jsonError(error);
  }
}
