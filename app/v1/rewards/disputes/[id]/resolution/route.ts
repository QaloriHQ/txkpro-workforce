import { boundedRequest, classError } from "@/lib/classes/request";
import { incentiveRpc } from "@/lib/incentives/server";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      !["verify", "decline_case"].includes(input.op)
    )
      return Response.json(
        { error: "Valid decision required" },
        { status: 400 },
      );
    return Response.json(
      await incentiveRpc("incentive_action", {
        p_input: { ...input, caseId: (await params).id },
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return classError(e);
  }
}
