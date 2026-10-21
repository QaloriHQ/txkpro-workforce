import { recordMgidEvent } from "@/lib/mgid/delivery";
import { recordNativeAdEvent } from "@/lib/ads/delivery-repository";

const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const body = await request.json().catch(() => null);
  if (!uuid.test(deliveryId) || !body || !uuid.test(body.eventToken || "") || !["viewable", "clicked"].includes(body.eventType)) {
    return Response.json({ error: "Invalid advertising event." }, { status: 400, headers });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origin rejected" }, { status: 403, headers });
  try { return Response.json(await (body.provider === "mgid" ? recordMgidEvent : recordNativeAdEvent)(deliveryId, body.eventToken, body.eventType), { headers }); }
  catch { return Response.json({ error: "Advertising measurement is temporarily unavailable." }, { status: 503, headers }); }
}
