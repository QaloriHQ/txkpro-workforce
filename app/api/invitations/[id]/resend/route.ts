import { jsonError } from "@/lib/http";
import {
  deliverUserInvitation,
  prepareUserInvitationResend,
} from "@/lib/invitations/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prepareUserInvitationResend(id);
    const body = await request.json().catch(() => ({})) as { requestKey?: string };
    const delivery = await deliverUserInvitation(id, typeof body.requestKey === "string" ? body.requestKey : crypto.randomUUID());
    if (!delivery.delivered) {
      return Response.json(
        { error: "Invitation delivery failed.", errorCode: delivery.errorCode },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, invitationId: id });
  } catch (error) {
    return jsonError(error);
  }
}
