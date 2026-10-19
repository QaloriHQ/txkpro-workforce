import { boundedRequest, classError } from "@/lib/classes/request";
import { openCandidateCheck } from "@/lib/checkr/candidate";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (new URL(request.url).origin !== "https://staging-workforce.txkpro.com" || request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (typeof input?.orderId !== "string") throw new Response("Order required", { status: 400 });
    return Response.json(await openCandidateCheck(input.orderId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return classError(e instanceof Response ? e : new Response("Checkr invitation unavailable. Try again later.", { status: 503 })); }
}
