import { fundingWebhook } from "@/lib/rewards/funding-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  // Bound the raw body before signature verification; never parse/re-serialize it.
  const reader = request.body?.getReader();
  if (!reader) return new Response("Body required", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 262144) {
      await reader.cancel();
      return new Response("Too large", { status: 413 });
    }
    chunks.push(value);
  }
  try {
    await fundingWebhook(
      Buffer.concat(chunks).toString("utf8"),
      request.headers.get("stripe-signature") || "",
    );
    return Response.json({ received: true });
  } catch (e) {
    return new Response("Webhook not confirmed", {
      status: e instanceof Response ? e.status : 400,
    });
  }
}
