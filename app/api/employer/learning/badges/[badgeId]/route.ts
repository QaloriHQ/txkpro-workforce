import { requireEmployerContext } from "@/lib/employer/auth";
import { updateEmployerCompanyBadge } from "@/lib/employer/learning-repository";
import type { EmployerCompanyBadgeInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ badgeId: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { badgeId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as EmployerCompanyBadgeInput;
    const badge = await updateEmployerCompanyBadge(
      context,
      decodeURIComponent(badgeId),
      body,
    );
    return Response.json({ ok: true, badge });
  } catch (error) {
    return jsonError(error);
  }
}
