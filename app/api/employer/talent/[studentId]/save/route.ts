import { requireEmployerContext } from "@/lib/employer/auth";
import {
  saveCandidate,
  unsaveCandidate,
} from "@/lib/employer/workflow-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ studentId: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  try {
    const { studentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json().catch(() => ({}))) as {
      hiringNeedId?: string | null;
      internalTag?: string | null;
    };
    const saved = await saveCandidate(context, {
      studentId: decodeURIComponent(studentId),
      hiringNeedId:
        typeof body.hiringNeedId === "string" ? body.hiringNeedId : null,
      internalTag:
        typeof body.internalTag === "string" ? body.internalTag : null,
    });
    return Response.json({ ok: true, saved }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  try {
    const { studentId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json().catch(() => ({}))) as {
      hiringNeedId?: string | null;
    };
    await unsaveCandidate(
      context,
      decodeURIComponent(studentId),
      typeof body.hiringNeedId === "string" ? body.hiringNeedId : null,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
