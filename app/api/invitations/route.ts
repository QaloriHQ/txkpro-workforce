import { jsonError } from "@/lib/http";
import {
  createAndDeliverUserInvitation,
  listUserInvitations,
  type UserInvitationCreateInput,
} from "@/lib/invitations/service";

const MAX_BULK_INVITATIONS = 100;

function invitationInput(value: unknown): UserInvitationCreateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Response("Invitation payload is required.", { status: 400 });
  }
  const item = value as Record<string, unknown>;
  return {
    email: typeof item.email === "string" ? item.email : "",
    role: typeof item.role === "string" ? item.role : "",
    scopeType: typeof item.scopeType === "string" ? item.scopeType : "",
    scopeId: typeof item.scopeId === "string" ? item.scopeId : null,
    institutionId:
      typeof item.institutionId === "string" ? item.institutionId : null,
    employerId: typeof item.employerId === "string" ? item.employerId : null,
    idempotencyKey:
      typeof item.idempotencyKey === "string" ? item.idempotencyKey : null,
    firstName: typeof item.firstName === "string" ? item.firstName : null,
    lastName: typeof item.lastName === "string" ? item.lastName : null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const data = await listUserInvitations({
      institutionId: url.searchParams.get("institutionId"),
      employerId: url.searchParams.get("employerId"),
      status: url.searchParams.get("status"),
    });
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const rawItems =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      Array.isArray((body as Record<string, unknown>).invitations)
        ? ((body as Record<string, unknown>).invitations as unknown[])
        : [body];

    if (!rawItems.length) {
      return Response.json(
        { error: "At least one invitation is required." },
        { status: 400 },
      );
    }
    if (rawItems.length > MAX_BULK_INVITATIONS) {
      return Response.json(
        { error: `Bulk invitation requests are limited to ${MAX_BULK_INVITATIONS} rows.` },
        { status: 400 },
      );
    }

    const results = [];
    for (const rawItem of rawItems) {
      const input = invitationInput(rawItem);
      try {
        const result = await createAndDeliverUserInvitation(input);
        results.push({
          ok: true,
          ...result,
        });
      } catch (error) {
        if (rawItems.length === 1) throw error;
        const status = error instanceof Response ? error.status : 500;
        let message = "Invitation failed.";
        if (error instanceof Error) message = error.message;
        results.push({
          ok: false,
          email: input.email,
          status,
          error: message,
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;
    return Response.json(
      {
        data: results,
        summary: {
          requested: results.length,
          succeeded: results.length - failed,
          failed,
        },
      },
      { status: failed === results.length ? 400 : 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
