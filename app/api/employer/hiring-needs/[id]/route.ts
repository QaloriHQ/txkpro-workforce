import { getEmployerContext } from "@/lib/employer/auth";
import { updateHiringNeed } from "@/lib/employer/repository";
import type { HiringNeedInput } from "@/lib/employer/types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await getEmployerContext(employerId);
    if (!context) {
      return Response.json({ error: "Employer membership required." }, { status: 403 });
    }
    const body = (await request.json()) as HiringNeedInput & {
      expectedVersion?: number;
    };
    const { expectedVersion, ...input } = body;
    const hiringNeed = await updateHiringNeed(
      context,
      decodeURIComponent(id),
      input,
      expectedVersion,
    );
    return Response.json({ ok: true, hiringNeed });
  } catch (error) {
    return jsonError(error);
  }
}
