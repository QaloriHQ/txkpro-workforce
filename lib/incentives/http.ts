import "server-only";
import { after } from "next/server";
import { boundedRequest, classError } from "@/lib/classes/request";
import { incentiveRpc } from "./server";
import { runIncentiveJobs } from "./jobs";
export async function incentiveMutation(
  request: Request,
  op: string | readonly string[],
  fixed: Record<string, unknown> = {},
) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });
    const input = await (await boundedRequest(request, 128000)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      return Response.json({ error: "Object required" }, { status: 400 });
    const selected = typeof op === "string" ? op : (input.op ?? op[0]);
    if (typeof op !== "string" && !op.includes(selected))
      return Response.json({ error: "Valid action required" }, { status: 400 });
    const result = await incentiveRpc("incentive_action", {
      p_input: { ...input, ...fixed, op: selected },
    });
    after(async () => {
      try {
        await runIncentiveJobs();
      } catch {
        /* Existing lease and immutable request make retries safe. */
      }
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
