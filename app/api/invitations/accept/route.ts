import {
  acceptMyInvitation,
  getMyInvitation,
} from "@/lib/invitations/service";

export async function GET(request: Request) {
  try {
    const invitationId = new URL(request.url).searchParams.get("invitationId");
    if (!invitationId) {
      return Response.json(
        { error: "Invitation id is required." },
        { status: 400 },
      );
    }
    const invitation = await getMyInvitation(invitationId);
    return Response.json({ invitation });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Response
            ? error.statusText || "Unable to load invitation."
            : error instanceof Error
              ? error.message
              : "Unable to load invitation.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { invitationId?: string };
    if (!body.invitationId) {
      return Response.json(
        { error: "Invitation id is required." },
        { status: 400 },
      );
    }

    const result = await acceptMyInvitation(body.invitationId);
    if (!result.ok) {
      return Response.json(
        { error: result.message ?? "Invitation cannot be accepted.", invitation: result },
        { status: result.status === "expired" ? 410 : 409 },
      );
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Response
            ? error.statusText || "Unable to accept invitation."
            : error instanceof Error
              ? error.message
              : "Unable to accept invitation.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
