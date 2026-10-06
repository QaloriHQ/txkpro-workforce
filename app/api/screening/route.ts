import { authenticatedRpc } from "@/lib/rewards/server";
import { boundedRequest, classError } from "@/lib/classes/request";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Response("Object required", { status: 400 });
    return Response.json(
      await authenticatedRpc("screening_action", { p_input: input }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return classError(e);
  }
}
