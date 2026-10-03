import { jsonError } from "@/lib/http";
import {
  deliverUserInvitation,
  prepareUserInvitationResend,
} from "@/lib/invitations/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prepareUserInvitationResend(id);
    const delivery = await deliverUserInvitation(id);
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
