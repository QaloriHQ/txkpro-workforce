import { jsonError } from "@/lib/http";
import { resendInvitation } from "@/lib/invitations/repository";

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { invitationId } = await params;
    const result = await resendInvitation(decodeURIComponent(invitationId));
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
