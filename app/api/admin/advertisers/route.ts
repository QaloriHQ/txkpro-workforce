import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("advertiser_admin_queue");
  if (error) return Response.json({ error: error.message }, { status: 403 });
  return Response.json(data, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("advertiser_admin_review", {
    p_target_type: body.targetType,
    p_target_id: body.targetId,
    p_decision: body.decision,
    p_notes: body.notes || null,
    p_allocation_minor: body.allocationMinor || null,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json(data);
}
