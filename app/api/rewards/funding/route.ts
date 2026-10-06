import { boundedRequest, classError } from "@/lib/classes/request";
import {
  setupFunding,
  quoteFunding,
  createFundingCheckout,
  reconcileBacking,
} from "@/lib/rewards/funding-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new Response("Origin denied", { status: 403 });
    const input = await (await boundedRequest(request)).json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Response("Object required", { status: 400 });
    let result;
    switch (input.op) {
      case "setup":
        result = await setupFunding(input);
        break;
      case "quote":
        result = await quoteFunding(input);
        break;
      case "checkout":
        result = await createFundingCheckout(String(input.fundingId));
        break;
      case "backing":
        result = await reconcileBacking(String(input.fundingId));
        break;
      default:
        throw new Response("Unsupported funding action", { status: 400 });
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(
      e instanceof Response
        ? e
        : new Response(
            "Funding provider unavailable. Retry the same request safely.",
            { status: 503 },
          ),
    );
  }
}
