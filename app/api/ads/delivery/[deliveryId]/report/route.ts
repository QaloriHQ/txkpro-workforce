import { reportNativeAd } from "@/lib/ads/delivery-repository";

const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(["spam","scam","harassment","hate","threat","privacy","impersonation","misinformation","unsafe","illegal","other"]);

export async function POST(request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origin rejected" }, { status: 403, headers });
  const { deliveryId } = await params;
  const body = await request.json().catch(() => null);
  if (!uuid.test(deliveryId) || !body || !uuid.test(body.eventToken || "") || !reasons.has(body.reason) || typeof body.details !== "string" || body.details.length > 2000) {
    return Response.json({ error: "Invalid sponsored content report." }, { status: 400, headers });
  }
  try { return Response.json(await reportNativeAd(deliveryId, body.eventToken, body.reason, body.details, body.provider), { headers }); }
  catch (error) { return Response.json({ error: error instanceof Response ? await error.text() : "The report could not be submitted." }, { status: error instanceof Response ? error.status : 503, headers }); }
}
