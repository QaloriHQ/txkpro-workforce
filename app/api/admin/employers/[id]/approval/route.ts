import { requireRole } from "@/lib/auth";
import { decideEmployerApproval } from "@/lib/admin/employer-approvals";
import type { EmployerApprovalDecision } from "@/lib/admin/types";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  try {
    const auth = await requireRole(["admin"]);
    const { id } = await routeContext.params;
    const body = (await request.json()) as {
      decision?: EmployerApprovalDecision;
    };

    if (!body.decision || !["approved", "rejected", "suspended"].includes(body.decision)) {
      return Response.json({ error: "Invalid approval decision." }, { status: 400 });
    }

    const result = await decideEmployerApproval({
      employerId: decodeURIComponent(id),
      decision: body.decision,
      actorUserId: auth.legacyUserId,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    return jsonError(error);
  }
}
