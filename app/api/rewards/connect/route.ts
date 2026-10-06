import { boundedRequest, classError } from "@/lib/classes/request";
import { beginConnect } from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    return Response.json(
      {
        url: await beginConnect(String(input.ownerType), String(input.ownerId)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return classError(e);
  }
}
