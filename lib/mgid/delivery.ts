import "server-only";
import { logMgidDiagnostic } from "@/lib/mgid/diagnostics";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";
import { mgidPublicPage, requestMgidAd } from "@/lib/mgid/native-feed";
import type { AdPlacement, NativeAd } from "@/lib/ads/types";

export function mgidConfiguration() {
  return {
    configured: !!process.env.MGID_FEED_TOKEN,
    enabled: process.env.MGID_NATIVE_ENABLED === "true",
    filtersConfirmed: process.env.MGID_FILTERS_CONFIRMED === "true",
    productionAuthorized: process.env.MGID_PRODUCTION_AUTHORIZED === "true",
  };
}

export async function selectMgidAd(request: Request, input: { placement: AdPlacement; contentId: string | null; requestKey: string }): Promise<NativeAd | null> {
  const config = mgidConfiguration();
  if (!config.configured || !config.enabled || !config.filtersConfirmed ||
    (process.env.VERCEL_ENV === "production" && !config.productionAuthorized)) { logMgidDiagnostic({outcome: "disabled"}); return null; }
  const page = mgidPublicPage(request, input.contentId);
  // Vercel overwrites this trusted forwarding header. Do not trust arbitrary
  // x-forwarded-for chains or a client-supplied IP/query parameter.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : null;
  if (!page) { logMgidDiagnostic({outcome: "invalid_page"}); return null; }
  if (!ip || !isIP(ip)) { logMgidDiagnostic({outcome: "missing_ip"}); return null; }
  const token = process.env.MGID_FEED_TOKEN!;
  const admin = createAdminClient();
  const fingerprint = createHmac("sha256", token).update("mgid-rate:" + new Date().toISOString().slice(0,10) + ":" + ip).digest("hex");
  const { data: eventToken, error: reserveError } = await admin.rpc("external_ad_reserve", {
    p_delivery_id: input.requestKey, p_fingerprint: fingerprint, p_placement: input.placement,
  });
  if (reserveError || !eventToken) { logMgidDiagnostic({outcome: "reservation_rejected"}); return null; }
  const creative = await requestMgidAd({ token, ip, userAgent: request.headers.get("user-agent") || "",
    language: request.headers.get("accept-language") || "en", page,
    sourceId: "txkpro.com:" + input.placement,
    onDiagnostic: logMgidDiagnostic,
    excludedCategories: (process.env.MGID_EXCLUDED_CATEGORY_IDS || "").split(",").map(value => value.trim()).filter(Boolean),
  });
  if (!creative) return null;
  const ad: NativeAd = { provider: "mgid", deliveryId: input.requestKey, eventToken,
    placement: input.placement, advertiserName: creative.advertiserName,
    headline: creative.headline, body: creative.body, imageUrl: creative.imageUrl, imageAlt: "",
    destinationUrl: creative.destinationUrl, ctaLabel: "Learn more" };
  // No IP, UA, page URL, token, CPC or provider tracking URLs in stored evidence.
  const snapshot = { provider: "mgid", creativeId: creative.creativeId, category: creative.category,
    headline: creative.headline, body: creative.body, advertiserName: creative.advertiserName };
  const { error } = await admin.from("wf_external_ad_deliveries").update({ creative_id: creative.creativeId, snapshot }).eq("delivery_id", ad.deliveryId);
  if (error) { logMgidDiagnostic({outcome: "storage_error"}); return null; }
  const { error: eventError } = await admin.from("wf_external_ad_events").insert({ delivery_id: ad.deliveryId, event_type: "served" });
  logMgidDiagnostic({outcome: eventError ? "storage_error" : "accepted"});
  return eventError ? null : ad;
}

export async function recordMgidEvent(deliveryId: string, eventToken: string, eventType: "viewable" | "clicked") {
  const admin = createAdminClient();
  const { data, error } = await admin.from("wf_external_ad_deliveries").select("delivery_id")
    .eq("delivery_id", deliveryId).eq("event_token", eventToken).not("snapshot", "is", null)
    .gte("created_at", new Date(Date.now()-86400000).toISOString()).maybeSingle();
  if (error || !data) throw new Error("Invalid external delivery");
  const { error: writeError } = await admin.from("wf_external_ad_events").upsert(
    { delivery_id: deliveryId, event_type: eventType }, { onConflict: "delivery_id,event_type", ignoreDuplicates: true });
  if (writeError) throw new Error("External measurement unavailable");
  return { recorded: true, eventType };
}

export async function mgidEventCounts() {
  const since = new Date(Date.now() - 86400000).toISOString();
  return Promise.all((["served", "viewable", "clicked"] as const).map(async eventType => {
    const { count, error } = await createAdminClient().from("wf_external_ad_events")
      .select("delivery_id", { count: "exact", head: true }).eq("event_type", eventType).gte("created_at", since);
    return { eventType, count: error ? null : count ?? 0 };
  }));
}
