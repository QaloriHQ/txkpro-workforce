import { deliverUserInvitation, prepareUserInvitationResend, revokeUserInvitation } from "@/lib/invitations/service";
import { getPendingTargetInvitation, getPlatformAccount, isUuid } from "@/lib/admin/platform-users";
import {
  enforceSupportRateLimit, requirePlatformSuperAdmin, requireSupportRequest,
  supportErrorResponse, writeSupportAudit,
} from "@/lib/admin/platform-support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type SupportAction = "resend_pending_invitation" | "revoke_pending_invitation";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requirePlatformSuperAdmin();
    const { userId } = await params;
    if (!isUuid(userId)) throw new Response("Invalid account", { status: 400 });

    const raw = await request.text();
    if (raw.length > 1200) throw new Response("Request too large", { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const reason = requireSupportRequest(request, body);
    const action = body.action;
    if (action !== "resend_pending_invitation" && action !== "revoke_pending_invitation") {
      throw new Response("Unsupported support action", { status: 400 });
    }
    const invitationId = typeof body.invitationId === "string" ? body.invitationId : "";
    const target = await getPlatformAccount(userId);
    if (!target) throw new Response("Account not found", { status: 404 });
    const invite = await getPendingTargetInvitation(target, invitationId);
    if (!invite) throw new Response("No matching pending invitation", { status: 404 });

    await enforceSupportRateLimit(actor.authUserId, "platform_support_action_requested", 8);
    const details = { delegatedAction: action as SupportAction, invitationId };
    // The requested log is committed before any mutation. An audit outage
    // prevents the operation, and the canonical invitation RPC audits changes.
    await writeSupportAudit({
      actor, targetAuthUserId: userId,
      action: "platform_support_action_requested",
      reason, outcome: "success", details,
    });

    try {
      if (action === "resend_pending_invitation") {
        await prepareUserInvitationResend(invitationId);
        const delivery = await deliverUserInvitation(invitationId, crypto.randomUUID());
        if (!delivery.delivered) throw new Response("Invitation delivery failed", { status: 502 });
      } else {
        await revokeUserInvitation(invitationId, "revoked");
      }
      await writeSupportAudit({
        actor, targetAuthUserId: userId, action: "platform_support_action_completed",
        reason, outcome: "success", details,
      });
      return Response.json({ ok: true, action }, { headers });
    } catch {
      // Attempt evidence already exists even if outcome logging is unavailable.
      await writeSupportAudit({
        actor, targetAuthUserId: userId, action: "platform_support_action_completed",
        reason, outcome: "failed", details,
      }).catch(() => undefined);
      throw new Response("Canonical support workflow failed.", { status: 502 });
    }
  } catch (error) {
    return supportErrorResponse(error);
  }
}
