import { requireEmployerContext } from "@/lib/employer/auth";
import { createEmployerMicroCertVersion } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    const course = await createEmployerMicroCertVersion(
      context,
      decodeURIComponent(id),
    );
    return Response.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
