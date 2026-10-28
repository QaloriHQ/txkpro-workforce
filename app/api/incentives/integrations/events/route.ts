import { after } from "next/server";
import { boundedRequest, classError } from "@/lib/classes/request";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  integrationHash,
  integrationEnvelope,
} from "@/lib/incentives/integration-contracts";
import { runIncentiveJobs } from "@/lib/incentives/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
    if (!token)
      return Response.json(
        { error: "Integration authentication required" },
        { status: 401 },
      );
    let payload;
    try {
      payload = integrationEnvelope(
        await (await boundedRequest(request, 32000)).json(),
      );
    } catch {
      return Response.json(
        { error: "Fresh valid event envelope required" },
        { status: 400 },
      );
    }
    const { data, error } = await createAdminClient().rpc("incentive_ingest", {
      p_token_hash: integrationHash(token),
      p_payload: payload,
    });
    if (error)
      return Response.json(
        { error: "Integration request denied" },
        { status: error.code === "42501" ? 403 : 400 },
      );
    after(async () => {
      try {
        await runIncentiveJobs(true);
      } catch {
        /* Durable queue and lease retain unconfirmed work. */
      }
    });
    return Response.json(data, {
      status: data.quarantined ? 202 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
