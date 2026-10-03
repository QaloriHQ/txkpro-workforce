import { jsonError } from "@/lib/http";
import {
  createBulkInvitations,
  createInvitation,
  listInvitations,
} from "@/lib/invitations/repository";

const MAX_BULK_INVITATIONS = 100;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const invitations = await listInvitations({
      scopeType: url.searchParams.get("scopeType"),
      scopeId: url.searchParams.get("scopeId"),
      status: url.searchParams.get("status"),
      query: url.searchParams.get("q"),
    });
    return Response.json({ invitations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (Array.isArray(body.invitations)) {
      if (body.invitations.length === 0) {
        return Response.json(
          { error: "At least one invitation is required." },
          { status: 400 },
        );
      }
      if (body.invitations.length > MAX_BULK_INVITATIONS) {
        return Response.json(
          {
            error: `Bulk invitation requests are limited to ${MAX_BULK_INVITATIONS} rows.`,
          },
          { status: 400 },
        );
      }
      const result = await createBulkInvitations(body.invitations);
      return Response.json(result);
    }
    const result = await createInvitation({
      email: String(body.email ?? ""),
      role: String(body.role ?? ""),
      scopeType: String(body.scopeType ?? ""),
      scopeId: body.scopeId ? String(body.scopeId) : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {},
      expiresHours:
        typeof body.expiresHours === "number" ? body.expiresHours : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
