import { connect } from "@/lib/checkr/server";
import { boundedRequest, classError } from "@/lib/classes/request";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    const employerId = new URL(request.url).searchParams.get("employer") || "";
    return Response.json(await connect(employerId, input?.code), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return classError(
      error instanceof Response
        ? error
        : new Response("Checkr connection could not be confirmed.", {
            status: 503,
          }),
    );
  }
}
