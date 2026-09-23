import { requireEmployerContext } from "@/lib/employer/auth";
import { closeReferral } from "@/lib/employer/workflow-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const referral = await closeReferral(context, decodeURIComponent(id));
    return Response.json({ ok: true, referral });
  } catch (error) {
    return jsonError(error);
  }
}
