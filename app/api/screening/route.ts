import { boundedRequest, classError } from "@/lib/classes/request";
import { workspace, quote, checkout, status, documents, dispatch, action } from "@/lib/authenticate/server";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(request: Request) {
    try {
        if (request.headers.get("origin") !== new URL(request.url).origin)
            throw new Response("Origin denied", { status: 403 });
        const input = await (await boundedRequest(request)).json();
        if (!input || typeof input !== "object" || Array.isArray(input) || !["institution", "employer"].includes(input.ownerType) || typeof input.ownerId !== "string")
            throw new Response("Workspace required", { status: 400 });
        let result;
        switch (input.op) {
            case "workspace":
                result = await workspace(input);
                break;
            case "quote":
                result = await quote(input);
                break;
            case "checkout":
                result = await checkout(input);
                break;
            case "status":
                result = await status(input);
                break;
            case "documents":
                result = await documents(input);
                break;
            case "dispatch":
                result = await dispatch(input);
                break;
            case "permission":
            case "bundle":
            case "approve":
            case "cancel":
                result = await action(input);
                break;
            default: throw new Response("Unsupported operation", { status: 400 });
        }
        return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        return classError(e instanceof Response ? e : new Response("Screening request is unconfirmed. Refresh this same request.", { status: 503 }));
    }
}
