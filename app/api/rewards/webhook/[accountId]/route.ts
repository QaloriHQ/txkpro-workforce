import { boundedRequest } from "@/lib/classes/request";
import {
  dispatchReward,
  refreshBalance,
  rewardService,
  webhookAccount,
} from "@/lib/rewards/server";
import { providerFundingWebhook } from "@/lib/rewards/funding-server";
import { validSignature } from "@/lib/rewards/contracts";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    if (!/^[a-f0-9-]{36}$/.test(accountId))
      return new Response("Not found", { status: 404 });
    const raw = await (await boundedRequest(request, 100000)).text();
    const a = await webhookAccount(accountId);
    if (
      !a.tokens.webhookSecret ||
      !validSignature(
        raw,
        request.headers.get("Tremendous-Webhook-Signature"),
        a.tokens.webhookSecret,
      )
    )
      return new Response("Signature denied", { status: 401 });
    const event = JSON.parse(raw);
    if (
      typeof event.event !== "string" ||
      event.event.length > 100 ||
      typeof event.payload?.resource?.id !== "string" ||
      event.payload.resource.id.length > 100 ||
      !event.uuid
    )
      return new Response("Invalid event", { status: 400 });
    const receipt = await rewardService<{
      processed: boolean;
      requestId: string | null;
    }>({
      op: "webhook_record",
      accountId,
      eventId: event.uuid,
      event: event.event,
      resourceId: event.payload.resource.id,
    });
    if (receipt.processed) return Response.json({ ok: true });
    // Never trust payload amounts/status. Re-read canonical provider resources with this account's token.
    if (/^TOPUPS\./.test(event.event))
      await providerFundingWebhook(event.payload.resource.id);
    if (receipt.requestId) await dispatchReward(receipt.requestId, false);
    if (/^(FUNDING_SOURCES\.|TOPUPS\.|INVOICES\.)/.test(event.event))
      await refreshBalance(a.ownerType, a.ownerId, false);
    await rewardService({ op: "webhook_done", eventId: event.uuid });
    return Response.json({ ok: true });
  } catch {
    return new Response("Webhook requires retry", { status: 503 });
  }
}
