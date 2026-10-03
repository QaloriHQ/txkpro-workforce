import { getAccountContext } from "@/lib/auth";
import { decideEducatorApproval } from "@/lib/admin/educator-approvals";
import type { EducatorApprovalDecision } from "@/lib/admin/types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const actor = await getAccountContext();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await routeContext.params;
    const body = (await request.json()) as {
      decision?: EducatorApprovalDecision;
    };

    if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
      return Response.json({ error: "Invalid approval decision." }, { status: 400 });
    }

    const result = await decideEducatorApproval({
      membershipId: decodeURIComponent(id),
      decision: body.decision,
      actor,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    return jsonError(error);
  }
}
