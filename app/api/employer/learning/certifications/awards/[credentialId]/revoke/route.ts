import { requireEmployerContext } from "@/lib/employer/auth";
import { revokeEmployerCertification } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ credentialId: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { credentialId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as { reason?: string };
    const credential = await revokeEmployerCertification(
      context,
      decodeURIComponent(credentialId),
      body.reason?.trim() ?? "",
    );
    return Response.json({ ok: true, credential });
  } catch (error) {
    return jsonError(error);
  }
}
