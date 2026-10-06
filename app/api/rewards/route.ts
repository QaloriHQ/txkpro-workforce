import { boundedRequest, classError } from "@/lib/classes/request";
import {
  dispatchReward,
  refreshBalance,
  rewardAction,
  rewardWorkspace,
} from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await rewardWorkspace(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Response("Object required", { status: 400 });
    if (input.op === "refresh_balance") {
      await refreshBalance(String(input.ownerType), String(input.ownerId));
      return Response.json({ ok: true });
    }
    if (input.op === "dispatch") {
      await dispatchReward(String(input.requestId));
      return Response.json({ ok: true });
    }
    const result = await rewardAction(input);
    if (
      result.id &&
      result.status === "approved" &&
      ["redeem", "approve"].includes(input.op)
    ) {
      try {
        await dispatchReward(result.id);
      } catch {
        return Response.json(
          {
            error:
              "Request saved; provider result requires retry. Credits remain reserved.",
            requestId: result.id,
          },
          { status: 503 },
        );
      }
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
