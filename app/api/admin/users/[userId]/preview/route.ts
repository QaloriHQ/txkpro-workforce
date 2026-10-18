import { getPlatformAccount, isUuid, supportPreviewSections } from "@/lib/admin/platform-users";
import {
  requirePlatformSuperAdmin, supportErrorResponse, writeSupportAudit,
} from "@/lib/admin/platform-support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/**
 * View as is a read-only role/scope support preview.
 * The selected user never has to approve a preview and receives no notification.
 * The authenticated platform Super Admin remains the actor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requirePlatformSuperAdmin();
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      throw new Response("Origin rejected", { status: 403 });
    }

    const { userId } = await params;
    if (!isUuid(userId)) throw new Response("Invalid account", { status: 400 });

    const raw = await request.text();
    if (raw.length > 1200) throw new Response("Request too large", { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new Response("Invalid request", { status: 400 }); }
    const data = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const membershipKey = typeof data.membershipKey === "string" && data.membershipKey.length < 200
      ? data.membershipKey
      : "";

    const target = await getPlatformAccount(userId);
    if (!target) throw new Response("Account not found", { status: 404 });
    const membership = target.memberships.find(
      m => m.key === membershipKey && m.status.toLowerCase() === "active",
    );
    if (!membership) throw new Response("No active membership selected", { status: 409 });

    // Audit automatically, without requiring an administrator-entered reason.
    // This is a read-only presentation; an audit service interruption must not
    // prevent an otherwise authorized preview. Mutations stay audit-first.
    try {
      await writeSupportAudit({
        actor, targetAuthUserId: userId, action: "platform_support_view_as",
        reason: "", outcome: "success",
        details: {
          membershipKey: membership.key,
          role: membership.role,
          scopeType: membership.scopeType,
          scopeId: membership.scopeId ?? "",
          interaction: "read_only_preview",
        },
      });
    } catch {
      console.warn("[admin:view-as] read-only preview audit unavailable");
    }

    return Response.json({
      ok: true,
      notice: "Read-only Super Admin preview. No approval, support reason, or user notification required. Administrator identity remains unchanged.",
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
