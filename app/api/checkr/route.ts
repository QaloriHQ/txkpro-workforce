import { boundedRequest, classError } from "@/lib/classes/request";
import {
  authority,
  setup,
  catalog,
  quote,
  prepare,
  dispatch,
  reconcile,
  review,
} from "@/lib/checkr/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.employerId !== "string"
    )
      throw new Response("Workspace required", { status: 400 });
    let result: unknown;
    switch (input.op) {
      case "setup":
        result = await setup(input.employerId);
        break;
      case "workspace": {
        const { actor: _actor, ...view } = await authority(input);
        void _actor;
        result = view;
        break;
      }
      case "catalog":
        result = await catalog(input.employerId);
        break;
      case "quote":
        result = await quote(input);
        break;
      case "prepare":
        result = await prepare(input);
        break;
      case "dispatch":
        result = await dispatch(input.employerId, input.orderId);
        break;
      case "reconcile":
        result = await reconcile(input.employerId, input.orderId);
        break;
      case "approve":
      case "cancel":
        result = await review(input);
        break;
      default:
        throw new Response("Unsupported operation", { status: 400 });
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return classError(
      error instanceof Response
        ? error
        : new Response(
            "Checkr could not confirm this request. Resume the same request.",
            { status: 503 },
          ),
    );
  }
}
