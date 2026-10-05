import { boundedRequest, classError } from "@/lib/classes/request";
import { pointsAction, pointsWorkspace } from "@/lib/pro-points/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await pointsWorkspace(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Origin denied" }, { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      return Response.json({ error: "Object required" }, { status: 400 });
    return Response.json(await pointsAction(input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
