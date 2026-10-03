import { jsonError } from "@/lib/http";
import { revokeInvitation } from "@/lib/invitations/repository";

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { invitationId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await revokeInvitation(
      decodeURIComponent(invitationId),
      typeof body.reason === "string" ? body.reason : null,
    );
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
