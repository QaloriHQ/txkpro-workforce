import { selectNativeAd } from "@/lib/ads/delivery-repository";
import type { AdPlacement } from "@/lib/ads/types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const placements = new Set<AdPlacement>(["in_feed", "in_comments", "in_article", "multiplex"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (process.env.ADS_DELIVERY_ENABLED !== "true") return Response.json({ ad: null, reason: "disabled" }, { headers });
  const params = new URL(request.url).searchParams;
  const placement = params.get("placement") as AdPlacement;
  const requestKey = params.get("requestKey") || "";
  const contentId = params.get("contentId") || null;
  if (!placements.has(placement) || !uuid.test(requestKey) || (contentId && contentId.length > 80)) {
    return Response.json({ error: "Invalid advertising request." }, { status: 400, headers });
  }
  try { return Response.json(await selectNativeAd({ placement, contentId, requestKey }), { headers }); }
  catch { return Response.json({ ad: null, reason: "no_fill", externalFallback: "disabled" }, { headers }); }
}
