import { requireEmployerContext } from "@/lib/employer/auth";
import { replaceEmployerMicroCertEligibility } from "@/lib/employer/learning-repository";
import type { MicroCertEligibility } from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, routeContext: RouteContext) {
  try {
    const { id } = await routeContext.params;
    const context = await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    const body = (await request.json()) as {
      eligibility?: MicroCertEligibility[];
    };
    if (!Array.isArray(body.eligibility)) {
      return Response.json(
        { error: "eligibility must be an array." },
        { status: 400 },
      );
    }
    const course = await replaceEmployerMicroCertEligibility(
      context,
      decodeURIComponent(id),
      body.eligibility,
    );
    return Response.json({ ok: true, course });
  } catch (error) {
    return jsonError(error);
  }
}
