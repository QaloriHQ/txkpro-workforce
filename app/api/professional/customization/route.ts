import { customize, customizationFailure, privateHeaders, requestKind } from "@/lib/professional-profile/customization";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) {
  try { const kind = requestKind(request); const input = await request.json().catch(() => null); if (!input || JSON.stringify(input).length > 3000 || input.op !== "layout") throw new Response("Invalid layout.", { status: 400 }); return Response.json(await customize(kind, input), { headers: privateHeaders }); }
  catch (e) { return customizationFailure(e); }
}
