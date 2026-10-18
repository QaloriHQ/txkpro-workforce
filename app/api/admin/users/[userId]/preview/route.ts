import { getPlatformAccount, isUuid, supportPreviewSections } from "@/lib/admin/platform-users";
import {
  enforceSupportRateLimit, requirePlatformSuperAdmin,
  requireSupportRequest, supportErrorResponse, writeSupportAudit,
} from "@/lib/admin/platform-support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requirePlatformSuperAdmin();
    const { userId } = await params;
    if (!isUuid(userId)) throw new Response("Invalid account", { status: 400 });
    const raw = await request.text();
    if (raw.length > 1200) throw new Response("Request too large", { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const reason = requireSupportRequest(request, body);
    const membershipKey = typeof body.membershipKey === "string" && body.membershipKey.length < 200 ? body.membershipKey : "";
    const target = await getPlatformAccount(userId);
    if (!target) throw new Response("Account not found", { status: 404 });
    const membership = target.memberships.find(m => m.key === membershipKey && m.status.toLowerCase() === "active");
    if (!membership) throw new Response("No active membership selected", { status: 409 });

    await enforceSupportRateLimit(actor.authUserId, "platform_support_view_as", 20);
    await writeSupportAudit({
      actor, targetAuthUserId: userId, action: "platform_support_view_as",
      reason, outcome: "success",
      details: { membershipKey: membership.key, role: membership.role, scopeType: membership.scopeType, scopeId: membership.scopeId ?? "" },
    });
    return Response.json({
      ok: true,
      notice: "Read-only support preview, not user impersonation. Administrator identity and authorization remain unchanged.",
      preview: {
        name: target.name,
        role: membership.role, scopeType: membership.scopeType, scopeId: membership.scopeId,
        accountStatus: target.status,
        expectedSections: supportPreviewSections(membership),
      },
    }, { headers });
  } catch (error) {
    return supportErrorResponse(error);
  }
}
