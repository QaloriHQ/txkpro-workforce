import { requireEmployerContext } from "@/lib/employer/auth";
import { updatePlacementStatus } from "@/lib/employer/hiring-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const { id } = await routeContext.params;
    const body = (await request.json()) as {
      status?: string;
      endReason?: string | null;
    };
    const status =
      typeof body.status === "string" ? body.status.toLowerCase() : "";

    if (!["active", "ended"].includes(status)) {
      return Response.json(
        { error: "Placement status must be active or ended." },
        { status: 400 },
      );
    }

    const result = await updatePlacementStatus(context, {
      placementId: decodeURIComponent(id),
      status: status as "active" | "ended",
      endReason:
        typeof body.endReason === "string" ? body.endReason.trim() : null,
    });

    return Response.json({ ok: true, placement: result });
  } catch (error) {
    return jsonError(error);
  }
}
