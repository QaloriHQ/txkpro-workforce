import { requireEmployerContext } from "@/lib/employer/auth";
import { updateEmployerLearningRequirements } from "@/lib/employer/learning-repository";
import type { EmployerLearningPassingRequirement } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      requirement?: EmployerLearningPassingRequirement;
      companyBadgeId?: string | null;
      certificationDefinitionId?: string | null;
    };
    if (!body.requirement) {
      return Response.json(
        { error: "requirement is required." },
        { status: 400 },
      );
    }
    const course = await updateEmployerLearningRequirements(
      context,
      decodeURIComponent(id),
      body.requirement,
      body.companyBadgeId ?? null,
      body.certificationDefinitionId ?? null,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
