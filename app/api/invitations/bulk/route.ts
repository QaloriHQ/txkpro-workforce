import { createAndSendInvitation } from "@/lib/invitations/service";
import type { WorkforceInvitationCreateInput } from "@/lib/invitations/types";

const MAX_BULK_INVITATIONS = 100;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      invitations?: WorkforceInvitationCreateInput[];
    };
    if (!Array.isArray(body.invitations) || body.invitations.length === 0) {
      return Response.json(
        { error: "Provide at least one invitation." },
        { status: 400 },
      );
    }
    if (body.invitations.length > MAX_BULK_INVITATIONS) {
      return Response.json(
        { error: `Bulk invitations are limited to ${MAX_BULK_INVITATIONS} records per request.` },
        { status: 400 },
      );
    }

    const results: Array<Record<string, unknown>> = [];
    for (const item of body.invitations) {
      try {
        const invitation = await createAndSendInvitation({
          ...item,
          source: item.source ?? "bulk",
        });
        results.push({
          email: item.email,
          ok: true,
          invitationId: invitation.invitationId,
          status: invitation.status,
        });
      } catch (error) {
        results.push({
          email: item.email,
          ok: false,
          error:
            error instanceof Response
              ? error.statusText || "Invitation failed."
              : error instanceof Error
                ? error.message
                : "Invitation failed.",
        });
      }
    }

    return Response.json({
      results,
      sent: results.filter((result) => result.ok === true).length,
      failed: results.filter((result) => result.ok !== true).length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Bulk invitation request failed." },
      { status: 400 },
    );
  }
}
