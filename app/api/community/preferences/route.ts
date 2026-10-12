import { updateCommunityLocation } from "@/lib/community/repository";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) {
  try {
    const input = await request.json().catch(() => ({}));
    return Response.json(await updateCommunityLocation(typeof input.location === "string" ? input.location : ""), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Response ? await error.text() : "The preference could not be updated." }, { status: error instanceof Response ? error.status : 503 }); }
}
