import { jsonError } from "@/lib/http";
import { transitionProductionRequest } from "@/lib/concierge";
import { productionStatuses } from "@/lib/concierge-statuses";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!productionStatuses.includes(body.status))
      return Response.json({ error: "Invalid status" }, { status: 400 });
    return Response.json({
      request: await transitionProductionRequest(id, body.status, body.note ?? ""),
    });
  } catch (error) { return jsonError(error); }
}
