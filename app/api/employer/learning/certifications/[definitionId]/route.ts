import { requireEmployerContext } from "@/lib/employer/auth";
import { updateEmployerCertificationDefinition } from "@/lib/employer/learning-repository";
import type { EmployerCertificationInput } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ definitionId: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { definitionId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as EmployerCertificationInput;
    const definition = await updateEmployerCertificationDefinition(
      context,
      decodeURIComponent(definitionId),
      body,
    );
    return Response.json({ ok: true, definition });
  } catch (error) {
    return jsonError(error);
  }
}
