import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdDeliveryResult, AdPlacement } from "@/lib/ads/types";

export async function selectNativeAd(input: { placement: AdPlacement; contentId: string | null; requestKey: string }) {
  const viewer = await createServerSupabaseClient();
  const { data: auth } = await viewer.auth.getUser();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ad_delivery_select", {
    p_placement: input.placement,
    p_public_content_id: input.contentId,
    p_request_key: input.requestKey,
    p_auth_user_id: auth.user?.id ?? null,
  });
  if (error) throw new Error("Native advertising is temporarily unavailable.");
  return data as AdDeliveryResult;
}

export async function recordNativeAdEvent(deliveryId: string, eventToken: string, eventType: "viewable" | "clicked") {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ad_delivery_record", {
    p_delivery_id: deliveryId,
    p_event_token: eventToken,
    p_event_type: eventType,
  });
  if (error) throw new Error("The advertising event could not be recorded.");
  return data as { recorded: boolean; eventType: string; eventId: string };
}

export async function reportNativeAd(deliveryId: string, eventToken: string, reason: string, details: string, provider?: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(provider === "mgid" ? "external_ad_report" : "ad_delivery_report", {
    p_delivery_id: deliveryId,
    p_event_token: eventToken,
    p_reason: reason,
    p_details: details || null,
  });
  if (error) throw new Response("The sponsored content report could not be submitted.", { status: error.code === "42501" ? 403 : 400 });
  return data as { reported: boolean; reportId: string; caseId: string };
}
