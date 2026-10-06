import { boundedRequest } from "@/lib/classes/request";
import { validSignature } from "@/lib/checkr/contracts";
import { processEvent } from "@/lib/checkr/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.CHECKR_SANDBOX_CLIENT_SECRET;
  if (
    !secret ||
    process.env.CHECKR_SANDBOX_APP_ORIGIN !==
      "https://staging-workforce.txkpro.com"
  )
    return new Response("Not configured", { status: 503 });
  let raw: string;
  try {
    raw = await (await boundedRequest(request, 1000000)).text();
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  if (!validSignature(raw, request.headers.get("x-checkr-signature"), secret))
    return new Response("Invalid signature", { status: 400 });
  try {
    const event = JSON.parse(raw);
    if (
      !/^(account\.credentialed|token\.deauthorized|invitation\.(created|completed|expired|deleted)|report\.(created|updated|completed|suspended|resumed))$/.test(
        String(event.type),
      )
    )
      return new Response("Ignored", { status: 200 });
    await processEvent(event);
    return new Response("Received", { status: 200 });
  } catch {
    return new Response("Retry required", { status: 503 });
  }
}
