import { jsonError } from "@/lib/http";
import {
  acceptUserInvitation,
  getRecipientInvitation,
} from "@/lib/invitations/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    if (!invitation.recipientExistingIdentity) {
      const password =
        typeof body.password === "string" ? body.password.trim() : "";
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
