import { jsonError } from "@/lib/http";
import { revokeUserInvitation } from "@/lib/invitations/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let mode: "revoked" | "cancelled" = "revoked";
    try {
      const body = (await request.json()) as { mode?: unknown };
      if (body.mode === "cancelled") mode = "cancelled";
    } catch {
      // Empty bodies use the canonical revoke action.
    }
    const data = await revokeUserInvitation(id, mode);
    return Response.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
