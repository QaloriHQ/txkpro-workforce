import { boundedRequest, classError } from "@/lib/classes/request";
import { incentiveRpc } from "@/lib/incentives/server";
import { after } from "next/server";
import { randomBytes } from "node:crypto";
import { integrationHash } from "@/lib/incentives/integration-contracts";
import { rewardApi } from "@/lib/rewards/server";
import { validGiftCard } from "@/lib/rewards/contracts";
import type { Extension } from "@/lib/incentives/contracts";
import { runIncentiveJobs } from "@/lib/incentives/jobs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });
    const input = await (await boundedRequest(request, 128000)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      return Response.json({ error: "Object required" }, { status: 400 });
    if (input.op === "engine_setup") {
      const workspace = await incentiveRpc<Extension>("incentive_workspace");
      const policy = workspace.configs.find(
        (c) => c.programId === input.programId,
      )?.published;
      if (!policy)
        return Response.json(
          { error: "Publish your program rules first." },
          { status: 400 },
        );
      const catalog = await rewardApi(
        "/api/v2/products?id=ALL_FEE_FREE&country=US&currency=USD",
      );
      const product = catalog.products?.find(
        (p: Record<string, unknown>) => p.id === input.productId,
      );
      const minimum =
        (policy.minimumCredits * policy.centsPerBlock) / policy.creditsPerBlock;
      const safety =
        (policy.safetyPoints * policy.centsPerBlock) / policy.creditsPerBlock;
      if (
        !product ||
        !Number.isSafeInteger(minimum) ||
        !validGiftCard(product, minimum) ||
        (policy.safetyMode !== "bank" &&
          policy.safetyPoints > 0 &&
          (!Number.isSafeInteger(safety) || !validGiftCard(product, safety)))
      )
        return Response.json(
          {
            error:
              "Choose a card and conversion that support both your redemption minimum and immediate safety reward.",
          },
          { status: 400 },
        );
    }
    const secret =
      input.op === "integration" ? randomBytes(32).toString("hex") : null;
    const result = await incentiveRpc<Record<string, unknown>>(
      "incentive_action",
      {
        p_input: {
          ...input,
          ...(secret ? { tokenHash: integrationHash(secret) } : {}),
        },
      },
    );
    after(async () => {
      try {
        await runIncentiveJobs();
      } catch {
        /* Retry remains in durable outbox. */
      }
    });
    return Response.json(
      { ...result, ...(secret ? { integrationToken: secret } : {}) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return classError(e);
  }
}
