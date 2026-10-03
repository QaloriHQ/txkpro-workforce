import { jsonError } from "@/lib/http";
import {
  acceptUserInvitation,
  getRecipientInvitation,
} from "@/lib/invitations/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVerifiedIdentity } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getVerifiedIdentity()) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await params;
    return Response.json({ data: await getRecipientInvitation(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const invitation = await getRecipientInvitation(id);
    const body = (await request.json().catch(() => ({}))) as {
      password?: unknown;
    };

    if (invitation.status !== "pending" && invitation.status !== "accepted") {
      return Response.json({ error: "This invitation is no longer active." }, { status: 409 });
    }
    if (invitation.status === "pending" && !invitation.recipientExistingIdentity) {
      const password =
        typeof body.password === "string" ? body.password : "";
      if (password.length < 8) {
        return Response.json(
          { error: "Choose a password with at least 8 characters." },
          { status: 400 },
        );
      }
      const supabase = await createServerSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    }

    const data = await acceptUserInvitation(id);
    return Response.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
