import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { decision?: string };
    if (body.decision !== "approved" && body.decision !== "rejected") return Response.json({ error: "Invalid approval decision." }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("user_invitation_decide_approval", { p_invitation_id: id, p_decision: body.decision });
    if (error) throw new Response("Invitation approval is not permitted or is no longer pending.", { status: 403 });
    return Response.json({ data });
  } catch (error) { return jsonError(error); }
}
