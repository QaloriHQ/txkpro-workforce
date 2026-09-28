import { getAccountContext } from "@/lib/auth";
import { createProductionRequest, listProductionRequests } from "@/lib/concierge";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const account = await getAccountContext();
    if (!account) return Response.json({ error: "Sign in required" }, { status: 401 });
    const view = new URL(request.url).searchParams.get("view");
    if (view !== "institution" && view !== "employer" && view !== "admin")
      return Response.json({ error: "Invalid view" }, { status: 400 });
    return Response.json({ requests: await listProductionRequests(view) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !["institution", "employer"].includes(body.view))
      return Response.json({ error: "Invalid request" }, { status: 400 });
    const created = await createProductionRequest(body.view, body);
    return Response.json({ request: created }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
