import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const [queue, versions] = await Promise.all([supabase.rpc("advertiser_admin_queue"),supabase.rpc("advertiser_admin_version_queue")]);
  if (queue.error || versions.error) return Response.json({ error: queue.error?.message ?? versions.error?.message }, { status: 403 });
  return Response.json({ ...queue.data, creativeVersions: versions.data }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const supabase = await createServerSupabaseClient();
  const result = body.operation === "delivery-correction"
    ? await supabase.rpc("advertiser_admin_delivery_correction", { p_delivery_id: body.deliveryId, p_action: body.action, p_reason: body.reason, p_provider_reference: body.providerReference || null, p_amount_minor: body.amountMinor ?? null })
    : body.targetType === "creative_version"
      ? await supabase.rpc("advertiser_admin_creative_version_review", { p_creative_version_id: body.targetId, p_decision: body.decision, p_notes: body.notes || null })
    : await supabase.rpc("advertiser_admin_review", { p_target_type: body.targetType, p_target_id: body.targetId, p_decision: body.decision, p_notes: body.notes || null, p_allocation_minor: null });
  const { data, error } = result;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json(data);
}
