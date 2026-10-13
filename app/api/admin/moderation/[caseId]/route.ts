import { requireRole } from "@/lib/auth";
import { decideModerationCase } from "@/lib/community/moderation-repository";
import type { ModerationAction } from "@/lib/community/moderation-types";
import { jsonError } from "@/lib/http";
const actions = new Set<ModerationAction>(["no_action","warn","hide_content","remove_content","restore_content","restrict_posting","restrict_interactions","suspend_user","restore_user","escalate"]);
export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    await requireRole(["admin"]);
    const body = await request.json().catch(() => ({}));
    if (!actions.has(body.action) || typeof body.rationale !== "string") return Response.json({ error: "Invalid moderation decision." }, { status: 400 });
    return Response.json(await decideModerationCase({ caseId: (await context.params).caseId, action: body.action, rationale: body.rationale,
      durationHours: Number.isInteger(body.durationHours) ? body.durationHours : null }));
  } catch (error) { return jsonError(error); }
}
